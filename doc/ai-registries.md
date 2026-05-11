# AI Registries

This document describes the final registry shape and the current implementation
that must be migrated carefully.

## Final Registry Shape

AI has three primary registries:

```text
tools
context
operations
```

No new model-facing registry should be added for attachments, references,
resources, resolvers, or skills.

Skills are separate from these registries. They shape agent behavior and prompt
rules, but they do not execute actions, read context, or apply changes.

Target API:

```js
aeditor.ai.tools.register(name, spec)
aeditor.ai.tools.unregister(name)
aeditor.ai.tools.unregisterPrefix(prefix)
aeditor.ai.tools.get(name)
aeditor.ai.tools.list(prefix)

aeditor.ai.context.register(name, spec)
aeditor.ai.context.unregister(name)
aeditor.ai.context.unregisterPrefix(prefix)
aeditor.ai.context.get(name)
aeditor.ai.context.list(prefix)

aeditor.ai.operations.register(name, spec)
aeditor.ai.operations.unregister(name)
aeditor.ai.operations.unregisterPrefix(prefix)
aeditor.ai.operations.get(name)
aeditor.ai.operations.list(prefix)
```

Dotted names are the only grouping mechanism.

Modules do not get separate AI channels. A module exposes model-facing behavior
by contributing named registry entries:

```text
workspace module -> workspace.* tools
theme module     -> theme.* tools / context
dock module      -> dock.* tools / operations
ui module        -> ui.* tools / context / operations
domain code      -> domain-prefix.* tools / context / operations
```

## Current Tool Registry

Current code exposes a flat tool registry:

```js
aeditor.ai.registerTool(name, spec, meta)
aeditor.ai.unregisterTool(name, meta)
aeditor.ai.getTool(name)
aeditor.ai.listTools()
```

The existing registry is functional and should be wrapped or migrated into
`aeditor.ai.tools.*` without changing tool execution semantics.

Current built-in tool prefixes:

```text
workspace.*
aeditor.*
agent.*
quest.*
message.*
```

## Context, Reference, Target

Final definitions:

```text
Context
  A registered readable model-context provider.

Reference
  A normalized pointer to one concrete thing, usually a URI plus kind and meta.

Target
  A user-facing attachable thing. When sent to chat, it becomes one or more
  references.
```

So the flow is:

```text
user action -> target -> reference -> context read/tool call
```

`context` is the registry. `references` is the pointer protocol. `targets` is the
interaction surface.

New API should use the name `context`, not `resources`.

Everything else should fold into that flow:

```text
attachment      runtime chat/session state
rich prompt ref inline reference inside message text
resolver        implementation detail behind context reads
```

These are useful implementation pieces, not new architecture categories.

## Current References And Context

There are currently two similar meanings:

1. `aeditor.ai.resources` is a signal containing attached chat/session items.
2. `aeditor.ai.references` is a provider registry for readable editor
   references.

Final design should avoid this collision.

Recommended final split:

```text
aeditor.ai.attachments      // runtime attached items in chat/session
aeditor.ai.context          // registry of readable model-context providers
aeditor.ai.references       // normalized reference protocol
```

Current reference APIs:

```js
aeditor.ai.references.register(name, provider, meta)
aeditor.ai.references.unregister(name, meta)
aeditor.ai.references.get(name)
aeditor.ai.references.list(filter)
aeditor.ai.references.describe(ref)
aeditor.ai.references.read(ref, options, ctx)
aeditor.ai.references.schema(ref, ctx)
aeditor.ai.references.search(query, ctx)
aeditor.ai.references.selection(ctx)
```

The reference protocol is valuable and should not be lost. It should remain a
small pointer/helper protocol under the context flow, not a competing registry
concept.

Current resolver APIs:

```js
aeditor.ai.registerResourceResolver(name, resolver)
aeditor.ai.getResourceResolver(name)
aeditor.ai.listResourceResolvers()
```

Resolvers are the bridge from normalized references to readable content. In the
final design, a resolver is simply an implementation detail of a context
provider. It should not become a fourth registry.

Reference providers, resource resolvers, target providers, and rich prompt refs
all support one user-facing idea:

```text
the user points at something -> the model can read the right context
```

Keep that idea unified even if current code has several helper registries.

Migration target:

```text
aeditor.ai.resources              -> aeditor.ai.attachments
aeditor.ai.references provider API -> context-backed reference protocol
registerResourceResolver           -> internal context resolver helper
```

## Operations

Current operations are already close to the final design:

```js
aeditor.ai.operations.register(name, spec, meta)
aeditor.ai.operations.unregister(name, meta)
aeditor.ai.operations.get(name)
aeditor.ai.operations.list(filter)
aeditor.ai.operations.preview(input, ctx)
aeditor.ai.operations.apply(preview, ctx)
```

Operations support validation, risk, preview storage, apply, and transaction
integration.

Final changes needed:

- add `unregisterPrefix(prefix)`
- align call shape with `preview(name, input)` if desired
- keep existing preview/apply semantics

## Targets

Targets are things users can add to chat.

Implemented APIs:

```js
aeditor.ai.registerTargetProvider(name, provider)
aeditor.ai.getTargetProvider(name)
aeditor.ai.listTargetProviders()
aeditor.ai.captureTarget(input)
aeditor.ai.normalizeTarget(input)
aeditor.ai.addTarget(target)
aeditor.ai.attachTargetToAgent(agentId, target)
aeditor.ai.attachTargetsToAgent(agentId, targets)
aeditor.ai.addTargetsToChat(targets)
aeditor.ai.attach(el, targetOrFn, options)
aeditor.ai.installTargetDrop(el, options)
aeditor.ai.readTargetFromDragEvent(event)
aeditor.ai.writeTargetDragData(event, targets)
aeditor.ai.fileToTarget(file)
```

This is the implemented "add to chat" foundation. It must stay as a first-class
part of the AI layer.

## Rich Prompt

`aeditor.ai.richPrompt` stores inline references inside text.

Implemented APIs:

```js
aeditor.ai.richPrompt.empty()
aeditor.ai.richPrompt.normalize(draft)
aeditor.ai.richPrompt.insertText(draft, index, text)
aeditor.ai.richPrompt.insertRef(draft, index, reference)
aeditor.ai.richPrompt.insertRefs(draft, index, references)
aeditor.ai.richPrompt.deleteRange(draft, start, end)
aeditor.ai.richPrompt.slice(draft, start, end)
aeditor.ai.richPrompt.refs(draft)
aeditor.ai.richPrompt.toPlainText(draft)
aeditor.ai.richPrompt.toModelText(draft)
aeditor.ai.richPrompt.content(draft)
aeditor.ai.richPrompt.fromContent(value)
```

Rich prompt is a UI/data helper for message composition. It is not a separate
AI registry category.

## Change Set

`aeditor.changeSet` is currently implemented for grouped reviewable changes.

Implemented APIs:

```js
aeditor.changeSet.create(input)
aeditor.changeSet.update(id, patch)
aeditor.changeSet.find(id)
aeditor.changeSet.list()
aeditor.changeSet.normalize(input)
aeditor.changeSet.apply(idOrSet, scope, actor)
aeditor.changeSet.reject(idOrSet, scope, actor)
aeditor.changeSet.registerAdapter(name, adapter)
aeditor.changeSet.registerRenderer(name, renderer)
```

Final design relationship:

- Operation: one previewable action.
- ChangeSet: review UI and grouped application for many changes/targets.

ChangeSet should remain because it solves grouped review and partial apply.
