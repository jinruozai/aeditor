# UI

UI is the editor shell, the component registry, and the component library.

It contains:

```text
component registry
dock layout data
dock runtime
component context
UI library
Inspector
theme consumption
```

The most important rule:

```text
Component is the only UI registration unit.
PanelData and toolbar items are records that reference registered components.
```

There is no separate panel registry.

## Dock Tree

The dock layout is an immutable N-way split tree.

Data shape:

```text
Split tree
  -> DockData
       -> panels[]
            PanelData { id, component, title, icon, props, toolbarItems }
       -> toolbar.items[]
            Toolbar item { component, props }
```

`PanelData.component` and `toolbar.items[].component` both point to names in the
same component registry.

Implemented pure APIs include:

```js
aiditor.dock(...)
aiditor.panel(...)
aiditor.split(...)
aiditor.findDock(tree, id)
aiditor.findPanel(tree, id)
aiditor.findByName(tree, name)
aiditor.getAt(tree, path)
aiditor.replaceAt(tree, path, node)
aiditor.removeAt(tree, path)
aiditor.resizeAt(tree, path, sizes)
aiditor.updateDock(tree, dockId, patch)
aiditor.addPanel(tree, dockId, partial, opts)
aiditor.removePanel(tree, panelId)
aiditor.updatePanel(tree, panelId, patch)
aiditor.activatePanel(tree, panelId)
aiditor.promotePanel(tree, panelId)
aiditor.movePanel(tree, panelId, targetDockId, targetIndex)
aiditor.movePanelToSplit(tree, panelId, targetDockId, direction, side, ratio)
aiditor.reorderPanel(tree, panelId, newIndex)
aiditor.splitDock(tree, dockId, direction, side, ratio, opts)
aiditor.mergeDocks(tree, winnerDockId, loserDockId)
aiditor.swapDocks(tree, leftDockId, rightDockId)
aiditor.setCollapsed(tree, dockId, value)
aiditor.canCollapseDock(tree, dockId)
aiditor.setFocused(tree, dockId, value)
```

These functions operate on data. DOM behavior is in the dock runtime.

## Dock Runtime

`aiditor.createDockLayout(root, config)` mounts a layout into the DOM.

Implemented runtime abilities:

- active panel mounting
- detached DOM for inactive panels
- panel add, remove, activate, move, split, merge
- tab drag between docks
- dragging registered panels from external lists into docks
- focus mode
- pop-out windows
- cross-window migration
- panel health inspection for generated panels
- optional dock context menu, enabled by `config.dockMenu === true`

Inactive panels should be detached from DOM, not hidden with CSS, so heavy
panels do not keep layout and paint cost.

The framework does not force an application menu model. `dockMenu: true` installs
the built-in dock command/menu contribution and lets right-clicking the dock
corner open it. The default is off; hosts may use the same command/menu registry
to provide their own menus.

When a panel becomes active, the runtime does:

```text
PanelData.component
  -> aiditor.resolveComponent(name)
  -> spec.factory(propsSig, ctx)
  -> append returned element into dock content
```

## Component Registry

All UI types are registered as components:

```js
aiditor.registerComponent(name, spec, meta)
aiditor.resolveComponent(name)
aiditor.componentDefaults(name)
aiditor.listComponents(filter)
aiditor.unregisterComponent(name, meta)
aiditor.unregisterComponentPrefix(prefix)
aiditor.unregisterComponentOwner(owner)
aiditor.componentRegistration(name)
aiditor.componentRegistryVersion
```

A registered component may be used as:

```text
dock panel content
toolbar item
UI tree node
palette/gallery card
dynamic AI-created UI
```

Final naming should use dotted prefixes for grouping:

```text
ui.buttonDemo
gde.tablePanel
sample.panel
```

Current code also supports metadata for extension cleanup. This is a migration
topic, not a second conceptual grouping model.

## Declarative UI Tree

AI-created UI and extension manifests can describe UI with a plain data tree:

```js
aiditor.ui.renderUITree(node, ctx)
```

This is not a second component system. Each node still resolves through the same
component registry:

```text
UITree node.component -> aiditor.resolveComponent(name) -> component factory
```

