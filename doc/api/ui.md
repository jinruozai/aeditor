# ui API

Generated from structured API comments in `src/`.

## `aiditor.ui.propertyForm`

Render a schema-driven property editor for one target or a multi-target batch edit. Multi-target reads use the first target value; writes fan out only through enabled fields.

```js
aiditor.ui.propertyForm(opts)
```

| Param | Type | Description |
|---|---|---|
| `opts` | `object` | Form options. |
| `opts.targets` | `Signal<object[]>\|object[]` | Targets to edit. |
| `opts.schema` | `Signal<object>\|object` | Field schema passed to editorFor. |
| `opts.onChange` | `Function` | Optional persistence hook: (field, newValue, targets, meta) => void. |
| `opts.requireAllTargets` | `boolean` | When true, disable fields missing from any target. |
| `opts.canEdit` | `Function` | Optional field gate: (field, targets, rawField) => boolean. |

Returns: `HTMLElement` Property form root element.

```js
var form = aiditor.ui.propertyForm({
  targets: aiditor.signal([{ x: 0, color: '#44aaff' }]),
  schema: { x: { type: 'number' }, color: { type: 'color' } },
})
```

Related: `aiditor.inspector.registerProvider`

Source: `src/ui/form/propertyForm.js`
