# AI Architecture

## Purpose

The AI layer lets agents talk to the user, read precise context, and ask the host
to run controlled actions.

The AI layer owns:

```text
agents
skills
messages
providers
streaming
permissions
tools
context
operations
targets
```

It does not own product data models.

Any AEditor module can contribute to AI by registering tools, context, or
operations. `workspace.*`, `theme.*`, `dock.*`, `ui.*`, and product prefixes all use
the same registries.

Skills are agent behavior profiles. They add prompt guidance and rules to an
agent; they are not tools, context, or operations.

## Minimal Mental Model

AI uses one action space and one context flow:

```text
Action space: tools / context / operations
Context flow: target -> reference -> context
```

`target` is what the user points at. `reference` is the stable pointer placed in
chat or prompt data. `context` is the bounded readable content the model can use.
Attachments and rich prompt refs are runtime/UI storage for this same flow, not
additional registries.

## Tools

A tool is an action the model can call.

Examples:

```text
workspace.searchFiles
workspace.readFile
workspace.patchFile
ui.createPanel
dock.addPanel
theme.setMode
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

## Context

Context is bounded readable information for the model.

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

Context should be bounded. Large data should expose search, range reads, or
schema summaries instead of injecting everything into the prompt.

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

Operations are for changes that need validation, preview, review UI, or undo
integration.

## ChangeSet

`ChangeSet` is review infrastructure, not a fourth AI registry.

```text
Operation  one previewable action
ChangeSet  grouped review/apply container for many changes
```

Use operations for the model-facing preview/apply contract. Use ChangeSet when
the UI needs to review, apply, or reject several changes together.

## Targets

A target is something the user can attach to chat:

```text
selected component
selected rows
current panel
current file
image
asset
```

Targets become references in the prompt. The AI host resolves those references
through context providers and tools when building the model request.

## Permissions

Permissions apply at the AI tool and operation boundary.

Recommended states:

```text
read only
ask before write
full access inside granted workspace
custom policy
```

Full access means the host should not show approval UI for actions already
allowed by policy. Failed actions should never show apply controls.

## Streaming

Provider streaming and UI rendering are separate.

The provider adapter emits events as soon as bytes or parsed deltas arrive. The
message panel renders a lightweight live preview and updates the full transcript
at a controlled cadence.

The user should always be able to distinguish:

```text
waiting for provider
receiving text
receiving tool call arguments
running tool
waiting for user approval
done
failed
```

## Commands Versus Tools

Commands are for humans and UI surfaces:

```text
menus
buttons
command palette
shortcuts
context menus
```

Tools are for models:

```text
schema
permission policy
approval state
tool-call transcript
model-visible result
```

The same underlying action can be exposed as both a command and a tool, but the
registries are intentionally separate because the caller, permissions, and
result handling are different.
