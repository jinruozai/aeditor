# Extension Runtime Architecture

Status: architecture + Phase 1-6 runtime implemented; AI visible UI path superseded by `doc/ai-code-panel-architecture.md`

Current final guidance:

- Extension runtime remains the lifecycle, ownership, rollback, permission, and recovery layer.
- AI-created visible UI should use `aiditor.createPanel`, which wraps a same-page `factory(propsSig, ctx)` panel into this runtime.
- `aiditor.installExtension` and `aiditor.addPanelToDock` remain low-level/advanced operations, not the normal AI UI authoring surface.

Implemented Phase 1:

- Owner-aware component / reference / operation registration and owner cleanup.
- `aiditor.extensions.preview(...)`, `install(...)`, `uninstall(...)`, `list(...)`, `get(...)`.
- `aiditor.extensions.update(...)`, `enable(...)`, `disable(...)`, `boot(...)`, `safeMode(...)`.
- `aiditor.extensions.setMaxLayer(...)`, `disableLayer(...)`, `enableLayer(...)` for recovery filtering.
- `aiditor.extensions.configureStorage(...)`, `save(...)`, `clearStored(...)` for manifest persistence.
- `aiditor.extensions.review(...)`, `installWithReview(...)`, and `configurePermissions(...)` for install/update permission review.
- `aiditor.commands` owner-aware command registry and menu seam registry.
- Extension-owned settings sections / schemas / pages with owner cleanup.
- Declarative panel contributions backed by existing `aiditor.registerComponent(...)` and `aiditor.ui.renderUITree(...)`.
- Dock panel contributions with `owner` / `extensionId` metadata.
- Ownerless `extension-disabled` recovery panel for disabled/uninstalled component references.
- Layout registration bridge through `aiditor.extensions.registerLayout(...)`; `createDockLayout(...)` registers itself as `default` unless given `config.name`.
- AI operations: `aiditor.installExtension`, `aiditor.updateExtension`, `aiditor.removeExtension`, `aiditor.enableExtension`, `aiditor.disableExtension`, `aiditor.promoteExtensionLayer`, `aiditor.addPanelToDock`, `aiditor.removePanelFromDock`.
- Trusted code panel contributions are supported only when install/update passes explicit `allowCode: true`; AI-created visible UI now defaults to `aiditor.createPanel`.

Still planned:

- Stronger future isolation options such as worker-backed panels. Current code panels support explicit same-page factories and sandboxed iframe panels.

This document defines the proposed runtime extension architecture for aiditor. It captures the dynamic panel discussion and folds it into the existing Dock / Panel / Component and AI Reference / Operation model.

The goal is not to add a one-off "dynamic panel" feature. The goal is to let an editor built on aiditor grow new capabilities at runtime while keeping the framework simple, inspectable, reversible, and consistent with the current component model.

## Core Idea

aiditor already has the right foundation:

```txt
Dock organizes Panel
Panel references Component by registered name
Component is registered before use
AI reads/writes editor objects through Reference / Operation
```

The Extension Runtime adds lifecycle ownership around those existing extension points:

```txt
Extension manifest
  -> install contributions
  -> register components / operations / references / commands
  -> optionally add panels to docks
  -> uninstall by owner when removed or updated
```

Dock does not learn about dynamic panels. Dock still consumes a component name. Component Registry remains the only UI / panel registry.

## Design Principles

1. **No second component world**
   Extensions install into the existing registries. A generated panel, a project panel, and a built-in panel are all `aiditor.registerComponent(...)` entries.

2. **Manifest lifecycle**
   Extension capabilities are represented internally as serializable manifests. A manifest can be previewed, diffed, approved, persisted, promoted, reverted, and disabled. AI visible UI does not handcraft these manifests; `aiditor.createPanel` creates them internally.

3. **Layered ownership**
   Runtime-generated artifacts should not mix with framework core. Extensions belong to explicit layers.

4. **Safe mode is mandatory**
   If an extension breaks the editor, the user must be able to boot or switch into a core-only mode.

