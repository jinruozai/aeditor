# AI Runtime

The AI runtime manages agents, skills, chat messages, queues, quests, tool
execution, streaming state, and persistence.

## Agents

Agents are runtime records. Implemented abilities include:

```js
aeditor.ai.createAgent(spec)
aeditor.ai.updateAgent(id, patch)
aeditor.ai.renameAgent(id, name)
aeditor.ai.moveAgent(id, order)
aeditor.ai.reparentAgent(id, parentAgentId)
aeditor.ai.deleteAgent(id)
aeditor.ai.selectAgent(id)
aeditor.ai.findAgent(id)
aeditor.ai.getActiveAgent()
```

Agents may have:

```text
id
name
parentAgentId
status
statusText
connection
model
stream
permissionMode
messages
queue
quests
inbox
toolRefs
skillRefs
contextRefs
```

Parent/child is an agent relationship, not a new runtime layer.

## Skills

A skill is an agent behavior profile. It can provide prompt guidance and rules
for an agent.

Implemented APIs:

```js
aeditor.ai.skills.register(name, skill)
aeditor.ai.skills.unregister(name)
aeditor.ai.skills.unregisterPrefix(prefix)
aeditor.ai.skills.get(name)
aeditor.ai.skills.list(prefix)
```

Agents enable skills by listing skill ids in `agent.skillRefs`. During request
construction, enabled skills contribute their `systemPrompt` and `rules` into
the runtime guide.

The framework ships one built-in authoring skill:

```text
aeditor.authoring
```

It teaches the model the AEditor component contract: plain `.js` files,
registered components, `factory(propsSig, ctx) -> HTMLElement`, `aeditor.ui.*`
controls, dock-responsive layout, and no React/TSX/import/export unless the
workspace explicitly provides such a build system. The request builder enables
this skill automatically for UI/panel/dock authoring requests and for
workspace-backed editing sessions.

The copyable documentation form for external agents is
[skill/aeditor-authoring/SKILL.md](./skill/aeditor-authoring/SKILL.md).

Skills are not a fourth AI action registry:

```text
tools      execute actions
context    provide readable model context
operations preview/apply changes
skills     shape agent behavior
```

Extensions and domain code may register skills, but skills should stay small. A skill
may reference recommended tools or context entries, and a package that installs a
skill may also register tools. The tools still live in the shared tool registry;
a skill must not hide a private tool system inside itself.

Recommended skill shape:

```text
systemPrompt
rules
toolRefs
contextRefs
permissionHints
```

The runtime merges these into request construction. Tool execution still goes
through the shared tool registry and permission system.

## Messages

Implemented message abilities:

```js
aeditor.ai.appendMessage(agentId, message)
aeditor.ai.insertMessageAfter(agentId, afterId, message)
aeditor.ai.readMessage(agentId, messageId)
aeditor.ai.updateMessage(agentId, messageId, patch)
aeditor.ai.agent.messages(agentId, options, actor)
```

Messages may contain text, rich prompt content, context refs, attachments, tool
calls, quest links, and runtime status.

## Queue

User and system work is queued before execution.

Implemented abilities:

```js
aeditor.ai.enqueueMessage(agentId, messageId, options)
aeditor.ai.dequeueMessage(agentId, messageId)
aeditor.ai.scheduleAgent(agentId)
aeditor.ai.message.send(agentId, spec)
```

The queue lets an agent finish current work cleanly while newer messages wait,
unless a message is marked as an interrupt.

## Run Scheduler

The runtime owns one clear run loop per agent. It schedules work, streams model
output, executes tools, waits for approval, resumes after tool results, and
records completion or failure.

Implemented abilities:

```js
aeditor.ai.scheduleAgent(agentId)
aeditor.ai.stopAgent(agentId, actor)
aeditor.ai.resumeAgent(agentId, actor)
aeditor.ai.flushToolResults(agentId)
aeditor.ai.configureRuntime(options)
aeditor.ai.createRunContext(request, controller)
```

The important invariant is message order:

```text
assistant message with tool calls
  -> matching tool result messages
  -> next model request
```

Approval UI must not leave orphan tool calls in the provider message history.
If a run is waiting for user approval, the runtime state should say so and the
next continuation should be scheduled only after the approval/reject result has
been appended.

The default tool continuation guard is `maxToolTurns: 32`. It is a safety stop
for loops, not a normal completion path. Agents are instructed to exit earlier
with one of four clear states:

```text
done        the requested work is complete
waiting     user approval or confirmation is required
blocked     required workspace/files/schema/API/permission is missing
failed      the same operation shape has failed and retrying would be guessing
```

When the guard does trip, the runtime appends an explicit safety-stop assistant
message instead of silently idling.

## Quests

A quest is delegated work tracked across agents.

Implemented abilities:

```js
aeditor.ai.createQuest(agentId, spec)
aeditor.ai.findQuest(agentId, questId)
aeditor.ai.updateQuest(agentId, questId, patch)
aeditor.ai.agent.send(toAgentId, spec)
```

Built-in orchestration tools include:

```text
agent.read
agent.create
agent.delegate
agent.reparent
agent.delete
agent.send
agent.stop
quest.read
quest.result
message.read
```

These tools are part of the AI runtime, not product domain tools.

## Inbox

Agents receive completion events through inbox events. This prevents child-agent
completion from interrupting an unrelated current run.

Implemented abilities:

```js
aeditor.ai.appendInboxEvent(agentId, event)
aeditor.ai.markInboxEventConsumed(agentId, eventId)
```

The runtime can enqueue a continuation when actionable inbox events exist.

## Active Run State

The runtime exposes lightweight live state for UI:

