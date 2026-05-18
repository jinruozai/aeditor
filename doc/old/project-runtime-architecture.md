# Aiditor Project Runtime Architecture

This document defines the final architecture for Aiditor as a local-first,
AI-editable editor runtime.

The goal is not to add another parallel plugin system. The goal is to make every
editor built on Aiditor follow one simple shape:

> Open a directory, read its project descriptor, load its registered editor
> capabilities, mount its dock layout, and let AI edit the project through
> bounded file and operation tools.

The Dock / Panel / Component runtime stays the visual and lifecycle foundation.
The Project Runtime adds a file-backed application layer above it.

## 1. Design Goals

1. One programming model.
   Built-in panels, app panels, AI-generated panels, and project panels all use
   the same `aiditor.registerComponent` / `factory(propsSig, ctx)` component model.

2. File-backed by default.
   Serious AI-created code should live in files, not long tool-call strings.
   Files can be searched, read in ranges, patched, versioned, and recovered.

3. Dynamic panels remain useful as drafts.
   `aiditor.createPanel` is still the fast path for one-shot UI generation, but
   the long-term path is "promote to project file".

4. Open directory equals open editor.
   A user can select `game-data-editor`, `gbox-ani-editor`, or a future editor
   project directory and Aiditor can mount the corresponding app.

5. AI works like a code agent.
   AI should search files, read small ranges, patch with base hashes, reload the
   project, and inspect runtime health. It should not repeatedly fetch or resend
   whole panel sources.

6. Strong lifecycle ownership.
   Everything registered by a project has an owner. Closing or reloading the
   project removes panels, components, commands, tools, references, operations,
   settings, menus, styles, and event subscriptions owned by that project.

7. Stable failure behavior.
   A broken project should show a recovery surface, not break the host editor.
   The previous good runtime can remain active until a reload succeeds.

8. Browser and desktop both work.
   File access is provided through a workspace adapter. Browser builds can use
   the File System Access API. Desktop or bridge builds can provide a stronger
   adapter. The project runtime does not hard-code one transport.

## 2. Core Mental Model

Aiditor has three layers:

```text
Host Shell
  owns global aiditor runtime, project picker, permissions, recovery UI

Project Runtime
  opens a workspace directory, loads aiditor.project.json,
  installs project-owned registrations, mounts a layout

Editor Runtime
  Dock / Panel / Component / UI / Bus / AI Reference / Operation systems
```

The shell is stable. Projects are replaceable.

```text
User selects directory
  -> aiditor.workspace opens an authorized root
  -> aiditor.project reads aiditor.project.json
  -> project entry registers panels/tools/resources
  -> aiditor.createDockLayout mounts layout into the host dock
  -> AI tools operate against the same workspace and runtime owner
```

## 3. Project Directory Contract

The preferred project shape is:

```text
my-editor/
  aiditor.project.json
  layout.json
  src/
    main.js
    panels/
      inventory.panel.js
      equipment.panel.js
    components/
      item-slot.component.js
    tools/
      data-tools.js
    resources/
      project-resources.js
  data/
    characters.json
  assets/
    icons/
  ai/
    rules.md
    skills/
```

This is a convention, not a prison. The descriptor controls exact entry files.

### 3.1 Descriptor

`aiditor.project.json` is the single discovery file.

```json
{
  "type": "aiditor-project",
  "schemaVersion": 1,
  "id": "game-data-editor",
  "title": "GameDataEditor",
  "kind": "app",
  "entry": {
    "type": "script",
    "src": "src/main.js",
    "symbol": "GDEApp"
  },
  "layout": "layout.json",
  "styles": ["src/app.css"],
  "permissions": {
    "workspace.read": true,
    "workspace.write": true,
    "project.code.load": true
  }
}
```

Fields:

| Field | Meaning |
| --- | --- |
| `type` | Must be `aiditor-project`. |
| `schemaVersion` | Descriptor schema version. |
| `id` | Stable project id, used in owners and persistence. |
| `title` | Display title. |
| `kind` | `app`, `plugin`, or `workspace`. |
| `entry` | JavaScript entry loaded by the project runtime. |
| `layout` | Optional layout data file. |
| `styles` | Project CSS files. |
| `permissions` | Declared workspace and runtime permissions. |

Entry forms:

```json
{ "type": "script", "src": "src/main.js", "symbol": "GDEApp" }
{ "type": "script", "src": "dist/editor.bundle.js", "symbol": "GObjAniEditor" }
{ "type": "module", "src": "src/main.js", "export": "default" }
```

`script` entries are classic same-page scripts. They may expose a global symbol
with `setup` / `mount` methods, or call `aiditor.project.define(...)` while loading.
The loader normalizes either form into the same project spec shape.