5. **AI uses Operations**
   AI does not mutate extension runtime directly. For visible UI it calls `aiditor.createPanel`; advanced extension lifecycle still flows through registered operations such as `aiditor.installExtension`, `aiditor.removeExtension`, and `aiditor.addPanelToDock`, all under the normal permission system.

6. **Factory panel is the AI default**
   AI-created visible panels should be same-page `factory(propsSig, ctx)` panels created through `aiditor.createPanel`. Declarative UI trees remain a secondary static format.

7. **Install is transactional**
   A partially installed extension is worse than no extension. If any contribution fails, the runtime rolls back every contribution installed in that attempt.

8. **Disable is not delete**
   Disabling an extension removes or hides its runtime contributions but keeps the manifest. Deleting removes the manifest too.

9. **Layout contribution is explicit**
   Adding a panel to a dock is a contribution with ownership metadata. It is not an invisible side effect hidden inside component registration.

## Architecture Review

The scheme is aligned with aiditor's philosophy because it keeps the original dependency direction:

```txt
Extension Runtime owns lifecycle
Registry owns names
Dock owns panel placement
Component owns rendering
AI Operation owns mutation approval
```

The design is intentionally not "perfect" in the sense of allowing arbitrary customization. It is perfect for aiditor only if it stays narrow:

- Extensions contribute to known registries.
- Registries remain explicit maps, not implicit file scanners.
- Same-page factory code is the first-class AI visible UI authoring format.
- Declarative panels are optional and static.
- Dock never contains extension-specific data except normal panel data plus optional ownership metadata.

The main risks are not conceptual. They are lifecycle details:

- name conflicts
- partial install rollback
- live panel instances after uninstall
- extension update with existing layout
- unclear data binding language
- over-expanding commands/menus before there is a command registry

The rest of this document resolves those risks.

## Inspiration

Space Agent and Agent Zero validate the direction but should not be copied wholesale.

- Space Agent shows the value of a frontend runtime that the agent can reshape, layered customization (`L0` firmware, `L1` group, `L2` user), panel manifests, and safe layer limiting.
- Agent Zero shows the value of explicit extension points, tool extensibility, cache invalidation, and dynamic module loading.

aiditor should keep its own style: zero build, IIFE, explicit registration, no hidden mutation observers, and no broad "wrap any function" hook system.

## Layers

Recommended layers:

| Layer | Meaning | Editable at runtime | Typical owner |
|---|---|---:|---|
| `core` | Framework built-ins | No | aiditor |
| `app` | Application-provided built-ins | Usually no | host app |
| `project` | Project-level extensions | Yes | project |
| `user` | User personal extensions | Yes | user |
| `session` | Temporary AI-generated extensions | Yes | current session |

Default AI-created extensions should start in `session`. The user can promote a good extension to `project` or `user`.
The runtime also accepts `builtin` as a compatibility alias for framework-owned core registrations.

The runtime should support max-layer filtering:

```js
aiditor.extensions.setMaxLayer('core')
aiditor.extensions.boot({ safeMode: true })
aiditor.extensions.safeMode(true, { allowApp: true })
aiditor.extensions.disableLayer('user')
```

This is the recovery path when generated UI breaks.

## Owner

`owner` is a lifecycle tag. It allows the runtime to remove all registry entries created by the same extension.

```js
owner: 'extension:project.characterInventory'
```

Owner responsibilities:

1. Mark source and lifecycle.
2. Bulk uninstall/update.
3. Prevent mistaken deletion of entries owned by someone else.

Owner is optional for classic manual registration:

```js
aiditor.registerComponent('my-panel', spec)
```

Owner is required for extension-managed registration, but extension authors should not write it manually. `aiditor.extensions.install(...)` injects it.

```js
aiditor.registerComponent('inventory-panel', spec, {
  owner: 'extension:project.characterInventory',
  layer: 'project',
})
```

Uninstall by owner:

```js
aiditor.unregisterComponentOwner('extension:project.characterInventory')
aiditor.ai.operations.unregisterOwner('extension:project.characterInventory')
aiditor.ai.references.unregisterOwner('extension:project.characterInventory')
// Later phase, after aiditor.commands exists:
aiditor.commands.unregisterOwner('extension:project.characterInventory')
```

