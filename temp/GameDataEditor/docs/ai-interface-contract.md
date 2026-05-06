# GameDataEditor AI Interface Contract

Status: active design contract

This document defines the shape that GDE exposes to AI. The goal is high
accuracy: tools should be easy for a model to call correctly, and incorrect
calls should return enough structure for the model to repair the next call.

## 1. Layering

```text
EF.ai
  generic agents / tools / targets / resources / ChangeSet / permissions

GDE.ai
  GDE resource resolver
  GDE target constructors
  GDE tool registrations
  GDE patch validation / preview / apply
  GDE patch op registry
  GDE skills and agent templates

Project plugins
  project-specific skills and optional high-level tools
```

Framework code must not know GDE table, asset, or card-style semantics.
GDE code must not bypass the framework AI lifecycle for tool calls, approvals,
or ChangeSet rendering.

## 2. Mutation Rule

Every GDE mutation goes through this pipeline:

```text
tool args
  -> GDE patch
  -> validatePatch
  -> previewPatch
  -> ef.changeSet
  -> approval
  -> applyPatch
  -> State + History
```

No AI tool should directly mutate `State` unless it is the approved apply phase
of a `gde.patch`.

## 3. Tool Result Shape

Tools should return one of these shapes.

Successful read:

```js
{
  ok: true,
  data: any
}
```

Successful preview:

```js
{
  type: "ef.changeSet",
  status: "pending",
  resources: [],
  apply: { mode: "atomic", adapter: "gde.patch", payload: {} },
  validation: { ok: true, warnings: [], errors: [] }
}
```

Recoverable failure:

```js
{
  ok: false,
  errors: [{
    code: "FIELD_NOT_FOUND",
    path: "ops[0].field",
    message: "Field not in struct_def: rarity",
    expected: "field declared in table struct_def",
    received: "rarity",
    allowedValues: ["name", "icon", "price"],
    suggestedFix: "Call gde.getTableSchema and use one of the declared fields.",
    retryWith: {
      tool: "gde.getTableSchema",
      args: { pathKey: "data/items" }
    }
  }]
}
```

`message` is for humans. `code`, `path`, `allowedValues`, `suggestedFix`, and
`retryWith` are for AI repair.

## 4. Patch Op Registry

Every patch operation is registered once with metadata:

```js
{
  op: "setField",
  title: "Set field",
  operation: "update",
  target: "entity",
  requiresTable: true,
  requiresEntity: true,
  schema: {}
}
```

The registry is the single source for:

- known operation names
- table/entity requirements
- operation category used by review UI
- future generated schema shown to AI tools

Validation, preview, apply, and ChangeSet rendering should use this registry
instead of duplicating operation lists.

## 5. Batch Tool Direction

Low-level `gde.patch` stays as the canonical write format. High-level batch
tools should produce patches, not mutate directly.

Planned tools:

```text
gde.planBatchSetFields
gde.planBatchCreateEntities
gde.planBatchDeleteEntities
gde.planBalanceNumericField
gde.planStructDefMerge
```

These tools should:

- read or require the affected table schema
- enumerate target ids before editing
- return structured validation errors
- produce a minimal `gde.patch`
- route through `gde.previewPatch`

## 6. Stability Rules

- No compatibility aliases.
- No silent repair during apply. Repair suggestions are returned to AI.
- Bulk edits must enumerate ids before preview.
- New fields must be added to `struct_def` in the same patch.
- New field types must be introduced with `upsertType` in the same patch.
- Asset URLs must be `asset://...` and must exist for `img` / `snd` fields.
- `ref_id` values must resolve unless intentionally empty.