`module` entries are loaded through dynamic import when the host environment
supports it. The exported value follows the same project spec shape.

### 3.2 Project Kinds

`app`

Full editor applications. Selecting this directory mounts the app into the host
main surface. `game-data-editor` and `gbox-ani-editor` belong here.

`plugin`

Contributes components, panels, tools, references, commands, settings, or menus
to an already open app. It does not own the whole shell.

`workspace`

Pure data/content directory opened by an app. A GameDataEditor game data folder
is a workspace, not the GameDataEditor app itself.

## 4. Project Entry API

Project entries register capabilities through one owner-scoped context.

```js
aiditor.project.define({
  id: 'game-data-editor',
  title: 'GameDataEditor',

  setup: function (ctx) {
    ctx.component('gde.tables', TablesPanel)
    ctx.component('gde.inspector', InspectorPanel)
    ctx.tool('gde.patchTable', patchTableTool)
    ctx.reference('gde.table', tableReferenceProvider)
  },

  mount: function (container, ctx) {
    return ctx.createDockLayout(container, {
      tree: ctx.layout || createDefaultLayout(),
    })
  },
})
```

`aiditor.project.define(spec)` is the canonical project registration entry point.
`setup(ctx)` installs registrations. `mount(container, ctx)` creates the running
UI and returns a handle with `destroy()`.

The project context is the only object project code needs:

```js
ctx.projectId          // stable project id, e.g. 'game-data-editor'
ctx.owner              // active runtime owner, e.g. 'project:game-data-editor'
ctx.workspace          // bounded file access
ctx.bus                // owner-aware bus helper
ctx.settings           // project settings helpers
ctx.layout             // loaded layout data, if present
ctx.component(id, spec)
ctx.command(id, spec)
ctx.tool(id, spec)
ctx.reference(id, spec)
ctx.operation(id, spec)
ctx.menu(id, spec)
ctx.style(path)
ctx.createDockLayout(container, config)
ctx.onCleanup(fn)
```

All helpers attach `owner: ctx.owner` automatically.

## 5. Component Model

There is one component shape:

```js
function InventoryPanel(propsSig, ctx) {
  const root = aiditor.ui.h('div', 'inventory-panel')

  ctx.bus.on('inventory:selected', function (item) {
    // update panel
  })

  return root
}
```

The same function can be:

- registered by a built-in module
- registered by an app project
- generated as a session draft
- promoted into `src/panels/inventory.panel.js`
- imported by another project entry

The same context rules apply everywhere:

- Use `ctx.bus` for panel-to-panel communication.
- Use `ctx.onCleanup` for non-UI resources.
- Use `aiditor.ui.*` components when available.
- Floating overlays should use `aiditor.ui.tooltip`, `aiditor.ui.popover`, `aiditor.ui.menu`,
  or `aiditor.ui.registerScopedOverlay`.
- Panel root layout must be responsive inside a resizable dock.

## 6. Workspace Runtime

`aiditor.workspace` is the file access boundary.

```js
workspace.rootId()
workspace.kind()              // 'browser-fsa', 'bridge', 'memory'
workspace.list(path)
workspace.read(path)
workspace.write(path, text, options)
workspace.patch(path, baseHash, patches)
workspace.search(query, options)
workspace.stat(path)
workspace.watch(path, handler)
workspace.resolveUrl(path)
```

Rules:

1. All paths are relative to the authorized root.
2. `..` escape is rejected by the adapter.
3. Writes require declared permission.
4. Patch operations require a matching `baseHash`.
5. Large reads return metadata plus a preview unless explicitly requested.
6. Binary assets are not injected into model context by default.
7. Writes are atomic where the adapter supports it.
8. Delete operations are separate from writes and require explicit permission.

The runtime can support multiple adapters:

| Adapter | Use |
| --- | --- |
| Browser File System Access | User-selected local directories in Chromium. |
| Local bridge | Desktop or local helper process with stronger filesystem APIs. |
| Memory | Tests, demos, and safe fallback. |

## 7. AI Development Tools

AI should work against files and runtime state, not raw full-source blobs.

Core tools:

```text
project.searchFiles
project.readFile
project.readFileRange
project.writeFile
project.patchFile
project.createFile
project.deleteFile
project.promotePanel
project.readDescriptor
project.updateDescriptor
project.reload
project.inspectPanel
project.runCheck
```

Default behavior:

- Search before reading large files.
- Read ranges, not entire files.
- Patch with `baseHash`.
- Reload after code changes.
- Inspect panel health before claiming success.
- Treat deletes and broad rewrites as high-risk operations with preview.

### 7.1 Source Projections

References to project source support projections:

