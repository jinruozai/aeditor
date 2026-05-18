# aiditor

A zero-dependency, zero-build frontend framework for building Blender-style web
editors with optional AI and extension runtime layers.

[![npm](https://img.shields.io/npm/v/@gooooo/aiditor.svg)](https://www.npmjs.com/package/@gooooo/aiditor)
[![license](https://img.shields.io/npm/l/@gooooo/aiditor.svg)](./LICENSE)

aiditor keeps the editor kernel small: docks, panels, registered components,
theme tokens, settings, commands, workspace contracts, and a compact reactive
runtime. UI widgets, AI Host, and Extension Runtime are layered on top, not
hidden requirements.

```text
Kernel        core services, component registry, tree, dock runtime
UI            widgets, settings panel, built-in tab/log panels
AI            agents, providers, tools, references, operations, ChangeSet
Extensions    package/review/install/disable contributions
Host App      project model, domain data, privileged bridges
```

## Why

Most editors need the same stable primitives:

- split and mergeable dock layout
- tabbed panels with preserved state
- reusable UI controls and property editors
- settings, commands, logs, themes, and workspace access
- optional AI that can read editor context and apply reviewed changes

aiditor gives those primitives one model:

```text
Layout
`-- Dock
    |-- Toolbar
    |   `-- Component
    `-- Panel
        `-- Component
```

`Component` is the only UI registration unit. Panels and toolbar items are plain
data records that reference registered components by name. Inactive panels are
detached from the DOM, not hidden with CSS, so heavy editors keep their state
without paying layout and paint cost in the background.

## Bundles

Use **Kernel** for the smallest dock/component runtime. It includes core
services, component registration, immutable dock tree helpers, dock runtime,
theme tokens, commands, settings, workspace contracts, and dock CSS. It does
not include `aiditor.ui.*`, built-in tab/log panels, AI, or extensions:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-kernel.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-kernel.js"></script>
```

Add **UI** when you want the built-in `aiditor.ui.*` widgets, settings UI, and
tab/log panel components:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-kernel.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-ui.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-kernel.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-ui.js"></script>
```

Use **Core** when you want the classic editor framework bundle in one file:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-core.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-core.js"></script>
```

Use **Full** when you also want AI Host and Extension Runtime:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-full.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-full.js"></script>
```

Classic `dist/aiditor.js` and `dist/aiditor.css` are Core aliases. `aiditor-ai`
is also available as an add-on for hosts that already loaded Kernel and UI:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-ai.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aiditor@1/dist/aiditor-ai.js"></script>
```

Published npm packages contain only runtime dist files, this README, and the
license.

```bash
npm install @gooooo/aiditor
```

Everything is exposed through `window.aiditor`.

## Quick Start

```html
<div id="app" style="height:100vh"></div>
<link rel="stylesheet" href="./dist/aiditor-core.css">
<script src="./dist/aiditor-core.js"></script>
<script>
aiditor.registerComponent('demo.editor', {
  category: 'panel',
  defaults: function () {
    return { title: 'Editor', icon: 'file-text', props: { file: 'main.js' } }
  },
  factory: function (propsSig, ctx) {
    var root = document.createElement('div')
    root.style.cssText = 'height:100%;min-height:0;box-sizing:border-box;padding:12px'

    var title = document.createElement('strong')
    var body = document.createElement('pre')
    body.style.marginTop = '12px'
    root.append(title, body)

    ctx.onCleanup(aiditor.effect(function () {
      var props = propsSig() || {}
      title.textContent = props.file || 'untitled'
      body.textContent = 'Build your editor panel here.'
    }))

    return root
  },
})

var tree = aiditor.split('horizontal', [
  aiditor.dock({
    name: 'main',
    toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
    panels: [
      aiditor.panel({ component: 'demo.editor', title: 'main.js', props: { file: 'main.js' } }),
      aiditor.panel({ component: 'demo.editor', title: 'style.css', props: { file: 'style.css' } }),
    ],
  }),
  aiditor.dock({
    name: 'side',
    toolbar: { direction: 'top', items: [{ component: 'tab-compact' }] },
    panels: [
      aiditor.panel({ component: 'log', title: 'Log', icon: 'list' }),
    ],
  }),
], [0.7, 0.3])

var layout = aiditor.createDockLayout(document.getElementById('app'), {
  tree: tree,
  dockMenu: true,
  lru: { max: -1 },
})
</script>
```

`dockMenu: true` enables the optional built-in dock command menu. Omit it when
your host wants to provide its own menu surface.

## Core Concepts

### Component

```js
aiditor.registerComponent('example.panel', {
  category: 'panel',
  defaults: function () {
    return { title: 'Example', icon: 'box', props: {} }
  },
  factory: function (propsSig, ctx) {
    var el = document.createElement('div')
    return el
  },
  dispose: function (el) {},
  serialize: function (el) { return {} },
  deserialize: function (el, state) {},
})
```

Rules:

- Use plain JavaScript IIFEs or scripts. No modules, imports, JSX, TSX, or build
  step are required.
- Props should be JSON-serializable plain objects.
- Use `propsSig.peek()` for one-shot reads and `propsSig()` inside
  `aiditor.effect(...)` for reactive reads.
- Use `ctx.onCleanup(...)` for effects, subscriptions, timers, and overlays.
- Panel roots should fit resizable docks: `height:100%`, `min-height:0`, and
  responsive flex/grid layout.

### Context

Every component factory receives `ctx`:

```js
ctx.panel.title()
ctx.panel.setTitle('New Title')
ctx.panel.setDirty(true)
ctx.panel.updateProps({ file: 'next.js' })
ctx.panel.close()
ctx.panel.popOut()
ctx.panel.promote()

ctx.dock.panels()
ctx.dock.activeId()
ctx.dock.addPanel({ component: 'example.panel', title: 'New' })
ctx.dock.activatePanel(panelId)
ctx.dock.toggleFocus()

ctx.bus.emit('topic', payload)
ctx.bus.on('topic', function (payload) {})

ctx.active
ctx.onCleanup(function () {})
```

Static toolbar components have `ctx.dock` but no `ctx.panel`.

### Layout API

`createDockLayout` returns the runtime handle:

```js
layout.addPanel(dockIdOrName, partialPanel, opts)
layout.removePanel(panelId)
layout.activatePanel(panelId)
layout.promotePanel(panelId)
layout.movePanel(panelId, targetDockIdOrName, targetIndex)
layout.splitDock(dockIdOrName, 'horizontal', 'after', 0.5)
layout.mergeDocks(winnerDockIdOrName, loserDockIdOrName)
layout.tree()
layout.setTree(nextTree)
layout.subscribe(function (tree) {})
layout.destroy()
```

The immutable tree helpers are also public:

```js
aiditor.addPanel(tree, dockId, partial, opts)
aiditor.removePanel(tree, panelId)
aiditor.activatePanel(tree, panelId)
aiditor.movePanel(tree, panelId, targetDockId, targetIndex)
aiditor.movePanelToSplit(tree, panelId, targetDockId, direction, side, ratio)
aiditor.splitDock(tree, dockId, direction, side, ratio, opts)
aiditor.mergeDocks(tree, winnerDockId, loserDockId)
```

### UI Library

`aiditor.ui.*` provides signal-first controls:

```js
var name = aiditor.signal('world')
var input = aiditor.ui.input({ value: name, placeholder: 'Name' })
var button = aiditor.ui.button({
  text: 'Greet',
  onClick: function () { alert('Hello ' + name()) },
})
```

Groups include base controls, form inputs, editor inputs, containers, virtualized
data views, overlays, schema-driven property forms, the generic Inspector panel,
settings, log, tabs, and AI-specific panels in `aiditor-ai` / `aiditor-full`.

Inspector is provider-based: editor surfaces call `aiditor.inspector.select(...)`,
domain code registers `aiditor.inspector.registerProvider(type, { inspect })`,
and the built-in `inspector` panel renders the primary target while applying
edits to every selected target whose field is present and writable. Call
`aiditor.inspector.refresh()` after external state changes when no provider
subscription is available.

```js
aiditor.inspector.registerProvider('app.node', {
  inspect: function (targets) {
    return {
      schema: { name: { type: 'string' }, visible: { type: 'bool' } },
      values: targets.map(function (target) { return nodeStore.get(target.id) }),
      write: function (field, change, ctx) {
        ctx.targets.forEach(function (target, index) {
          nodeStore.patch(target.id, {
            [field]: ctx.valueForChange(change, target, index, ctx),
          })
        })
      },
    }
  },
})
```

### Theme

Built-in themes:

```js
aiditor.theme.set('dark')
aiditor.theme.set('dracula')
aiditor.theme.set('harbor')
aiditor.theme.set('light')
```

Custom themes should start with semantic authoring tokens such as
`--aiditor-surface-*`, `--aiditor-text-*`, `--aiditor-stroke-*`,
`--aiditor-brand`, and `--aiditor-state-*`.

## Optional AI Host

The AI Host is a framework layer for editor-aware agents. It has five public
concepts:

```text
Agent
Tool
Context Reference
Operation
ChangeSet
```

Register model-callable tools:

```js
aiditor.ai.tools.register('workspace.summarizeOpenFile', {
  title: 'Summarize Open File',
  description: 'Read the active file summary.',
  schema: { type: 'object', properties: {} },
  permissions: ['tool.call'],
  run: function (input, ctx) {
    return { text: 'summary' }
  },
})
```

Register context providers or operations when the editor needs to expose current
selection, bounded reads, previews, or reviewed mutations. All writes should go
through permission and preview/apply paths.

`aiditor-ai` and `aiditor-full` include built-in AIditor authoring skills.
`aiditor.runtime-authoring` teaches in-editor agents to create file-backed
components and mount them into live docks. `aiditor.library-authoring` teaches
Codex-like agents to use AIditor as a plain JavaScript library in a repository.
Copyable skill documents live under [`doc/skill`](./doc/skill).

Runtime API docs are generated from structured comments in `src/` during
`node tools/build.mjs`. The same source creates
[`dist/aiditor-api.json`](./dist/aiditor-api.json),
[`doc/api`](./doc/api), and AI-searchable references such as
`aiditor://api/aiditor.inspector.registerProvider`. Agents should use
`aiditor.searchReferences` / `aiditor.readReference` for exact API shape before
calling unfamiliar framework APIs.

Runtime skill discovery is also exposed through references. Agents can read
`aiditor://skills` to choose between `aiditor.runtime-authoring` and
`aiditor.library-authoring`, then read the chosen skill for full rules.

## Optional Extension Runtime

Extensions package contributions into existing registries:

```text
components
dock panels
tools
context providers
reference providers
operations
settings
commands
menus
```

An extension does not create a second component or AI model. It normalizes a
manifest, reviews trust and conflicts, installs contributions with
`owner: "extension:<id>"`, and removes that owner on disable or uninstall.

## AI Authoring Workflow

For durable AI-generated UI:

1. Open or select a workspace.
2. Let the agent read `aiditor://skills` and choose the focused skill for the
   task.
3. Let the agent inspect files with `workspace.*` / `code.*`.
4. Edit or create plain `.js` component files with exact workspace edits.
5. Register the component by name. Demo project files use
   `Demo.project.component(...)`; standalone hosts can use
   `aiditor.registerComponent(...)`.
6. Inspect docks with `aiditor.inspectDocks`.
7. Add the component with `aiditor.addPanelToDock`, or replace an existing
   panel instance with `aiditor.replacePanel({ panelId, component, ... })`.
   For a new workspace file, pass `path` so the runtime loads the script before
   adding or replacing the panel. If `path` is omitted, the tool tries to infer
   a single matching workspace JS file before asking the agent to retry
   explicitly.
8. After editing the file for an already-mounted panel, call
   `aiditor.reloadPanel({ panelId, path })` to keep the same panel id and dock
   position while rebuilding the runtime.
9. Verify with `verify.*` or host project checks.

Do not pass panel source code through dock or extension arguments. Source files
are the durable artifact; dock data only references registered component names.
Layout persistence is a host save decision, not part of runtime placement.

## Local Development

```bash
git clone https://gitee.com/lazygoo/aiditor.git
cd aiditor
node tools/build.mjs --watch
npx http-server -p 5570
```

Open `http://localhost:5570`.

Changes under `src/` must be rebuilt:

```bash
node tools/build.mjs
npm run check
npm run check:dist
```

`dist/aiditor-kernel.*`, `dist/aiditor-ui.*`, `dist/aiditor-ai.*`,
`dist/aiditor-core.*`, `dist/aiditor-full.*`, and the `dist/aiditor.*` core
aliases are generated artifacts that stay in the repository for zero-build use.
`dist/aiditor-api.json` is generated from source comments and is published with
the runtime bundles.

## Documentation

- [Design index](./doc/README.md)
- [Architecture](./doc/architecture.md)
- [Core](./doc/core.md)
- [UI and dock runtime](./doc/ui.md)
- [AI Host](./doc/ai.md)
- [Extension Runtime](./doc/extensions.md)
- [Generated API docs](./doc/api/index.md)
- [AIditor runtime authoring skill](./doc/skill/aiditor-runtime-authoring/SKILL.md)
- [AIditor library authoring skill](./doc/skill/aiditor-library-authoring/SKILL.md)

## License

[MIT](./LICENSE) (c) gooooo
