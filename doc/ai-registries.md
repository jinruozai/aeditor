# AI Registries

This document describes the registry shape used by the current implementation.

## Registry Shape

AI has three primary registries:

```text
tools
context
operations
```

No new model-facing registry should be added for attachments, references, or
skills.

Skills are separate from these registries. They shape agent behavior and prompt
rules, but they do not execute actions, read context, or apply changes.

Public API:

```js
aeditor.ai.tools.register(name, spec, meta)
aeditor.ai.tools.unregister(name)
aeditor.ai.tools.unregisterOwner(owner)
aeditor.ai.tools.unregisterPrefix(prefix)
aeditor.ai.tools.get(name)
aeditor.ai.tools.list(prefix)
aeditor.ai.tools.visible(name, requestContext, explicit)
aeditor.ai.tools.visibleList(names, requestContext, explicit)
aeditor.ai.tools.meta(name)

aeditor.ai.context.register(name, spec, meta)
aeditor.ai.context.unregister(name, meta)
aeditor.ai.context.unregisterOwner(owner)
aeditor.ai.context.unregisterPrefix(prefix)
aeditor.ai.context.get(name)
aeditor.ai.context.list(prefix)
aeditor.ai.context.meta(name)

aeditor.ai.operations.register(name, spec, meta)
aeditor.ai.operations.unregister(name, meta)
aeditor.ai.operations.unregisterOwner(owner)
aeditor.ai.operations.unregisterPrefix(prefix)
aeditor.ai.operations.get(name)
aeditor.ai.operations.list(prefixOrFilter)
aeditor.ai.operations.meta(name)
aeditor.ai.operations.risk(name, input, ctx)
aeditor.ai.operations.preview(name, input, ctx)
aeditor.ai.operations.apply(preview, ctx)
aeditor.ai.operations.getPreview(id)
```

Dotted names are the public grouping mechanism. Owner metadata is the exact
lifecycle key for installed extension contributions.

Registry registration is conservative: registering an existing name throws.
Callers must pass `meta.replace === true` to intentionally replace an entry.
That keeps host code from silently shadowing built-in tools, context providers,
reference providers, operations, skills, templates, or bundles.

Modules do not get separate AI channels. A module exposes model-facing behavior
by contributing named registry entries:

```text
workspace module -> workspace.* tools
theme module     -> theme.* tools / context
dock module      -> dock.* tools / operations
ui module        -> ui.* tools / context / operations
domain code      -> domain-prefix.* tools / context / operations
```

## Tool Registry

There is one tool facade:

```js
aeditor.ai.tools.register(name, spec, meta)
aeditor.ai.tools.unregister(name, meta)
aeditor.ai.tools.unregisterOwner(owner)
aeditor.ai.tools.unregisterPrefix(prefix)
aeditor.ai.tools.get(name)
aeditor.ai.tools.visible(name, requestContext, explicit)
aeditor.ai.tools.visibleList(names, requestContext, explicit)
aeditor.ai.tools.list(prefix)
aeditor.ai.tools.meta(name)
```

Do not create a second tool registry. New framework code should use
`aeditor.ai.tools.*`.

`meta.owner` and `meta.layer` may exist for diagnostics and safety checks.
`meta.replace === true` is the only overwrite path.
Extension lifecycle cleanup uses `unregisterOwner(owner)` so nested extension
ids such as `sample` and `sample.child` can coexist safely. Prefix cleanup
remains a low-level helper for plain dotted registries.

Built-in tool prefixes:

```text
workspace.*
code.*
git.*
verify.*
aeditor.*
agent.*
quest.*
message.*
```

`git.*` and `verify.*` are optional host-adapter prefixes. They should only be
registered when their adapter is configured, so the model never sees unavailable
tools.

Tool specs may also expose two model-visibility fields:

```js
{
  available: function (requestContext) { return true },
  exposeToModel: false,
}
```

`available` is for runtime state such as "a workspace is currently open".
`exposeToModel: false` is for low-level host escape hatches that remain callable
by framework code but should not appear in normal model requests. Direct
registry access is unchanged; the visibility rule only decides what the request
builder sends to the provider.

## Context, Reference, Target