If a registry entry is ownerless, it cannot be removed by extension uninstall.

## Naming And Identity

Every extension-managed contribution has two ids:

```txt
local id     inventory-panel
public id    project.characterInventory/inventory-panel
```

The manifest may use local ids internally. The runtime should expand them to public ids before registration unless the manifest explicitly opts into a public id.

Recommended rule:

```js
publicId = manifest.id + '/' + contribution.id
```

Example:

```js
{
  id: 'project.characterInventory',
  contributions: {
    components: [
      { id: 'panel', kind: 'declarative-panel' }
    ],
    dockPanels: [
      { component: 'panel', dock: 'main' }
    ]
  }
}
```

Installs as:

```js
aiditor.registerComponent('project.characterInventory/panel', spec, { owner, layer })
```

Why this matters:

- AI can generate simple local ids.
- Multiple extensions can have a `panel` component.
- Dock panel data stores globally resolvable component names.
- Uninstall can find all owned entries.

Framework and app components keep their existing names. Extension ids should be namespaced by layer or app convention:

```txt
session.characterInventory
project.characterInventory
user.myInventoryPanel
```

Name collision rule:

1. Same owner may replace its own entries during update.
2. Different owner cannot replace an existing public id.
3. Ownerless entries cannot be replaced by extensions.
4. Layer precedence does not silently override component ids in the first version.

This deliberately avoids a complex "shadowing" model.

## Extension Manifest

The manifest is a plain object and must be structured-clone safe unless it explicitly declares a code contribution.

```js
{
  id: 'project.characterInventory',
  title: 'Character Inventory',
  version: 1,
  layer: 'project',
  status: 'active',
  permissions: [
    'project.read',
    'project.write'
  ],
  contributions: {
    components: [],
    operations: [],
    references: [],
    commands: [],
    menus: [],
    dockPanels: [],
    settings: []
  }
}
```

The manifest id is stable. Updating an extension with the same id means:

1. Preview diff.
2. Uninstall previous owner contributions.
3. Install new contributions.
4. Restore compatible dock panel instances if possible.

## Install Transaction

Install and update must be all-or-nothing.

Recommended install algorithm:

```txt
normalize manifest
validate ids, permissions, target docks, referenced components
build install plan
create rollback stack
register component contributions
register reference/operation contributions
apply layout contributions
persist manifest/status
commit
```

If any step fails:

```txt
run rollback stack in reverse order
restore previous manifest/status
leave layout tree in its previous state
return invalid preview or failed apply result
```

The runtime should not rely on try/catch inside core internals. The extension boundary is a user/AI input boundary, so validation and rollback are appropriate there.

Update is install with a previous version:

```txt
preview old -> new diff
snapshot affected layout entries
uninstall old owner contributions
install new owner contributions
rewrite compatible panel component ids if ids changed by migration
rollback to old version if new install fails
```

First version should avoid component id migration. Stable ids are simpler and safer.

## Contributions

### Components

Components are the most important contribution type. They install into the existing Component Registry.

Declarative component:

```js
{
  id: 'inventory-slot',
  kind: 'declarative-component',
  title: 'Inventory Slot',
  ui: {
    component: 'card',
    props: { padded: true },
    children: [
      { component: 'text', props: { text: '{{item.name}}' } }
    ]
  }
}
```

Declarative panel:

```js
{
  id: 'inventory-panel',
  kind: 'declarative-panel',
  title: 'Inventory',
  icon: 'backpack',
  ui: {
    component: 'vbox',
    children: [
      { component: 'text', props: { text: 'Inventory' } },
      { component: 'table', props: { columns: ['name', 'type', 'count'] } }
    ]
  }
}
```

Factory component, later phase:

```js
{
  id: 'inventory-panel',
  kind: 'factory',
  title: 'Inventory',
  icon: 'backpack',
  source: 'function factory(propsSig, ctx) { ... }'
}
```

Factory/code components require higher trust but still install into the same registry.

### Dock Panels

Dock panel contribution requests inserting an installed component into a dock.

