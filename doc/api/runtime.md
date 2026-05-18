# runtime API

Generated from structured API comments in `src/`.

## `aeditor.runtime.loadScript`

Execute a workspace or host script with default owner/layer metadata so its registrations can be cleaned up as one contribution group.

```js
aeditor.runtime.loadScript({ id?, source?, url?, path?, owner?, layer?, type? })
```

| Param | Type | Description |
|---|---|---|
| `input` | `object` | Script loading options. |
| `input.source` | `string` | Inline JavaScript source text. Use source or url. |
| `input.url` | `string` | URL to fetch and execute. Use source or url. |
| `input.path` | `string` | Optional display/sourceURL path, commonly the workspace path. |
| `input.owner` | `string` | Owner attached to registrations made during execution. |
| `input.layer` | `string` | Registration layer, usually workspace, extension, or builtin. |

Returns: `Promise<object>` Load result with ok/id/owner/layer/type.

```js
aeditor.runtime.loadScript({
  path: 'three-scene.js',
  source: text,
  owner: 'workspace:game',
  layer: 'workspace',
})
```

Related: `aeditor.registerComponent`, `aeditor.addPanelToDock`

Source: `src/core/runtime.js`
