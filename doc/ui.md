# UI

UI is the editor shell, the component registry, and the component library.

It contains:

```text
component registry
dock layout data
dock runtime
component context
UI library
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
aeditor.dock(...)
aeditor.panel(...)
aeditor.split(...)
aeditor.findDock(tree, id)
aeditor.findPanel(tree, id)
aeditor.findByName(tree, name)
aeditor.getAt(tree, path)
aeditor.replaceAt(tree, path, node)
aeditor.removeAt(tree, path)
aeditor.resizeAt(tree, path, sizes)
aeditor.updateDock(tree, dockId, patch)
aeditor.addPanel(tree, dockId, panel, options)
aeditor.removePanel(tree, panelId)
aeditor.updatePanel(tree, panelId, patch)
aeditor.activatePanel(tree, dockId, panelId)
aeditor.promotePanel(tree, panelId)
aeditor.movePanel(tree, panelId, targetDockId, options)
aeditor.movePanelToSplit(tree, panelId, targetDockId, direction, options)
aeditor.reorderPanel(tree, dockId, fromIndex, toIndex)
aeditor.splitDock(tree, dockId, direction, options)
aeditor.mergeDocks(tree, dockId, direction)
aeditor.swapDocks(tree, leftDockId, rightDockId)
aeditor.setCollapsed(tree, dockId, value)
aeditor.canCollapseDock(tree, dockId)
aeditor.setFocused(tree, dockId, value)
```

These functions operate on data. DOM behavior is in the dock runtime.

## Dock Runtime

`aeditor.createDockLayout(root, config)` mounts a layout into the DOM.

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

Inactive panels should be detached from DOM, not hidden with CSS, so heavy
panels do not keep layout and paint cost.

When a panel becomes active, the runtime does:

```text
PanelData.component
  -> aeditor.resolveComponent(name)
  -> spec.factory(propsSig, ctx)
  -> append returned element into dock content
```

## Component Registry

All UI types are registered as components:

```js
aeditor.registerComponent(name, spec, meta)
aeditor.resolveComponent(name)
aeditor.componentDefaults(name)
aeditor.listComponents(filter)
aeditor.unregisterComponent(name, meta)
aeditor.unregisterComponentPrefix(prefix)
aeditor.componentRegistration(name)
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
aeditor.ui.renderUITree(node, ctx)
```

This is not a second component system. Each node still resolves through the same
component registry:

```text
UITree node.component -> aeditor.resolveComponent(name) -> component factory
```

The tree format exists so generated panels, palettes, and extension manifests
can be stored, reviewed, and recreated as data. Handwritten panels may still call
`aeditor.ui.*` functions directly.

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
- Components should use `aeditor.ui.*` widgets when available.
- View surfaces and scrollable panel content should prefer `aeditor.ui.view`; `aeditor.ui.scrollArea` is the lower-level scrollbar wrapper.
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
src/ui/container/   layout and containers such as vbox, hbox, view, scrollArea
src/ui/data/        list, tree, table, asset browser, change review
src/ui/overlay/     menu, modal, drawer, toast, dialogs
src/ui/panel/       generic dock panel components such as log/settings/tabs
src/ui/_internal/   implementation helpers used by the UI library
```

AI-specific panel components live under `src/ai/panels/` because they belong to
the AI module, even though they are registered through `aeditor.registerComponent`
and usually use `category: 'panel'`.

Domain-specific components live outside `src/ui/`.

The settings panel under `src/ui/panel/` is only the generic settings shell.
Concrete settings are registered by the owning module, for example theme
settings from `src/style/theme-settings.js` and AI settings from
`src/ai/panels/settings-ai.js`.

## Schema Editors

The UI library includes schema-driven property editing:

```js
aeditor.ui.setTypeConfig(builtinTypes, options)
aeditor.ui.setTypeOverrides(overrides)
aeditor.ui.getTypeConfig()
aeditor.ui.resolveType(typeName)
aeditor.ui.resolveFieldDef(fieldDef)
aeditor.ui.registerRenderer(kind, fn)
aeditor.ui.getRenderer(kind)
aeditor.ui.listRenderKinds()
aeditor.ui.editorFor(fieldDef, value, onChange, ctx)
aeditor.ui.propertyPanel(options)
```

`typeconfig` provides built-in field aliases and render hints. Domain schemas
can extend it, but property editing should remain a UI helper, not a separate
data model.

## Icons And Floating UI

Icons use a small registry:

```js
aeditor.ui.registerIcon(name, svgInnerMarkup)
```

Floating UI should use the shared portal, overlay stack, and scoped overlay
cleanup. Components that create floating DOM outside their root should register
it so it closes when the owning panel becomes inactive or is disposed:

```js
aeditor.ui.registerScopedOverlay(anchor, close, options)
```

This prevents tooltips, popovers, and menus from leaking across tabs or panels.

## Themes

Themes are token-driven and applied through `aeditor.theme`.

UI components should consume semantic role tokens, not domain-specific colors.
