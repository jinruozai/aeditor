# ai-tools API

Generated from structured API comments in `src/`.

## `aiditor.addPanelToDock`

Add a registered or workspace-file component as a new panel in a runtime dock. If path is provided, the script is loaded before adding the panel.

```js
aiditor.addPanelToDock({ dock, component, path?, title?, props?, transient? })
```

| Param | Type | Description |
|---|---|---|
| `input` | `object` | Tool input. |
| `input.dock` | `string` | Dock id/name from inspectDocks. |
| `input.component` | `string` | Registered component id. |
| `input.path` | `string` | Optional workspace JS file to load before adding the panel. |
| `input.title` | `string` | Optional panel title. |
| `input.props` | `object` | Optional component props. |
| `input.transient` | `boolean` | Optional transient panel flag. |

Returns: `object` Applied operation result.

```js
aiditor.addPanelToDock({
  dock: 'dock-2',
  component: 'three-scene',
  path: 'three-scene.js',
  title: '3D Scene',
})
```

Related: `aiditor.inspectDocks`, `aiditor.runtime.loadScript`, `aiditor.reloadPanel`, `aiditor.replacePanel`

Source: `src/extensions/ai.js`

## `aiditor.inspectDocks`

List current dock ids, names, viewport rects, panels, active panel, and accept rules so agents can choose a real runtime dock.

```js
aiditor.inspectDocks({ layout? })
```

| Param | Type | Description |
|---|---|---|
| `input` | `object` | Tool input. |
| `input.layout` | `string` | Optional registered layout name; omit for all layouts. |

Returns: `object[]` Dock summaries.

```js
aiditor.inspectDocks({})
```

Related: `aiditor.addPanelToDock`, `aiditor.replacePanel`

Source: `src/extensions/ai.js`

## `aiditor.reloadPanel`

Reload one existing panel instance after its component file changes. Keeps the same panel id, dock position, title, props, and component.

```js
aiditor.reloadPanel({ panelId, path?, component? })
```

| Param | Type | Description |
|---|---|---|
| `input` | `object` | Tool input. |
| `input.panelId` | `string` | Existing panel instance id returned by aiditor.inspectDocks. |
| `input.path` | `string` | Optional workspace JS file to load with replace semantics before rebuilding the panel. |
| `input.component` | `string` | Optional safety check; must match the current panel component. Use replacePanel to change component. |

Returns: `object` Applied operation result.

```js
aiditor.reloadPanel({
  panelId: 'panel-12',
  path: 'login-panel.js',
})
```

Related: `aiditor.inspectDocks`, `aiditor.addPanelToDock`, `aiditor.replacePanel`

Source: `src/extensions/ai.js`

## `aiditor.replacePanel`

Replace one existing panel instance with another component while keeping its dock position. Use reloadPanel after editing the same component file.

```js
aiditor.replacePanel({ panelId, component, path?, title?, props?, transient?, discardDirty? })
```

| Param | Type | Description |
|---|---|---|
| `input` | `object` | Tool input. |
| `input.panelId` | `string` | Existing panel instance id. |
| `input.component` | `string` | Registered component id. |
| `input.path` | `string` | Optional workspace JS file to load before replacing. |
| `input.title` | `string` | Optional panel title. |
| `input.props` | `object` | Optional component props. |
| `input.discardDirty` | `boolean` | Must be true to replace a dirty panel. |

Returns: `object` Applied operation result.

```js
aiditor.replacePanel({
  panelId: 'panel-12',
  component: 'cube-inspector',
  path: 'cube-inspector.js',
})
```

Related: `aiditor.inspectDocks`, `aiditor.addPanelToDock`, `aiditor.reloadPanel`

Source: `src/extensions/ai.js`