The tree format exists so generated panels, palettes, and extension manifests
can be stored, reviewed, and recreated as data. Handwritten panels may still call
`aiditor.ui.*` functions directly.

## Component Spec

A component has:

```js
{
  factory(propsSig, ctx) {},
  defaults() {},
  dispose(el) {},
  serialize(el) {},
  deserialize(el, state) {}
}
```

Rules:

- Props should be JSON-serializable.
- `category: 'panel'` means the component is suitable as dock panel content.
  It does not create a different kind of component.
- Components communicate through `ctx.bus`, references, operations, or domain
  APIs.
- Components should use `aiditor.ui.*` widgets when available.
- View surfaces and scrollable panel content should prefer `aiditor.ui.view`; `aiditor.ui.scrollArea` is the lower-level scrollbar wrapper.
- Floating UI should prefer framework overlay helpers.

Registered component metadata may include palette and editor hints:

```text
category
schema
bindable
preview
```

These hints help galleries, generated UI, and property editors. They do not
change what a component is.

## Toolbar

Toolbar items are ordinary component references stored in toolbar data. Tabs are
not special framework objects; they are toolbar components that subscribe to
dock panel state.

Built-in panel components include:

```text
tab-standard
tab-compact
tab-collapsible
tab-sidebar
log
settings
inspector
ai-agents-list
ai-chatinput
ai-messages
ai-chat
```

## UI Library

The UI library provides reusable components and primitive constructors. Generic
components live under `src/ui/` by category:

```text
src/ui/base/        buttons, icons, text, badges, tags, tooltip, popover
src/ui/form/        input controls and schema-driven property editors
src/ui/editor/      editor-specific inputs such as code, curve, path, file
src/ui/container/   layout and containers such as vbox, hbox, absolute, view, scrollArea
src/ui/data/        list, tree, table, asset browser, change review
src/ui/overlay/     menu, modal, drawer, toast, dialogs
src/ui/panel/       generic dock panel components such as log/settings/tabs
src/ui/_internal/   implementation helpers used by the UI library
```

AI-specific panel components live under `src/ai/panels/` because they belong to
the AI module, even though they are registered through `aiditor.registerComponent`
and usually use `category: 'panel'`.

Domain-specific components live outside `src/ui/`.

The settings panel under `src/ui/panel/` is only the generic settings shell.
Concrete settings are registered by the owning module, for example theme
settings from `src/style/theme-settings.js` and AI settings from
`src/ai/panels/settings-ai.js`.

## Schema Editors

The UI library includes schema-driven property editing:

```js
aiditor.ui.setTypeConfig(builtinTypes, options)
aiditor.ui.setTypeOverrides(overrides)
aiditor.ui.getTypeConfig()
aiditor.ui.resolveType(typeName)
aiditor.ui.resolveFieldDef(fieldDef)
aiditor.ui.registerRenderer(kind, fn)
aiditor.ui.getRenderer(kind)
aiditor.ui.listRenderKinds()
aiditor.ui.editorFor(fieldDef, value, onChange, ctx)
aiditor.ui.propertyForm(options)
```

`typeconfig` provides built-in field aliases and render hints. Domain schemas
can extend it, but property editing should remain a UI helper, not a separate
data model.

The dock-level Inspector lives above this helper. It owns ordered selection and
provider dispatch, then uses `propertyForm` for normal property rows. See
[inspector.md](./inspector.md).

Use `propertyForm` directly when a component already owns the objects it edits.
Use `aiditor.inspector` when selection can come from many editor surfaces and a
shared dock panel should inspect the current selection.

## Icons And Floating UI

Icons use a small registry:

```js
aiditor.ui.registerIcon(name, svgInnerMarkup)
```

Floating UI should use the shared portal, overlay stack, and scoped overlay
cleanup. Components that create floating DOM outside their root should register
it so it closes when the owning panel becomes inactive or is disposed:

```js
aiditor.ui.registerScopedOverlay(anchor, close, options)
```

This prevents tooltips, popovers, and menus from leaking across tabs or panels.

## Themes

Themes are token-driven and applied through `aiditor.theme`.

UI components should consume semantic role tokens, not domain-specific colors.
