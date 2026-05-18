# AI Reference / Operation Architecture

AIditor treats AI as another editor operator. The framework should not know
game data tables, animation keyframes, theme tokens, or node graphs. It should
know how to reference editor objects, ask the host how to read them, preview a
host operation, and commit that operation through the host transaction path.

## First Principles

An editor object that AI can work with has five questions:

1. What is it?
2. How can it be read or summarized?
3. What schema describes valid data for it?
4. What operations are allowed for it?
5. How is a change previewed, applied, and recorded?

The architecture therefore has five primary concepts:

```text
Reference    Stable identity for an editor object.
Provider     Host-owned interpreter for references.
Operation    Host-owned edit or command with schema/preview/apply.
Preview      Structured change proposal.
Transaction  Host-owned commit boundary for undo/dirty/history.
```

Targets, resources, context refs, tool calls, context-menu items, and drag
payloads are UI or transport forms of the same Reference concept.

## Reference

A Reference is a small JSON-safe object:

```js
{
  uri: "gde://table/monster",
  kind: "gde.table",
  title: "Monster",
  summary: "Table with 1208 rows",
  meta: { version: 42 }
}
```

`uri` is the stable identity. The URI scheme chooses the provider. `kind` is a
domain type useful for display and model guidance. `meta` should stay compact;
large payloads belong in `provider.read()`.

Examples:

```text
demo://component/button
demo://property/button/color
gde://entity/monster/1001
gde://field/monster/1001/hp
gani://state/s1/track/0/3
gani://state/s1/selection
theme://token/--aiditor-brand
```

Index-heavy editors should include enough metadata to detect stale references,
for example `stateId`, `version`, object name, key time, or a lightweight
fingerprint.

## Provider

Each domain registers a provider:

```js
aiditor.ai.references.register("gde", {
  describe(ref, ctx) {},
  read(ref, options, ctx) {},
  schema(ref, ctx) {},
  capabilities(ref, ctx) {},
  search(query, ctx) {},
  selection(ctx) {},
  snapshot(ref, ctx) {}
})
```

Provider responsibilities:

- `describe`: short model/display summary.
- `read`: detailed payload, optionally paginated or projected.
- `schema`: data shape, validation hints, examples, enum/ref info.
- `capabilities`: operations available for the reference.
- `search`: discover references by query.
- `selection`: current editor selection as references.
- `snapshot`: optional visual media for viewports, UV editors, timelines, etc.

For table editors, `schema` is mandatory for accurate AI edits. It must expose
field types, required fields, enums, refs, structs, lists, readonly fields,
examples, and format hints. Accuracy comes from schema plus validation, not from
prompt wording.

## Operation

All writes and editor commands go through host-owned operations:

```js
aiditor.ai.operations.register("gde.patch", {
  title: "Patch Game Data",
  schema: patchSchema,
  risk(input, ctx) {},
  preview(input, ctx) {},
  apply(preview, ctx) {}
})
```

Operation schemas may be static or generated from a reference capability. Hosts
should expose clear operations for common granularities:

```text
gde.setField
gde.batchPatchRows
gde.replaceRows
gde.replaceTable
gani.setPointValues
gani.transformPoints
gani.retimeKeyframes
gani.setSelection
```

Large or destructive operations are allowed, but they must advertise risk and
produce a preview that shows scale and impact.

## Preview

`preview()` returns a structured proposal:

```js
{
  ok: true,
  title: "Set monster hp",
  summary: "monster/1001.hp: 50 -> 80",
  refs: ["gde://field/monster/1001/hp"],
  risk: "edit",
  changes: [
    { ref: "gde://field/monster/1001/hp", field: "hp", before: 50, after: 80 }
  ],
  media: []
}
```

Validation failures are also structured:

```js
{
  ok: false,
  errors: [
    { path: "rows[3].drop.count", message: "count must be >= 1", expected: "int >= 1", actual: -2 }
  ]
}
```

The model is expected to repair invalid input and preview again. `apply()` must
not trust model input; it applies only host-validated data.

## Transaction

The framework exposes a transaction bridge:

```js
aiditor.ai.transactions.configure({
  run(label, fn, meta) {
    history.begin(label)
    try {
      const value = fn()
      history.commit(meta)
      return value
    } catch (err) {
      history.rollback()
      throw err
    }
  }
})
```

If no bridge is configured, the framework executes the function directly.
Operation implementations can call `ctx.transaction(label, fn, meta)`.

## Permissions

Permission checks should use:

```text
actor + uri + operation + risk + phase
```

Phases are `read`, `preview`, and `apply`. Risks are:

```text
read
view
edit
destructive
external
```

`full access` may auto-apply ordinary edit operations. Destructive and external
operations should remain confirmable unless the application explicitly allows
them.

## Framework Tools

The AI runtime exposes a small fixed tool surface:

```text
aiditor.readReference
aiditor.searchReferences
aiditor.getSelection
aiditor.getCapabilities
aiditor.previewOperation
aiditor.applyOperation
```

Domain power comes from registered providers and operations, not from creating a
new framework tool for every domain object.

## Developer API

UI code stays thin:

```js
aiditor.ai.attach(rowEl, GDE.refs.entity(table, id), { drag: true })
aiditor.ai.attach(labelEl, GDE.refs.field(table, id, field), { menu: true })
```

`aiditor.ai.attach` is an alias for the existing target binding behavior. The visible
menu item remains `Add to Chat`.

Property rows may pass references directly:

```js
aiditor.ui.propRow({
  label: "HP",
  control,
  ai: GDE.refs.field("monster", id, "hp")
})
```

That convenience can be added by UI components without changing the core
protocol.

## Compatibility

The old target/resource/tool APIs remain supported:

- `target` is normalized as a Reference.
- `resourceResolver.resolve()` is a legacy provider read path.
- Existing domain tools still work.
- New generic `editor.*` tools work alongside domain tools.

Projects can migrate incrementally by registering providers first, then moving
write tools into operations.
