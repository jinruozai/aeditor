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
aeditor.ai.registerSkill(name, skill)
aeditor.ai.getSkill(name)
aeditor.ai.listSkills()
```

Agents enable skills by listing skill ids in `agent.skillRefs`. During request
construction, enabled skills contribute their `systemPrompt` and `rules` into
the runtime guide.

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

## Request Context Hooks

The runtime can assemble request context from small registered contributors.
These hooks are implementation helpers for prompt construction; they are not a
new model-facing registry beyond tools/context/operations.

Implemented APIs:

```js
aeditor.ai.registerContextProvider(name, provider)
aeditor.ai.getContextProvider(name)
aeditor.ai.listContextProviders()
```

Context providers may add compact state such as active selection, workspace
metadata, available UI affordances, or domain-specific guide text. Prefer
registered context entries for information the model should be able to request by
URI, search, or read on demand.

Resource resolvers are the current low-level hook that turns a normalized
reference into readable content:

```js
aeditor.ai.registerResourceResolver(name, resolver)
aeditor.ai.getResourceResolver(name)
aeditor.ai.listResourceResolvers()
```

Final architecture should keep the behavior but align naming with the context
registry described in [ai-registries.md](./ai-registries.md).

## Agent Templates And Registration Helpers

The runtime also has small host-level registration helpers:

```js
aeditor.ai.registerAgentTemplate(name, template)
aeditor.ai.getAgentTemplate(name)
aeditor.ai.listAgentTemplates()

aeditor.ai.registerPlugin(name, plugin)
aeditor.ai.getPlugin(name)
aeditor.ai.listPlugins()
```

Agent templates are presets for creating agents. They are not a separate agent
type.

`registerPlugin` is a current bundling shortcut for registering AI host entries
such as connections, skills, tools, context providers, resource resolvers, and
agent templates. It should not grow into a second extension model. Framework-wide
packaging belongs to `aeditor.extensions`; this helper should remain a small
runtime registration shortcut or be folded into Extension contributions.

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
