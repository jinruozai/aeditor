# inspector API

Generated from structured API comments in `src/`.

## `aiditor.inspector.refresh`

Notify inspector panels to re-read the current selection after external state changes.

```js
aiditor.inspector.refresh()
```

Returns: `void` No return value.

```js
cubeState.color = '#ffcc00'
aiditor.inspector.refresh()
```

Related: `aiditor.inspector.select`, `aiditor.inspector.registerProvider`

Source: `src/ui/inspector.js`

## `aiditor.inspector.registerProvider`

Register the editor-owned provider that turns selected targets of one type into an inspector schema, values, and write handlers.

```js
aiditor.inspector.registerProvider(type, provider, meta?)
```

| Param | Type | Description |
|---|---|---|
| `type` | `string` | Target type matched against target.type or target.kind. |
| `provider` | `object` | Provider with inspect(targets, ctx), plus optional accept(targets). |
| `meta` | `object` | Optional owner/layer metadata; pass { replace: true } only when intentionally replacing an existing provider. |

Returns: `Function` unregister callback.

```js
aiditor.inspector.registerProvider('cube', {
  inspect: function (targets) {
    return {
      schema: {
        x: { type: 'number', label: 'X', step: 0.1 },
        color: { type: 'color', label: 'Color' },
      },
      values: targets.map(function (target) { return target.value }),
      write: function (field, change, ctx) {
        ctx.targets.forEach(function (target, index) {
          target.value[field] = ctx.valueForChange(change, target, index)
        })
      },
    }
  },
})
```

Avoid:

```js
aiditor.inspector.registerProvider({
  id: 'cube',
  getProperties: function () {},
  patchProperties: function () {},
})
```

Related: `aiditor.inspector.select`, `aiditor.inspector.refresh`, `aiditor.ui.propertyForm`

Source: `src/ui/inspector.js`

## `aiditor.inspector.select`

Set the ordered inspector selection. The first target is primary; multi-edit uses only fields present and writable on every target.

```js
aiditor.inspector.select(targets, meta?)
```

| Param | Type | Description |
|---|---|---|
| `targets` | `object\|object[]` | One target or ordered targets; each target should include type or kind. |
| `meta` | `object` | Optional selection metadata for the host/editor. |

Returns: `void` No return value.

```js
aiditor.inspector.select([
  { type: 'cube', id: 'cube-1', value: cubeState },
])
```

Related: `aiditor.inspector.registerProvider`, `aiditor.inspector.refresh`

Source: `src/ui/inspector.js`