```js
{
  dock: 'main',
  component: 'inventory-panel',
  title: 'Inventory',
  icon: 'backpack',
  transient: false
}
```

The runtime should resolve dock names through a host-provided dock locator. Dock still stores normal `PanelData`.

Dock panel contribution has two possible modes:

```js
{
  mode: 'ensure',
  dock: 'main',
  component: 'inventory-panel'
}
```

```js
{
  mode: 'open-on-install',
  dock: 'main',
  component: 'inventory-panel'
}
```

Recommended first version:

- `open-on-install` adds the panel once during install and does not keep managing it.
- `ensure` is allowed only for app/project extensions and means disabling the extension removes owned panel instances.

Panel ownership metadata should be stored on `PanelData` for extension-created panels:

```js
{
  component: 'project.characterInventory/panel',
  title: 'Inventory',
  owner: 'extension:project.characterInventory',
  extensionId: 'project.characterInventory'
}
```

This is optional for normal panels. It lets uninstall remove panels created by the extension without scanning by component name only.

Uninstall behavior:

1. Remove panels whose `owner` matches the extension.
2. Refuse uninstall if non-owned panels still reference owned components, unless `force` is set.
3. With `force`, replace those panels with an error/recovery panel or remove them.

This avoids silently leaving broken panel data in the layout.

### Operations

Extensions can contribute AI-editable operations.

```js
{
  id: 'inventory.addItem',
  title: 'Add Inventory Item',
  risk: 'edit',
  schema: { type: 'object', required: ['itemId'] },
  preview: { ... },
  apply: { ... }
}
```

Declarative operations can be limited to host-provided action adapters. Code operations are a later phase and require explicit permission.

### References

Extensions can contribute reference providers when they introduce new data surfaces.

```js
{
  id: 'inventory',
  kinds: ['inventory.item', 'inventory.slot'],
  read: { adapter: 'project.readInventoryRef' },
  search: { adapter: 'project.searchInventoryRefs' }
}
```

For the first version, host apps should provide adapters. The extension manifest wires UI to those adapters.

### Commands And Menus

Commands and menus should be explicit contributions, not hidden event hooks.

aiditor exposes a small `aiditor.commands` registry. It deliberately does not bind global shortcuts or application behavior; it only stores commands, runs explicit command ids, and provides menu seam items for host UI to render.

```js
{
  id: 'inventory.refresh',
  title: 'Refresh Inventory',
  icon: 'refresh-cw',
  run: { adapter: 'project.refreshInventory' }
}
```

Menu contributions should target named seams:

```js
{
  target: 'dock.panel.context',
  command: 'inventory.refresh'
}
```

Host UI can render a seam with:

```js
aiditor.commands.menuUiItems('dock.panel.context', ctx)
```

No arbitrary "before/after any function" hook system should be added in the first version.

## Adapter Boundary

Declarative extensions need to do useful work without embedding arbitrary JS. They should call host-provided adapters by id.

Adapter examples:

```txt
project.readInventory
project.writeInventoryItem
project.searchCharacters
project.openAssetPicker
```

Adapters are registered by the host app, not generated by AI in the first version:

```js
aiditor.extensions.registerAdapter('project.readInventory', {
  permissions: ['project.read'],
  run: function (input, ctx) { ... }
})
```

Declarative UI can bind to adapter output:

```js
{
  data: {
    inventory: {
      adapter: 'project.readInventory',
      input: { characterId: '{{props.characterId}}' }
    }
  },
  ui: {
    component: 'table',
    props: {
      rows: '{{data.inventory.items}}'
    }
  }
}
```

This gives declarative panels real power without making JSON into a programming language.

## Public API

Proposed namespace:

```js
aiditor.extensions.install(manifest, options)
aiditor.extensions.uninstall(id, options)
aiditor.extensions.get(id)
aiditor.extensions.list(filter)
aiditor.extensions.preview(manifest)
aiditor.extensions.registerLayout(name, handle)
aiditor.extensions.registerAdapter(id, spec)
aiditor.extensions.update(id, nextManifest, options)
aiditor.extensions.enable(id)
aiditor.extensions.disable(id)
aiditor.extensions.boot(options)
aiditor.extensions.safeMode(enable)
aiditor.extensions.configureStorage(options)
aiditor.extensions.setMaxLayer(layer)
aiditor.extensions.disableLayer(layer)
aiditor.extensions.enableLayer(layer)
```