| Projection | Result |
| --- | --- |
| `summary` | id, title, file path, hash, size, exports, panel health. |
| `outline` | top-level functions, component registrations, bus topics, events. |
| `events` | `ctx.bus`, `aiditor.bus`, DOM events, cleanup handlers. |
| `search` | query matches with surrounding lines. |
| `range` | exact line range. |
| `full` | full source, explicit only. |

This mirrors how code agents work with real repositories.

## 8. Dynamic Panel Drafts

`aiditor.createPanel` remains as the fast drafting path.

```text
User asks for quick UI
  -> AI calls aiditor.createPanel
  -> session-owned draft panel appears
  -> user likes it
  -> AI or user promotes it to project file
```

Promotion writes:

```text
src/panels/<id>.panel.js
layout.json
```

Then the draft extension is removed and the project reloads from files. From
that point on, AI modifies the panel with file search and patch tools.

This keeps experimentation fast while making durable work maintainable.

## 9. Layout Model

`layout.json` stores the serializable Dock tree.

```json
{
  "root": {
    "type": "split",
    "direction": "horizontal",
    "children": [
      {
        "type": "dock",
        "name": "sidebar",
        "panels": [
          { "component": "gde.tables", "title": "Tables" }
        ]
      },
      {
        "type": "dock",
        "name": "main",
        "panels": []
      }
    ],
    "sizes": [0.22, 0.78]
  }
}
```

The project runtime converts this into the existing `aiditor.dock`, `aiditor.panel`, and
`aiditor.split` tree shape. The Dock runtime remains the only layout engine.

Open panels created by users can be persisted back to `layout.json` when the
project opts into layout persistence.

## 10. Registry and Ownership

A project has a stable identity and an active runtime owner.

Stable identity:

```js
projectId: '<project-id>'
stableOwner: 'project:<project-id>'
```

Runtime owner:

```js
owner: 'project:<project-id>'              // normal load
owner: 'project:<project-id>@<version>'    // staged reload candidate
layer: 'project'
```

Most code only sees the stable project id. Registries use the runtime owner so
reload can stage a candidate without colliding with the last good runtime.

Owner-scoped unload removes:

- components
- commands
- menus
- settings
- AI references
- AI operations
- AI tools
- extension entries
- dock panels owned by the project
- styles injected by the project
- bus subscriptions registered through project context

Ownerless framework entries remain untouched.

## 11. Permissions and Safety

Project code is trusted by the user who opened the directory, but it is still
mediated by explicit runtime surfaces where the framework controls access.

Important boundary:

Same-page `script` and `module` entries are not a JavaScript sandbox. Once loaded
into the page, trusted project code can use ordinary browser APIs available to
that origin. The workspace API bounds Aiditor and AI file access, but it does
not magically confine arbitrary same-page JavaScript. Therefore:

1. Only load same-page project code after the user grants `project.code.load`.
2. Treat opened app projects like trusted local applications.
3. Use iframe/worker isolation for future untrusted project modes.
4. Keep AI file operations inside `aiditor.workspace` even when project code is trusted.

Permission categories:

| Permission | Meaning |
| --- | --- |
| `workspace.read` | Read files under the selected root. |
| `workspace.write` | Write files under the selected root. |
| `workspace.delete` | Delete files under the selected root. |
| `project.code.load` | Load project JavaScript into the page. |
| `project.reload` | Reload project runtime. |
| `ai.tools.register` | Register AI tools. |
| `ai.operations.apply` | Apply project operations. |

The host may grant full access for a trusted project. In that mode, UI should
not show approval controls for already allowed operations.

Failure boundaries:

1. Descriptor parse failure shows a project load error.
2. Entry load failure shows a project load error.
3. Setup failure rolls back owner registrations.
4. Mount failure leaves the host shell alive.
5. Reload failure keeps the last good project mounted when possible.
6. Panel factory failure shows a panel error box and records `aiditor.log`.

## 12. Reload and Recovery

Project reload is transactional within the limits of the same-page registry:

```text
read descriptor
load changed files
preflight descriptor and source metadata
prepare descriptor, layout, and entry spec while the old runtime is still active
dispose the old owner only after preparation succeeds
run setup and mount the candidate
restore the old descriptor/spec snapshot if activation fails
```

If descriptor, layout, or entry preparation fails, the old runtime remains
active. If setup or mount fails after the old owner has been disposed, the
runtime restores the previous descriptor/spec snapshot and remounts it.

Same public component ids cannot be registered twice in the global component
registry during staging. A project runtime must therefore use one of two
strategies:

1. Versioned staging owner: install the candidate under
   `project:<id>@<version>` and swap aliases only after smoke checks pass.