```js
aeditor.ai.activeRunState(agentId)
aeditor.ai.peekActiveRunState(agentId)
aeditor.ai.setActiveRunState(agentId, patch)
```

This state tracks:

```text
state
runId
traceId
previewTail
modelTail
activityText
startedAt
firstTokenAt
completedAt
usage
outputTokens
totalTokens
cost
error
```

The message UI should render this state cheaply so long conversations do not
force full transcript re-rendering.

## Context Budget And Compaction

The runtime prompt is a budgeted view over the agent transcript, not the
transcript itself.

Current implementation already estimates context size and keeps the newest
messages inside the model budget. The final design is semantic compaction:
closed older transcript ranges become auditable compaction records, while the
raw transcript remains the source of truth.

Implemented APIs:

```js
aeditor.ai.compaction.configure(options)
aeditor.ai.compaction.plan(agentId, input)
aeditor.ai.compaction.run(agentId, plan)
aeditor.ai.compaction.records(agentId)
aeditor.ai.compaction.clear(agentId, options)
```

Implemented command wrappers:

```text
ai.compactCurrentAgent
ai.clearCurrentAgentCompactions
ai.listCurrentAgentCompactions
```

See [ai-context-compaction.md](./ai-context-compaction.md).

## Message UI Performance

The AI panels are normal registered UI components, but their rendering rules are
stricter than ordinary panels because transcripts can become very large.

Implemented panel-side pieces:

```text
ai-messages
ai-chatinput
ai-chat
message-live-strip
message-virtualizer
```

Rules:

1. The transcript renders only the visible window plus small overscan.
2. The live strip reads `activeRunState` and updates independently from the full
   transcript.
3. Streaming text, reasoning text, tool deltas, activity text, usage, and errors
   should update live state first.
4. Expanding a tool card is local UI state and should not be reset by unrelated
   stream chunks.
5. Long conversations should remain cheap because the number of mounted message
   rows is bounded by viewport size, not message count.

The live strip is diagnostic UI. It should show the latest model/provider bytes
as soon as the runtime receives them, then collapse back to idle when the run is
done.

## Trace And Audit

Every run creates a `runId`. Provider requests, stream chunks, tool calls,
operation previews/applies, workspace mutations, extension installs, and
permission decisions also carry the same `runId` plus a `traceId` or span id.

The runtime should be able to answer:

```text
which user message started this run
which provider request produced this chunk
which tool call mutated this resource
which permission decision allowed or denied it
which resource version was inspected and committed
```

This trace is diagnostic infrastructure, not a new model-facing concept. It
connects `aeditor.log`, tool cards, ChangeSet review, provider usage, and the
permission audit log.

## Tool Call Lifecycle

Tool calls have a lifecycle:

```text
proposed
previewed
approved
running
completed
applying
applied
rejected
failed
```

Implemented APIs include:

```js
aeditor.ai.createToolCall(agentId, spec, actor)
aeditor.ai.attachToolCalls(agentId, messageId, calls, actor)
aeditor.ai.previewToolCall(agentId, callId, actor)
aeditor.ai.approveToolCall(agentId, callId, actor)
aeditor.ai.rejectToolCall(agentId, callId, reason, actor)
aeditor.ai.runToolCall(agentId, callId, actor)
aeditor.ai.applyToolCall(agentId, callId, actor)
aeditor.ai.getToolCallActionState(agentId, callId, actor)
aeditor.ai.setToolAlwaysAllowed(agentId, toolId, allowed)
```

Failed calls should display failure and must not show apply controls.

Tool execution, operation apply, ChangeSet apply, extension install, workspace
mutation, and host-adapter calls all go through the resolver in
[ai-permission-policy.md](./ai-permission-policy.md). "Always allowed" is a
scoped cached decision, not a global bypass.

## Request Context Hooks

The runtime can assemble request context from small registered contributors.
These hooks are implementation helpers for prompt construction; they are not a
new model-facing registry beyond tools/context/operations.

Implemented APIs:

```js
aeditor.ai.context.register(name, provider)
aeditor.ai.context.get(name)
aeditor.ai.context.list()
```

Context providers may add compact state such as active selection, workspace
metadata, available UI affordances, or domain-specific guide text. Prefer
registered context entries for information the model should be able to request by
URI, search, or read on demand.

Reference providers turn normalized references into readable content:

```js
aeditor.ai.references.register(name, provider)
aeditor.ai.references.read(ref, options, ctx)
```

Use reference providers for URI/kind/meta pointers. Use `aeditor.ai.context`
for compact run-level context that should be included with a model request.

## Agent Templates And Bundles

The runtime also exposes small host-level registries:

```js
aeditor.ai.agentTemplates.register(name, template)
aeditor.ai.agentTemplates.unregister(name)
aeditor.ai.agentTemplates.unregisterPrefix(prefix)
aeditor.ai.agentTemplates.get(name)
aeditor.ai.agentTemplates.list(prefix)

aeditor.ai.bundles.register(name, bundle)
aeditor.ai.bundles.unregister(name)
aeditor.ai.bundles.unregisterPrefix(prefix)
aeditor.ai.bundles.get(name)
aeditor.ai.bundles.list(prefix)
```

Agent templates are presets for creating agents. They are not a separate agent
type.

`aeditor.ai.bundles` is only a convenience registry for registering AI runtime
entries together, such as connections, skills, tools, context providers, and
agent templates. It is not an Extension replacement; framework-wide packaging
belongs to `aeditor.extensions`.

## Persistence

Implemented persistence APIs:

```js
aeditor.ai.snapshot()
aeditor.ai.save()
aeditor.ai.restore()
aeditor.ai.configurePersistence(options)
aeditor.ai.clearStoredState()
```

Persistence belongs to the AI runtime. Domain persistence remains outside
AEditor Core.