Registry owner support:

```js
aiditor.registerComponent(name, spec, { owner, layer })
aiditor.unregisterComponent(name, { owner })
aiditor.listComponents({ owner, layer })
aiditor.unregisterComponentOwner(owner)
aiditor.ai.operations.unregisterOwner(owner)
aiditor.ai.references.unregisterOwner(owner)
```

AI operations:

```js
aiditor.installExtension
aiditor.updateExtension
aiditor.removeExtension
aiditor.enableExtension
aiditor.disableExtension
aiditor.promoteExtensionLayer
aiditor.addPanelToDock
aiditor.removePanelFromDock

// planned
editor.configureExtensionPermissions
```

## Declarative Panel Runtime

Declarative panel should be the default authoring target for AI.

It should reuse existing UI registration:

```txt
Built-in UI component      -> aiditor.registerComponent
Built-in panel             -> aiditor.registerComponent
App panel                  -> aiditor.registerComponent
Extension UI component     -> aiditor.extensions.install -> aiditor.registerComponent
Extension panel            -> aiditor.extensions.install -> aiditor.registerComponent
```

Rendering can reuse `aiditor.ui.renderUITree` or a small wrapper around it.

Minimum first-version capabilities:

- Layout components: `vbox`, `absolute`, `section`, `card`, `scrollArea`, `tabPanel`
- Display components: `text`, `badge`, `tag`, `image`, `divider`
- Form components: `input`, `numberInput`, `select`, `checkbox`, `switch`, `textarea`
- Data components: `list`, `tree`, `table`
- Binding to supplied `props`, reference data, and host-provided adapters
- Event actions mapped to command ids or operation previews

Avoid building a full programming language into JSON. When declarative UI is not enough, use a code panel with explicit permission.

### Binding Language

The binding language should be tiny and explicit.

Allowed in the first version:

```txt
{{props.name}}
{{data.inventory.items}}
{{selection.entityId}}
```

Not allowed in the first version:

```txt
{{items.filter(...)}}
{{new Function(...)}}
{{window.localStorage}}
```

For derived values, use named adapters or built-in formatters:

```js
{
  text: {
    format: 'countLabel',
    value: '{{data.inventory.items}}'
  }
}
```

This keeps declarative panels readable and safe.

### Actions

UI events should call named actions:

```js
{
  component: 'button',
  props: { text: 'Add Item' },
  on: {
    click: {
      operation: 'inventory.addItem',
      input: { characterId: '{{props.characterId}}' }
    }
  }
}
```

or:

```js
{
  on: {
    click: {
      adapter: 'project.openInventoryPicker',
      input: { characterId: '{{props.characterId}}' }
    }
  }
}
```

Actions should never be inline code in declarative panels.

## Code Panels

Trusted code panel support is available as an explicit opt-in. Declarative panels remain the default and recommended path.

Risks:

- Same-page JS can access `window`.
- True sandboxing is hard without iframe isolation.
- UI code may leak event listeners, timers, or global state.

Rules:

- Code panels require explicit install approval and `allowCode: true` during install/update.
- Code panels declare permissions.
- Code panels have owner-based cleanup.
- Code panel factory receives the normal `propsSig, ctx`.
- Code panels must use `ctx.onCleanup` and `aiditor.ui.dispose`.
- Code panel update must uninstall the previous owner contribution first.

Optional future isolation:

- sandboxed iframe panel for untrusted code
- worker-backed logic with declarative UI bridge
- host adapter allowlist

Code panel source should not be stored as an executable function object in the manifest. Store it as text plus metadata:

```js
{
  kind: 'factory',
  language: 'javascript-iife-factory',
  source: 'function factory(propsSig, ctx) { ... }',
  hash: 'sha256-...'
}
```

The runtime compiles it only after permission approval.
For safer UI-only code panels, use an iframe contribution:

```js
{
  kind: 'iframe',
  srcdoc: '<!doctype html><body>...</body>',
  sandbox: 'allow-scripts',
  hash: aiditor.extensions.hashSource(srcdoc)
}
```

`factory` runs in the editor page and therefore requires `allowCode: true`. `iframe` also requires `allowCode: true`, but it is rendered through a sandboxed iframe and supports source hash validation before install.

## Permission Model

Use the existing permission system. Do not invent a parallel permission model.

Suggested permission points:

```txt
extensions.preview
extensions.install
extensions.update
extensions.uninstall
extensions.promote
extensions.code.install
extensions.layer.project.write
extensions.layer.user.write
dock.panel.add
dock.panel.remove
```

Installing a declarative panel is lower risk than installing code. Installing code should be treated like installing a plugin.

Even in full access, extension install/update should show a preview because it changes the editor's capability surface.

Permission checks happen at three moments:

1. Preview: can the actor inspect and propose this extension?
2. Install/update: can the actor change this layer and contribution type?
3. Runtime use: can the panel action/adapter/operation perform the requested read/write?

Full access can auto-approve normal edit operations, but extension code install should still require an explicit preview surface because it changes future behavior, not just current data.

The runtime exposes this review surface without forcing a specific host UI:

```js
const review = aiditor.extensions.review(manifest, { actor, agentId })
// review.canInstall, review.canApply, review.permissions, review.requiredConsent
```

Hosts may use `aiditor.extensions.installWithReview(...)` for a small built-in confirmation helper, or render their own review UI from the same object. Permission policy can be customized with:

```js
aiditor.extensions.configurePermissions({
  install(details) { return true },
  update(details) { return true },
  uninstall(details) { return true },
  can(details) { return true }
})
```

## Preview Model

`aiditor.extensions.preview(...)` and the preview phase of `aiditor.installExtension` should return:

```js
{
  ok: true,
  risk: 'edit',
  title: 'Install Character Inventory extension',
  summary: 'Adds 2 components and opens 1 panel in main dock.',
  changes: [
    { kind: 'component.add', id: 'inventory-panel' },
    { kind: 'component.add', id: 'inventory-slot' },
    { kind: 'dock.panel.add', dock: 'main', component: 'inventory-panel' }
  ],
  warnings: [],
  manifest: { ... }
}
```

Invalid preview examples:

- id conflict with another owner
- missing component referenced by dock panel
- layer not writable
- required permission not granted
- factory/code contribution disallowed
- dock target not found
- uninstall would leave non-owned panels referencing owned components
- adapter id not registered or permission denied
- declarative binding references unknown scope

## Persistence

The framework should not decide where project/user extensions are stored. It should expose a storage adapter.

```js
aiditor.extensions.configureStorage({
  key: 'aiditor.extensions.v1',
  storage: window.localStorage,
  load: true
})
```

The default adapter uses `window.localStorage` when available. Real editors can pass a compatible storage object backed by project files.

Suggested persistence units:

- extension manifest
- installed/enabled status
- layer
- version
- createdBy / updatedBy metadata
- dock panel placement if the extension owns layout contributions

Storage adapter should persist manifests, not live registry entries. Registries are reconstructed by installing manifests on boot.

Boot order:

```txt
load core/app components
load persisted extension manifests
filter by safe mode and max layer
install active extensions in stable order
create dock layout
reconcile panels
```

If the host creates dock layout before extensions are installed, panels that reference extension components will fail. Therefore extension boot can register extension components before layout creation, while dock panel contributions may be deferred. `aiditor.extensions.registerLayout(...)` applies pending dock panel contributions when the named layout becomes available. Explicit layout names never fall back to another layout.

## Safe Mode

Safe mode should disable non-core layers and avoid loading code contributions.

```js
aiditor.extensions.boot({ safeMode: true })
```

Expected behavior:

- only `core`/`builtin`, and optionally `app` layer contributions are active
- project/user/session extensions are listed but disabled
- UI shows a recovery surface if the host app provides one
- user can disable, delete, or downgrade extensions

This is essential once AI can generate panels.

Safe mode should also define layout behavior:

