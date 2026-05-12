# AI Architecture

## Purpose

The optional AI Host lets agents talk to the user, read precise context, and ask
the host to run controlled actions. It is not part of the Core/UI kernel, and it
does not own product data models.

Any AEditor module can contribute to AI by registering tools, context
references, or operations. `workspace.*`, `theme.*`, `dock.*`, `ui.*`, extension
prefixes, and product prefixes all use the same registries.

Skills are agent behavior profiles. They add prompt guidance and rules to an
agent; they are not tools, context references, or operations.

## Public Concept Model

Expose only five concepts at the architecture level:

```text
Agent             conversation, memory, runtime state
Tool              model-callable action
Context Reference stable pointer to bounded readable context
Operation         previewable/applyable mutation
ChangeSet         grouped review/apply container
```

Targets, attachments, rich prompt ranges, quests, inboxes, bundles, and
templates are runtime or UX details. They may have APIs, but they should not
become new architectural layers.

## Context Flow

AI uses one context flow:

```text
user points at thing -> Context Reference -> bounded Context
```

A reference is stable enough to put in chat or prompt data. Context providers
resolve references into bounded readable content for the model. Large data must
expose search, summaries, ranges, schemas, or projections instead of injecting
everything into the prompt.

## Tools

A tool is an action the model can call.

Examples:

```text
workspace.searchFiles
workspace.readFile
workspace.patchFile
theme.setMode
ui.setProp
gde.table.patchRows
```

Target API:

```js
aeditor.ai.tools.register(name, spec)
aeditor.ai.tools.unregister(name)
aeditor.ai.tools.unregisterPrefix(prefix)
aeditor.ai.tools.get(name)
aeditor.ai.tools.list(prefix)
```

Tool names use dotted paths. Prefixes are enough for grouping and removal.

The request builder sends only model-visible and currently available tools to
the provider:

```js
aeditor.ai.tools.register('workspace.readFile', {
  available: function () { return !!aeditor.ai.currentWorkspace() },
  run: readFile,
})
```

Low-level host escape hatches can stay registered for framework code while being
kept out of normal model requests with `exposeToModel: false`.

## Context References

Context references are stable pointers plus provider-backed readers.

Examples:

```text
selection.current
ui.componentCatalog
ui.panelState
workspace.fileSummary
gde.tableSchema
```

Target API:

```js
aeditor.ai.context.register(name, spec)
aeditor.ai.context.unregister(name)
aeditor.ai.context.unregisterPrefix(prefix)
aeditor.ai.context.get(name)
aeditor.ai.context.list(prefix)
```

The API name is `context`; the public concept is "Context Reference" because
what the model sees should be bounded content, not an unbounded resource dump.

## Operations

An operation is a previewable change.

Examples:

```text
ui.setProp
dock.closePanel
theme.updateToken
gde.table.updateRows
ani.timeline.moveKeys
```

Target API:

```js
aeditor.ai.operations.register(name, spec)
aeditor.ai.operations.unregister(name)
aeditor.ai.operations.unregisterPrefix(prefix)
aeditor.ai.operations.get(name)
aeditor.ai.operations.list(prefix)
aeditor.ai.operations.preview(name, input)
aeditor.ai.operations.apply(preview)
```

Operations are for changes that need validation, preview, review UI, undo
integration, or resource-version checks.

`aeditor.previewOperation` and `aeditor.applyOperation` are low-level bridge
tools for internal code and explicitly scoped agents. They should be hidden from
normal model requests unless a host has a specific reason to expose them.

## ChangeSet

`ChangeSet` is review infrastructure, not a fourth registry.

```text
Operation  one previewable action
ChangeSet  grouped review/apply container for many changes
```

Use operations for the model-facing preview/apply contract. Use ChangeSet when
the UI needs to review, apply, reject, audit, or persist several changes
together.

## Permissions

Permissions apply at every model-controlled boundary:

```text
tool run
operation preview/apply
ChangeSet apply
workspace mutation
extension install/update
host-adapter call
```

All decisions go through the unified resolver described in
[ai-permission-policy.md](./ai-permission-policy.md). Full access means the
resolver has already allowed that action for that actor, target, phase, and
scope; failed actions must never show apply controls.

## Streaming

Provider streaming and UI rendering are separate.

The provider adapter emits events as soon as bytes or parsed deltas arrive. The
message panel renders a lightweight live preview and updates the full transcript
at a controlled cadence.

The user should always be able to distinguish:

```text
waiting for provider
receiving text
receiving reasoning
receiving tool call arguments
running tool
waiting for user approval
done
failed
```
