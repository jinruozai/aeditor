# GameDataEditor AI work plan

## Ownership

GameDataEditor owns project semantics:

- table paths and table definitions
- `struct_def`
- project and builtin `type_config`
- entity ID rules
- ref ID consistency
- asset URL rules
- card style scenes
- import/merge behavior
- GDE patch validation and application

The editor uses framework AI APIs but does not reimplement framework storage, target attachment, or permission checks.

Patch review UI must use the framework ChangeSet contract in `doc/change-set-review-system.md`. GDE owns conversion from `gde.patch` preview to `aeditor.changeSet`; the framework owns review rendering and approval routing.

## Target Map

| Surface | Target kind | URI | Read tools | Mutation path |
| --- | --- | --- | --- | --- |
| project summary | `gde.project` | `gde://project` | `gde.getProjectSummary` | none |
| type config root | `gde.type_config` | `gde://type-config` | `gde.getTypeConfig` | `gde.previewPatch` -> `gde.applyPatch` |
| type config row | `gde.type` | `gde://type/<name>` | `gde.getType`, `gde.getTypeConfig` | `gde.previewPatch` -> `gde.applyPatch` |
| table row in left dock | `gde.table` | `gde://table/<pathKey>` | `gde.getTableSchema`, `gde.queryRows`, `gde.summarizeTable` | `gde.previewPatch` -> `gde.applyPatch` |
| table card | `gde.entity` | `gde://entity/<pathKey>/<id>` | `gde.getEntity`, `gde.findReferences` | `gde.previewPatch` -> `gde.applyPatch` |
| inspector field | `gde.field` | `gde://field/<pathKey>/<id>/<field>` | `gde.getField` | `gde.previewPatch` -> `gde.applyPatch` |
| asset item | `gde.asset` | `gde://asset/<asset-path>` | `gde.getAsset`, `gde.findAssetReferences` | `gde.previewPatch` -> `gde.applyPatch` |
| card style | `gde.card_style` | `gde://card-style/<key>` | `gde.getCardStyle` | `gde.previewPatch` -> `gde.applyPatch` |
| card style node | `gde.card_node` | `gde://card-style/<key>/node/<nodeId>` | `gde.getCardStyleNode` | `gde.previewPatch` -> `gde.applyPatch` |

Concrete targets are preferred. `gde.selection` is only a fallback when a selection cannot be expanded into concrete targets.

## Required Tools

Read/query:

- `gde.getProjectSummary`
- `gde.getTypeConfig`
- `gde.getTableSchema`
- `gde.getTableEntities`
- `gde.queryRows`
- `gde.getEntity`
- `gde.getField`
- `gde.getAsset`
- `gde.findReferences`
- `gde.findAssetReferences`
- `gde.searchData`
- `gde.getCardStyle`
- `gde.getCardStyleNode`

Patch:

- `gde.validatePatch`
- `gde.previewPatch`
- `gde.applyPatch`

Specialized bulk helpers:

- `gde.summarizeTable`
- `gde.findInvalidRefs`
- `gde.findUnknownStructFields`
- `gde.planTypeConfigMerge`
- `gde.replaceAssetReferences`

## Patch Schema

All mutations use:

```js
{
  type: "gde.patch",
  title: "Short user-readable title",
  ops: [
    { op: "setField", table, id, field, value },
    { op: "setFields", table, id, fields },
    { op: "setFieldMany", table, ids, field, value },
    { op: "setFieldsMany", table, ids, fields },
    { op: "addEntity", table, id, entity },
    { op: "updateEntity", table, id, fields },
    { op: "deleteEntity", table, id },
    { op: "deleteEntities", table, ids },
    { op: "duplicateEntity", table, id, newId, fields },
    { op: "reorderEntities", table, ids },
    { op: "addTable", table, struct_def },
    { op: "renameTable", table, newTable },
    { op: "deleteTable", table },
    { op: "updateStructDef", table, struct_def },
    { op: "upsertType", name, config },
    { op: "deleteType", name },
    { op: "setTableCardStyle", table, styleKey },
    { op: "upsertCardStyle", key, cardStyle },
    { op: "updateCardNode", styleKey, nodeId, props?, bindings?, layout?, component? },
    { op: "addCardNode", styleKey, parentId, node },
    { op: "deleteCardNode", styleKey, nodeId },
    { op: "setAssetReference", table, id, field, url },
    { op: "clearAssetReference", table, id, field }
  ]
}
```

No alternate patch formats are supported.

Patch tool semantics:

- `gde.validatePatch` checks the patch without producing an applyable UI diff.
- `gde.previewPatch` is the canonical dry-run write tool and must return or be convertible to an atomic `aeditor.changeSet`.
- `gde.applyPatch` applies only an approved patch or approved preview result.
- No alternate mutation tool IDs or compatibility envelopes are supported.

## Validation Rules

- Every table field must exist in the table `struct_def`.
- Every `struct_def` type must resolve through builtin or project type config.
- Patch-local `upsertType` operations count as known for subsequent `struct_def` validation.
- `ref_id` values must reference existing entity IDs unless empty.
- Asset references must point to existing assets when using `asset://`.
- Bulk operations must fail if any requested entity ID does not belong to the target table.
- Card style node patches must target an existing card style and existing node or parent node.
- `updateCardNode` deep-merges `props`, `bindings`, and `layout`; it never rewrites `children`.
- `deleteCardNode` cannot delete the root node.
- `addCardNode` requires a complete node object with unique `id`, `component`, and array `children`.
- Apply must be all-or-nothing at the patch level from the user's perspective: invalid patch returns preview errors and does not mutate state.

## AI Operation Rules

- Read before writing: use the attached target, `gde.get*`, or `gde.queryRows` to inspect current state before creating a patch.
- Bulk modification must first call `gde.queryRows` or a narrower read tool to enumerate the exact affected IDs.
- Bulk modification must then call `gde.previewPatch`; do not apply without a preview and approval.
- New fields must be added to `struct_def`; never write data fields that the schema does not declare.
- New field types must be added to project `type_config` with `upsertType` or resolved through builtin type config.
- `ref_id` values must be verified with existing entity IDs or `gde.findInvalidRefs`.
- Do not invent table paths, IDs, field names, type names, asset URLs, card style keys, or card node IDs.
- Prefer one minimal patch per user-approved logical change.

## UI Integration

- Right-click targetable surfaces include "Ask AI".
- Dragging targetable surfaces into `ai-chatinput` attaches target chips.
- Sending with target chips attaches them to the active agent and clears pending chips.
- AI-generated patches appear in `ai-messages` with preview and approval controls.
- AI-generated patches render as `aeditor.ui.changeReview` using GDE semantic renderers.
- Applying an approved patch records one GDE history entry.

## Implementation Tasks

1. Add missing target bindings across GDE panels.
2. Add missing read/query/bulk helper tools.
3. Add tests around patch validation and apply.
4. Render GDE patch previews clearly in message tool blocks.
5. Add `GDE.ai.patchPreviewToChangeSet` and a `gde.patch` ChangeSet adapter.
6. Update GDE skill with strict data authoring rules.