- panels owned by disabled extensions are removed from the active layout view
- non-owned panels referencing disabled components render a small "extension disabled" recovery component
- user can re-enable or delete the extension from a recovery UI

The recovery component should be framework-provided and ownerless.

## Implementation Phases

### Phase 1: Owner-Aware Registries

Add owner/layer metadata and unregister support.

Files likely touched:

- `src/core/registry.js`
- `src/ai/reference.js`
- `src/ai/target.js` only if target helpers need owner metadata

Keep current APIs working. Owner remains optional for manual registration.

### Phase 2: Extension Runtime

Add:

- `src/core/extensions.js` or `src/extensions/runtime.js`
- install/update/uninstall/list/enable/disable
- manifest normalization
- owner cleanup
- transactional rollback
- storage adapter
- adapter registry
- tests

No AI-facing `aiditor.createPanel` yet in this phase; code panels arrive through the later trusted factory path.

### Phase 3: Declarative Panels

Add declarative component/panel contribution support using the existing UI registry/render tree.

Deliverable:

- AI can generate an inventory panel manifest
- framework previews it
- user approves
- panel appears in a dock
- uninstall removes component and panel contribution

### Phase 4: AI Operations

Expose editor operations:

- preview/apply/update/remove extension
- add/remove panel to dock
- promote layer
- enable/disable extension

Integrate with existing permission and operation preview/apply flow.

### Phase 5: Commands, Menus, Settings

Implemented contribution types that need their own registries:

- `aiditor.commands`
- menu seams
- extension-owned settings sections/pages

They are owner-aware and are cleaned up during extension disable/uninstall.

### Phase 6: Code Panels

Trusted code panel support is implemented behind explicit `allowCode: true`.

## Non-Goals For First Version

- no arbitrary function hook system
- no hidden DOM mutation based extension loading
- no second UI registry
- no forced backend/server discovery
- no iframe-only requirement; same-page factory panels remain available behind explicit `allowCode`
- no replacing `aiditor.registerComponent`
- no broad low-code language beyond simple UI tree/actions
- no implicit command/menu hooks outside the explicit `aiditor.commands` registry
- no layer shadowing / override resolution in the first version

## Example: AI Adds Character Inventory Panel

User asks:

```txt
Add a character inventory panel to the main view dock.
```

AI flow:

1. Calls `aiditor.getCapabilities` / layout read tool.
2. Generates same-page panel factory source.
3. Calls `aiditor.createPanel` with `layer: 'session'`.
4. Runtime wraps the factory in an extension manifest, registers the component, and adds the panel to the dock.
5. Runtime health-checks the created panel; failures roll back and are reported to the agent.
6. User can promote extension to `project` layer.

AI-facing call:

```js
{
  id: 'character-inventory',
  title: 'Character Inventory',
  icon: 'backpack',
  dock: 'main',
  layer: 'session',
  source: 'function (propsSig, ctx) { const root = document.createElement("div"); root.textContent = "Inventory"; return root }'
}
```

Internally this still becomes an extension-owned component, and the dock still stores a normal panel pointing to that registered component. No special dock behavior is needed.

## Final Decision

The best architecture is:

```txt
Same-page factory is the AI authoring surface.
Extension Manifest is the internal lifecycle artifact.
Layered Extension Runtime manages install/update/uninstall/safe mode.
Component Registry remains the only UI and Panel registry.
Dock consumes component names exactly as before.
AI creates visible panels through aiditor.createPanel and uses low-level extension operations only for advanced extension work.
```

This is compatible with aiditor's original philosophy and makes the editor grow without turning the framework into a pile of special cases.

## Completeness Verdict

With the refinements above, the design is simple enough to implement and strong enough for serious editor work.

It is intentionally not maximal:

- no arbitrary extension hooks
- no implicit file scanner
- no second UI registry
- no hidden override system
- no default untrusted code execution

It is powerful because the few primitives compose:

```txt
manifest + owner + layer + registry + operation + dock panel
```

That is the smallest set that supports AI-generated panels, custom UI components, future commands, project/user/session scope, safe mode, update, uninstall, and rollback without damaging the existing dock/component architecture.