Definitions:

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
```

These are useful implementation pieces, not new architecture categories.

## References And Context

There are two related pieces:

1. `aeditor.ai.attachments` is a signal containing attached chat/session items.
2. `aeditor.ai.references` is a provider registry for readable editor
   references.

The public runtime attachment name is `attachments`; do not reintroduce
`resources` for chat attachments.

Public split:

```text
aeditor.ai.attachments      // runtime attached items in chat/session
aeditor.ai.context          // registry of readable model-context providers
aeditor.ai.references       // normalized reference protocol
```

Reference APIs:

```js
aeditor.ai.references.register(name, provider, meta)
aeditor.ai.references.unregister(name, meta)
aeditor.ai.references.unregisterOwner(owner)
aeditor.ai.references.unregisterPrefix(prefix)
aeditor.ai.references.get(name)
aeditor.ai.references.list(filter)
aeditor.ai.references.meta(name)
aeditor.ai.references.normalize(ref)
aeditor.ai.references.normalizeAll(refs)
aeditor.ai.references.describe(ref)
aeditor.ai.references.read(ref, options, ctx)
aeditor.ai.references.schema(ref, ctx)
aeditor.ai.references.capabilities(ref, ctx)
aeditor.ai.references.snapshot(ref, ctx)
aeditor.ai.references.search(query, ctx)
aeditor.ai.references.selection(ctx)
```

Reference providers receive the current request/tool context, including actor
and permission helpers. Providers should use that context when they expose
non-public editor or workspace state.

The reference protocol is valuable and should not be lost. It should remain a
small pointer/helper protocol under the context flow, not a competing registry
concept.

Reference providers, target providers, and rich prompt refs all support one
user-facing idea:

```text
the user points at something -> the model can read the right context
```

Keep that idea unified: UI selection and rich prompt helpers should always
produce normalized references that can be read through the reference protocol.

## Operations

Public operation API:

```js
aeditor.ai.operations.register(name, spec, meta)
aeditor.ai.operations.unregister(name, meta)
aeditor.ai.operations.unregisterOwner(owner)
aeditor.ai.operations.unregisterPrefix(prefix)
aeditor.ai.operations.get(name)
aeditor.ai.operations.list(prefixOrFilter)
aeditor.ai.operations.meta(name)
aeditor.ai.operations.risk(name, input, ctx)
aeditor.ai.operations.preview(name, input, ctx)
aeditor.ai.operations.apply(preview, ctx)
aeditor.ai.operations.getPreview(id)
```

Operations support validation, risk, preview storage, apply, and transaction
integration.

Preview stores a reviewable operation preview. Apply consumes that preview and
returns the operation result.

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
part of the AI layer implementation. Architecturally it belongs to the Context
Reference UX flow, not to the public five-concept model in [ai.md](./ai.md).

## Rich Prompt

`aeditor.ai.richPrompt` stores inline references inside text.

Inline reference tokens store `refId`; `resourceId` is not part of the final
schema.

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

`aeditor.changeSet` provides grouped reviewable changes.

Implemented APIs:

```js
aeditor.changeSet.items
aeditor.changeSet.create(input)
aeditor.changeSet.update(id, patch)
aeditor.changeSet.find(id)
aeditor.changeSet.list()
aeditor.changeSet.normalize(input)
aeditor.changeSet.isChangeSet(value)
aeditor.changeSet.apply(idOrSet, scope, actor)
aeditor.changeSet.reject(idOrSet, scope, actor)
aeditor.changeSet.registerAdapter(name, adapter)
aeditor.changeSet.getAdapter(name)
aeditor.changeSet.registerRenderer(name, renderer)
aeditor.changeSet.getRenderer(name)
aeditor.changeSet.rendererFor(change, resource, set)
```

Design relationship:

- Operation: one previewable action.
- ChangeSet: review UI and grouped application for many changes/targets.

ChangeSet should remain because it solves grouped review and partial apply.
When `aeditor.ai.canUseChangeSet` is available, applying a ChangeSet goes
through the unified permission resolver before the adapter runs. The permission
target is `source.agentId`, `meta.agentId`, or the actor when no owner agent is
recorded.
