# component API

Generated from structured API comments in `src/`.

## `aeditor.registerComponent`

Register a component that can be used as a panel, toolbar item, UI tree node, or palette item.

```js
aeditor.registerComponent(name, spec, meta?)
```

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Unique component id. |
| `spec` | `object` | Component spec with factory(propsSig, ctx), plus optional defaults/dispose/serialize/deserialize/schema metadata. |
| `meta` | `object` | Optional owner/layer metadata, normally supplied by runtime.loadScript. |

Returns: `object` The registered component spec.

```js
aeditor.registerComponent('hello-panel', {
  label: 'Hello Panel',
  factory: function (propsSig, ctx) {
    var el = document.createElement('div')
    el.textContent = 'Hello'
    return el
  },
  defaults: function () { return { title: 'Hello' } },
})
```

Avoid:

```js
aeditor.registerComponent('hello-panel', { render: function () {} })
```

Related: `aeditor.runtime.loadScript`, `aeditor.addPanelToDock`

Source: `src/core/registry.js`
