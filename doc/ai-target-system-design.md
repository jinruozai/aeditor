# AI Target System

Status: historical background, superseded by `doc/ai-reference-operation-architecture.md`
Scope: generic EditorFrame AI target protocol plus GameDataEditor target map

New code should use `EF.ai.attach(...)`, `EF.ai.references`, and `EF.ai.operations`.

EditorFrame AI is not tied to a specific editor. The framework defines how UI objects become stable AI-addressable targets; applications define how those targets resolve into domain data and tools.

## Goals

- **Precise**: AI receives stable target URIs and structured summaries, not vague UI text.
- **Safe**: Targets locate data only. Mutations must go through tools, preview, approval, and application history.
- **Reusable**: GameDataEditor, animation editors, material editors, and other tools use the same target protocol.
- **Low coupling**: Panels bind DOM to targets; AI runtime resolves resources and calls tools.
- **Final-only**: No legacy target IDs, old component IDs, or compatibility URI formats are part of this contract.

## Core Target Model

```js
{
  resolver: "gde",
  uri: "gde://entity/data/items/1001",
  kind: "gde.entity",
  title: "data/items / Iron Sword",
  summary: "Weapon item, level 3, price 120",
  meta: {
    table: "data/items",
    id: "1001"
  },
  capabilities: ["read", "patch", "references"],
  tools: ["gde.getEntity", "gde.findReferences", "gde.previewPatch", "gde.applyPatch"]
}
```

`uri` is the stable identity. `resolver` decides how the target is resolved for AI context. `tools` tells the model which registered tools are relevant; it does not grant permission by itself.

## Framework API

```js
EF.ai.registerTargetProvider(id, provider)
EF.ai.captureTarget(source, ctx)
EF.ai.normalizeTarget(target)
EF.ai.addTarget(target)
EF.ai.attach(el, targetOrFn, opts)
EF.ai.installTargetDrop(el, opts)
EF.ai.attachTargetsToAgent(agentId, targets)
```

`attach` may enable drag, context menu, or both:

```js
EF.ai.attach(el, function () {
  return {
    resolver: "gde",
    uri: "gde://field/data/items/1001/price",
    kind: "gde.field",
    title: "data/items / 1001 / price"
  };
}, { draggable: true, contextMenu: true });
```

Framework drag MIME types:

```txt
application/x-ef-ai-target
application/x-ef-ai-target-list
```

## Runtime Context Injection

Agent `contextRefs` are resolved before a provider request. The model receives:

- target `uri`, `kind`, `title`, `summary`, and `meta`
- resolver summary payload
- permission-filtered resource content only

Large data must stay behind tools. Context injection is for orientation and planning; full table/entity/card-style reads should use GDE tools.

## Final AI Component IDs

Only these framework panel component IDs are valid:

| ID | Purpose |
| --- | --- |
| `ai-agents-list` | Agent and group browser |
| `ai-chatinput` | Composer, target chips, provider/model/mode/permission controls |
| `ai-messages` | Active agent transcript, tool calls, previews, results |

No old panel IDs or aliases are supported.

## GameDataEditor Target Map

| Surface | Target kind | URI | Primary read tools | Mutation path |
| --- | --- | --- | --- | --- |
| Project summary | `gde.project` | `gde://project` | `gde.getProjectSummary` | none |
| Type config root | `gde.type_config` | `gde://type-config` | `gde.getTypeConfig` | `gde.previewPatch` -> `gde.applyPatch` |
| Type config row | `gde.type` | `gde://type/<name>` | `gde.getType`, `gde.getTypeConfig` | `gde.previewPatch` -> `gde.applyPatch` |
| Table row/list entry | `gde.table` | `gde://table/<pathKey>` | `gde.getTableSchema`, `gde.queryRows`, `gde.summarizeTable` | `gde.previewPatch` -> `gde.applyPatch` |
| Table card/entity | `gde.entity` | `gde://entity/<pathKey>/<id>` | `gde.getEntity`, `gde.findReferences` | `gde.previewPatch` -> `gde.applyPatch` |
| Inspector field | `gde.field` | `gde://field/<pathKey>/<id>/<field>` | `gde.getField` | `gde.previewPatch` -> `gde.applyPatch` |
| Asset item | `gde.asset` | `gde://asset/<asset-path>` | `gde.getAsset`, `gde.findAssetReferences` | `gde.previewPatch` -> `gde.applyPatch` |
| Card style | `gde.card_style` | `gde://card-style/<key>` | `gde.getCardStyle` | `gde.previewPatch` -> `gde.applyPatch` |
| Card style node | `gde.card_node` | `gde://card-style/<key>/node/<nodeId>` | `gde.getCardStyleNode` | `gde.previewPatch` -> `gde.applyPatch` |
| Selection fallback | `gde.selection` | `gde://selection/current` | selection-specific concrete tools | expand to concrete targets first |

Concrete targets are mandatory when they can be produced. `gde.selection` is only for complex selections that cannot be represented as concrete target refs.

## GDE Tool List

Read/query tools:

```txt
gde.getProjectSummary
gde.getTypeConfig
gde.getType
gde.getTableSchema
gde.getTableEntities
gde.queryRows
gde.getEntity
gde.getField
gde.getAsset
gde.findReferences
gde.findAssetReferences
gde.searchData
gde.getCardStyle
gde.getCardStyleNode
gde.summarizeTable
gde.findInvalidRefs
gde.findUnknownStructFields
gde.planTypeConfigMerge
gde.replaceAssetReferences
```

Patch tools:

```txt
gde.validatePatch
gde.previewPatch
gde.applyPatch
```

`gde.previewPatch` is the canonical dry-run mutation tool. `gde.applyPatch` may only apply an approved patch result. No alternate patch tool names or compatibility patch envelopes are part of the final contract.

## AI Operation Rules

- Read before writing. Use target refs, `gde.get*`, or `gde.queryRows` to inspect current state before proposing a patch.
- Bulk edits must call `gde.queryRows` or a narrower read tool to enumerate affected IDs before patch preview.
- Bulk edits must call `gde.previewPatch` before apply, even if the user asks for a direct change.
- Fields used in entity data must exist in that table's `struct_def`.
- Field types used by `struct_def` must exist in builtin or project `type_config`, or be added in the same patch with `upsertType`.
- `ref_id` values must point to existing entity IDs unless the field is intentionally empty.
- Do not invent table paths, entity IDs, field names, type names, asset URLs, card style keys, or card node IDs.
- `asset://` references must resolve to existing project assets.
- Use one minimal `gde.patch` per user-approved logical change.

## Animation / Visual Editor Example

Other editors can define their own targets:

```txt
anim://clip/<clipId>
anim://track/<clipId>/<trackId>
anim://keyframe/<clipId>/<trackId>/<time>
mesh://selection/<meshId>/<selectionId>
```

They still follow the same rule: targets locate data; project tools preview and apply mutations.

## UX Contract

- Targetable surfaces can be dragged to `ai-chatinput`.
- Relevant context menus include "Add to Chat".
- Target chips show `kind + title` and are removable.
- Sending a message attaches pending targets to the active agent and clears pending chips.
- Patch previews render in `ai-messages` and require approval before apply.