2. Snapshot rollback: unload the old owner, install the candidate, and restore
   the previous owner snapshot if setup or mount fails.

Aiditor's zero-build same-page runtime uses snapshot rollback today because
it keeps the component model simple and avoids an alias layer in the registry.
Versioned staging can be added later only if the registry grows first-class
public-id aliasing.

Recovery surfaces:

- project load error panel
- safe mode: load descriptor but skip project code
- owner cleanup command
- clear project-generated session drafts
- open project files for AI repair

## 13. App Project Integration

### 13.1 GameDataEditor

Current state:

- Static app with `index.html`.
- Multi-file IIFE source under `src/`.
- Panels already use `aiditor.registerComponent`.
- Layout is created in `src/main.js`.
- Project IO and AI domain tools already exist.

Recommended final shape:

```text
game-data-editor/
  aiditor.project.json
  src/main.js
  src/panels/
  src/ai/
```

Refactor `src/main.js` from immediate mount into:

```js
window.GDEApp = {
  mount: function (container, options) {},
  destroy: function () {},
}
```

Then `index.html` can call `GDEApp.mount(document.getElementById('app'))`, while
the Aiditor host can mount the same app into a dock.

### 13.2 GBox Ani Editor

Current state:

- ES module source.
- Bundled IIFE output in `dist/gobjani-editor.bundle.js`.
- Already exposes `GObjAniEditor.mount`, `createTree`, and `registerComponents`.
- Uses Aiditor panels and bus topics.

Recommended final shape:

```text
gbox-ani-editor/
  aiditor.project.json
  dist/gobjani-editor.bundle.js
  demo/style.css
```

The descriptor can point to the bundle first. Later, a module-capable loader can
load source modules directly.

## 14. File-Backed Project vs Extension Runtime

The Extension Runtime remains the lifecycle shell for registered contributions.
The Project Runtime owns source files and project loading.

Relationship:

```text
Project Runtime
  reads files and descriptor
  creates owner scope
  loads entry
  calls setup

Extension / Registry Runtime
  registers components/tools/resources/commands
  tracks owner
  supports rollback and disable

Dock Runtime
  mounts panels and handles UI lifecycle
```

`aiditor.createPanel` can continue to wrap a factory source as a session extension.
Promotion converts that session extension into project files.

## 15. Minimal Public API

```js
aiditor.project.open(workspace, options)
aiditor.project.close(id)
aiditor.project.reload(id)
aiditor.project.current()
aiditor.project.list()

aiditor.project.define(spec)       // called by project entry
aiditor.project.promotePanel(input)

aiditor.workspace.openDirectory(options)
aiditor.workspace.fromHandle(handle)
aiditor.workspace.fromBridge(root)
aiditor.workspace.memory(files)
```

The host usually needs only:

```js
const workspace = await aiditor.workspace.openDirectory()
const project = await aiditor.project.open(workspace, { mount: container })
```

## 16. Implementation Phases

Phase 1: Project Descriptor and Mount API

- Add `aiditor.project.define`.
- Add descriptor loader.
- Add project owner cleanup.
- Support app projects with script/style entries and a global mount function.
- Convert GBox Ani through descriptor only.

Phase 2: Workspace Adapter

- Add bounded workspace API.
- Add browser File System Access adapter.
- Add memory adapter for tests.
- Add bridge adapter later if needed.

Phase 3: File AI Tools

- Add search/read range/patch/write/reload/inspect tools.
- Add source projections.
- Make AI default to file tools for project code.

Phase 4: Promote Draft to Project

- Convert `aiditor.createPanel` session panels into project panel files.
- Update `layout.json`.
- Reload project.

Phase 5: GDE Integration

- Extract `GDEApp.mount`.
- Add descriptor.
- Register GDE domain resources/tools through project context.
- Keep standalone `index.html` compatibility by calling the same mount API.

Phase 6: Hardening

- Transactional reload.
- Last-good runtime.
- Safe mode.
- Project recovery UI.
- Permission polish.

## 17. Non-Goals

- No second component model.
- No project-specific dock implementation.
- No AI-only UI API.
- No full-source reads as the default editing path.
- No unbounded filesystem access from project or AI code.
- No mandatory build system for projects that do not need one.

## 18. Final Shape

Aiditor becomes:

```text
Dock UI framework
+ owner-aware registry runtime
+ local workspace runtime
+ file-backed project runtime
+ AI code-editing tools
```

The result is a simple and powerful system:

- Open a directory to run an editor.
- Let AI create drafts quickly.
- Promote good drafts into files.
- Let AI maintain those files like a code agent.
- Keep every panel on the same Dock / Panel / Component model.
- Keep the host stable when project code fails.
