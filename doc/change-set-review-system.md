# ChangeSet Review System

Status: final design contract
Scope: framework-level change review, AI previews, editor-specific semantic diffs

## 1. Goal

EditorFrame needs one reusable review system for changes proposed by AI, plugins, imports, generators, or batch tools.

The framework must support code diffs like Codex / Claude / Trae style editors, structured data diffs like GameDataEditor, and future editor domains such as animation timelines, material graphs, documents, images, and asset references.

The final pipeline is:

```text
tool / plugin / user action
  -> domain preview
  -> ef.changeSet
  -> EF.ui.changeReview
  -> approve / reject
  -> domain adapter apply
  -> project history / undo
```

The review system is not a replacement for project history. It is the approval and inspection layer before a domain adapter mutates project data.

## 2. Design Principles

- **Generic container, domain semantics**: framework owns ChangeSet structure and review UI; applications own conversion from domain patches into meaningful changes.
- **Semantic first**: structured data should render as domain fields, keys, tracks, nodes, references, or assets. JSON is only the fallback.
- **Safe apply**: every ChangeSet declares whether it is atomic, per-resource, or per-change. UI only exposes actions the adapter can safely apply.
- **No black-box AI edits**: AI tool previews must be inspectable before apply.
- **No compatibility aliases**: final ids and schemas only.
- **High performance**: large change sets must support collapsed groups and virtualized lists.
- **Composable renderers**: applications and plugins register renderers for their own change kinds without modifying framework internals.

## 3. Core Data Model

### ChangeSet

```js
{
  type: "ef.changeSet",
  id: "cs_...",
  title: "Balance early weapons",
  description: "",
  source: {
    kind: "ai.tool",
    agentId: "agent_1",
    messageId: "msg_1",
    toolCallId: "tc_1",
    toolId: "gde.previewPatch"
  },
  status: "pending",
  createdAt: 1710000000000,
  updatedAt: 1710000000000,

  summary: {
    resourceCount: 3,
    changeCount: 12,
    insertions: 2,
    deletions: 1,
    updates: 9,
    warnings: 0,
    errors: 0
  },

  resources: [],

  apply: {
    mode: "atomic",
    adapter: "gde.patch",
    payload: {}
  },

  validation: {
    ok: true,
    warnings: [],
    errors: []
  },

  meta: {}
}
```

`status` values:

```txt
pending
partiallyApplied
applied
rejected
failed
```

### Change Resource

```js
{
  id: "res_1",
  uri: "gde://entity/data/items/100",
  kind: "gde.entity",
  title: "Iron Sword",
  subtitle: "data/items · ID 100",
  icon: "table",
  status: "pending",
  severity: "normal",
  changes: [],
  meta: {}
}
```

`severity` values:

```txt
normal
warning
danger
```

### Change Item

```js
{
  id: "chg_1",
  kind: "gde.field",
  path: "price",
  title: "price",
  before: 20,
  after: 25,
  valueKind: "number",
  status: "pending",
  severity: "normal",
  applyMode: "wholePatch",
  meta: {}
}
```

`kind` identifies renderer selection. Examples:

```txt
text.hunk
text.file
gde.field
gde.entity
gde.table
gde.type
gde.card_node
asset.reference
timeline.keyframe
graph.node
document.range
json.value
```

`applyMode` values:

```txt
wholePatch
resource
change
readonly
```

`wholePatch` means this item is part of an atomic patch and cannot be accepted independently.

## 4. Apply Modes

ChangeSet apply mode is the hard safety boundary.

```js
apply: {
  mode: "atomic" | "perResource" | "perChange",
  adapter: "gde.patch",
  payload: {}
}
```

### atomic

Only whole ChangeSet apply/reject is allowed.

Use for:

- GameDataEditor patch preview
- database migrations
- schema/type changes
- operations that must validate as a whole

### perResource

One resource can be accepted/rejected at a time.

Use for:

- multiple files where each file patch is independent
- independent imported assets
- independent generated documents

### perChange

Each change item can be accepted/rejected.

Use for:

- code hunks
- document suggestions
- individual property/keyframe changes when the domain adapter can regenerate a valid patch

## 5. Public API

```js
EF.changeSet.create(spec)
EF.changeSet.update(id, patch)
EF.changeSet.find(id)
EF.changeSet.list()
EF.changeSet.apply(id, scope, actor)
EF.changeSet.reject(id, scope, actor)
EF.changeSet.normalize(spec)

EF.changeSet.registerAdapter(id, adapter)
EF.changeSet.getAdapter(id)
EF.changeSet.registerRenderer(kind, renderer)
EF.changeSet.getRenderer(kind)
```

`scope`:

```js
{ type: "all" }
{ type: "resource", resourceId: "res_1" }
{ type: "change", resourceId: "res_1", changeId: "chg_1" }
```

`normalize` ensures:

- ids exist
- resource/change statuses exist
- summary is derived if omitted
- invalid apply mode removes unsupported actions from UI

## 6. Adapter Contract

Adapters own mutation. Framework never edits domain state directly.

```js
EF.changeSet.registerAdapter("gde.patch", {
  canApply(changeSet, scope, ctx) {},
  apply(changeSet, scope, ctx) {},
  reject(changeSet, scope, ctx) {},
  openTarget(resource, change, ctx) {}
})
```

`apply` returns:

```js
{
  applied: true,
  historyId: "hist_...",
  message: "Applied 12 changes"
}
```

Semantic failure returns:

```js
{
  applied: false,
  error: "Validation failed",
  validation: { errors: [] }
}
```

Async adapters are allowed. Framework treats a rejected promise or `applied !== true` as failure.

## 7. Renderer Contract

```js
EF.changeSet.registerRenderer("gde.field", {
  match(change, resource, changeSet) {},
  render(change, ctx) {},
  renderResourceHeader(resource, ctx) {},
  renderSummary(changeSet, ctx) {}
})
```

Renderer context:

```js
{
  changeSet,
  resource,
  change,
  mode: "compact" | "full",
  ui: EF.ui,
  actions: {
    apply(scope),
    reject(scope),
    openTarget(resource, change),
    copy(value)
  }
}
```

Fallback renderers:

- `json.value`
- `text.value`
- `asset.reference`

## 8. UI Component

Framework component:

```js
EF.ui.changeReview({
  changeSet,
  mode: "compact" | "full",
  view: "semantic" | "unified" | "sideBySide",
  allowApply: true,
  allowReject: true,
  onApply,
  onReject,
  onOpenTarget
})
```

Responsibilities:

- summary header
- validation warning/error display
- grouped resource list
- collapsible resources
- collapsible change groups
- renderer dispatch
- status display
- apply/reject actions based on `apply.mode`
- copy summary/raw payload
- open target callback
- virtualized rendering for large lists

Compact default layout:

```text
Balance early weapons
12 changes · 3 resources · 0 errors
[Apply] [Reject] [Copy]

▾ data/items · 8 changes
  ▾ Iron Sword · 2 changes
     price       20 -> 25
     rarity      common -> rare
```

## 9. AI Tool Integration

AI message panel recognizes ChangeSet previews:

```js
if (EF.changeSet.isChangeSet(toolCall.preview)) {
  render EF.ui.changeReview
} else {
  render existing JSON preview fallback
}
```

Tool-call apply should prefer ChangeSet adapter application when preview is an `ef.changeSet`.

For atomic tools such as `gde.previewPatch`, the `Apply` button applies the whole ChangeSet through the adapter. The model does not need to call a second mutation tool after preview. This keeps user approval explicit.

## 10. Code Editor Diff Support

Code editors use `text.hunk` and `file.code` resources.

```js
{
  uri: "file://src/main.js",
  kind: "file.code",
  title: "src/main.js",
  changes: [
    {
      kind: "text.hunk",
      beforeRange: { startLine: 10, endLine: 15 },
      afterRange: { startLine: 10, endLine: 18 },
      beforeText: "...",
      afterText: "...",
      hunks: [
        { type: "context", text: "function foo() {" },
        { type: "delete", text: "  return 1" },
        { type: "insert", text: "  return 2" }
      ],
      baseHash: "..."
    }
  ]
}
```

Code adapter requirements:

- verify `baseHash` before apply
- support side-by-side and unified renderer
- support per-file or per-hunk apply only when the patch can be safely regenerated
- show conflict state if the file changed after preview

## 11. GameDataEditor Diff Support

GDE converts patch preview to ChangeSet:

```js
GDE.ai.patchPreviewToChangeSet(preview)
```

The first GDE adapter uses:

```js
apply.mode = "atomic"
apply.adapter = "gde.patch"
apply.payload = preview.patch
```

GDE semantic changes:

```txt
gde.field
gde.entity
gde.table
gde.type
gde.card_node
asset.reference
```

Examples:

```text
price
20 -> 25

tags
+ legendary
- sword

CardStyle/default / name-text
props.size       sm -> md
layout.oMin.x    0 -> 4

icon
[old thumbnail] -> [new thumbnail]
```

GDE keeps actual mutation in `GDE.ai.patch`. ChangeSet only reviews and routes approval.

## 12. Future Domain Examples

Animation editor:

```txt
timeline.keyframe
track.clip
curve.point
sprite.frame
```

Material/graph editor:

```txt
graph.node
graph.edge
graph.param
```

Document editor:

```txt
document.range
document.block
document.mark
```

Asset editor:

```txt
asset.reference
asset.generated
asset.metadata
```

## 13. Implementation Phases

Phase 1:

- `EF.changeSet` core registry/store
- `EF.ui.changeReview`
- fallback JSON/value renderers
- `ai-messages` ChangeSet preview rendering
- tests for atomic apply/reject and failed apply

Phase 2:

- `GDE.ai.patchPreviewToChangeSet`
- `gde.patch` adapter
- GDE semantic renderers
- GDE patch preview displayed through `EF.ui.changeReview`
- tests for field/entity/type/card node previews

Phase 3:

- text hunk renderer
- code/file ChangeSet helpers
- side-by-side/unified view modes
- baseHash conflict state

Phase 4:

- virtualized large change sets
- per-resource/per-change apply flows
- open target integration across editors
- richer renderer plugin documentation

## 14. Quality Gates

- No domain mutation inside framework.
- No raw JSON as primary UI when a semantic renderer exists.
- `Apply` only appears for supported scopes.
- Failed adapter result never shows as applied.
- Async adapter errors are caught and displayed.
- Large ChangeSets remain interactive.
- GDE first version remains atomic until partial patch regeneration is explicitly implemented.
