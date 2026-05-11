# Current Gaps

This file records where the current code differs from the final architecture.
It exists so refactors do not accidentally remove useful implemented behavior.

## 1. Registry API Shape

Final design:

```js
aeditor.ai.tools.register(name, spec)
aeditor.ai.context.register(name, spec)
aeditor.ai.operations.register(name, spec)
```

Current code:

```js
aeditor.ai.registerTool(name, spec, meta)
```

Keep the existing tool lifecycle semantics, preview/apply behavior, permission
checks, and UI state. Add final namespace facades or migrate callers in one
deliberate step.

## 2. Context Naming Migration

Final design wants `aeditor.ai.context` to mean the registry of readable model
context.

Current code uses:

```text
aeditor.ai.resources       // attached item signal
aeditor.ai.references      // readable reference provider registry
aeditor.ai.registerResourceResolver
```

Do not delete `references`; it is the useful implemented pointer protocol.
Rename or wrap deliberately so final `context` becomes the readable context
registry, while `references` remains the URI/kind/meta pointer shape.

## 3. Demo Project Runtime

Final design says AEditor framework has no built-in project model.

The file-backed project runtime has been moved out of `src/`:

```js
Demo.project
demo.project.*
```

This creates, edits, loads, and checks editor projects. It must not be treated
as AEditor framework API.

## 4. Metadata Lifecycle

Final design uses dotted name prefixes for grouping and uninstall.

Current code uses metadata such as owner/layer in components, commands,
settings, references, operations, and extensions.

Target state:

```text
prefix   identity + grouping + uninstall boundary
metadata diagnostics + hints + compatibility only
```

Do not remove lifecycle cleanup blindly. First add prefix-based unregister APIs
where missing, then migrate extension uninstall to those APIs.

## 5. Extension Runtime

Final design says extensions package existing registries.

Current code additionally supports:

- layer filtering
- safe mode
- storage
- install review
- permission policy
- same-page factory panels
- iframe panels
- adapter indirection
- recovery component

These are valuable if kept simple. Reconcile them with the final model instead
of deleting them during cleanup.

## 6. ChangeSet

Final design mentions operations, but current code also has `aeditor.changeSet`.

Keep it. It handles grouped review, target-scoped apply/reject, adapters, and
renderers. Document it as review UI infrastructure above operations.

## 7. AI Runtime Complexity

Current runtime already handles queues, quests, inbox continuations, waiting for
approval, resume after tools, live run state, and persistence.

These behaviors protect against the exact failures seen during testing:

- model stops after tool calls
- approval breaks message order
- child agent completion interrupts current work
- UI cannot tell if provider is streaming or blocked

Refactors must preserve those state transitions.

## 8. AI Host Helper Names

Current code has useful AI host helpers:

```js
aeditor.ai.registerContextProvider
aeditor.ai.registerResourceResolver
aeditor.ai.registerAgentTemplate
aeditor.ai.registerPlugin
```

Keep useful behavior, but avoid turning these into more architecture layers.
Context providers and resource resolvers should align with the final context
flow. Agent templates are creation presets. `registerPlugin` should either
become Extension contributions or remain an internal registration helper; it
should not compete with `aeditor.extensions`.

## 9. Semantic Context Compaction

Final design uses auditable compaction records for long agent sessions.

Current code has useful emergency budgeting:

```text
src/ai/request.js  estimates context and keeps recent messages
src/ai/request.js  truncates large payloads
src/ai/store.js    truncates oversized persistence snapshots
```

This is not the final compaction model. Request clipping prevents provider
failure, but it does not preserve old decisions, changed refs, failed checks, or
open questions in a structured way.

Target state:

```text
raw transcript remains source of truth
closed old ranges become compaction records
request builder injects memory + compactions + recent raw tail
tool-call sequences and pending approvals are never split
```

See [ai-context-compaction.md](./ai-context-compaction.md).
