# AI Agent Quest Runtime

This document is the implementation target for the AIditor AI agent runtime.

The design intentionally removes the old `chat` / `goal` split. Every agent uses one runtime model: messages enter a queue, the scheduler runs the agent, tools are the only side-effect boundary, and cross-agent work is tracked by quests.

## 1. Design Goals

- Keep all agents as peer runtime entities. Parent/child is a `parentAgentId` permission, ownership, and UI relationship only.
- Make every visible chat card a real `Message` with a stable `messageId`.
- Use the child request `messageId` as the cross-agent `questId`.
- Let many agents run concurrently. A parent agent must not block just because child agents are still running.
- Let users send more messages while an agent is running. New messages are queued unless explicitly marked as interrupting.
- Never infer completion from natural language. Completion must come from runtime state.
- Keep model context clean. Parent agents receive completion event batches and references, not full child transcripts by default.
- Preserve a small API surface that is easy for project plugins to use.

## 2. Current Architecture Fit

The current framework already has most foundations:

- `aiditor.ai.agents` stores agent state.
- `aiditor.ai.appendMessage` stores messages.
- `aiditor.ai.runAgent` executes one agent turn.
- `aiditor.ai.agent.send` exists as a tool-level operation.
- Agent identity is id-only. Names are display labels and may repeat.
- Message panel already renders messages and tool calls.

The required change is not a rewrite of providers or tools. It is a runtime model cleanup:

- Replace `mode: chat | goal` as user-facing behavior with one queue-driven runtime.
- Introduce first-class `Quest` records.
- Associate every message with `agentId`.
- Treat every cross-agent `agent.send` as a queued message on the target agent.
- Add scheduler behavior for queued messages, quest completion events, and inbox continuations.

## 3. Data Model

### 3.1 Agent

```js
{
  id: 'a_main',
  name: 'main',
  parentAgentId: null,
  order: 0,

  connection: 'openai-codex',
  model: 'gpt-5.5',

  status: 'idle',
  statusText: '',
  activeMessageId: null,
  activeQuestId: null,

  messages: [],
  queue: [],
  inbox: [],
  quests: [],

  systemPrompt: '',
  contextRefs: [],
  skillRefs: [],
  toolRefs: [],
  permissions: {},
  meta: {}
}
```

Notes:

- `mode` should be removed from final runtime semantics.
- `path`, `groupId`, and `groups` do not exist in the final model.
- `statusText` is user-facing compact detail, for example `waiting for approval: gde.patch`.
- `queue`, `inbox`, and `quests` are owned by the target agent for simple persistence and UI projection.
- If implementation later needs indexes for performance, those indexes must be derived caches, not the source of truth.

### 3.2 Message

```js
{
  id: 'm_123',
  agentId: 'a_child',
  from: 'agent:a_main',
  role: 'user',
  content: 'Write a short poem.',

  status: 'queued',
  toolCalls: [],
  contextRefs: [],
  attachments: [],

  questId: 'm_123',
  resultForQuestId: null,

  createdAt: 1777880000000,
  startedAt: null,
  completedAt: null,
  meta: {}
}
```

Rules:

- A user message card is a `Message`.
- An assistant message card is a `Message`.
- Tool result messages may exist internally, but UI can hide them by default.
- A cross-agent request message has `questId === message.id`.
- A final response to a quest has `resultForQuestId === requestMessageId`.

### 3.3 Quest

```js
{
  id: 'm_123',
  fromAgentId: 'a_main',
  toAgentId: 'a_child',
  requestMessageId: 'm_123',

  status: 'running',
  resultMessageId: null,
  summary: '',

  createdAt: 1777880000000,
  startedAt: 1777880000100,
  completedAt: null,
  meta: {}
}
```

Rules:

- `Quest.id === Quest.requestMessageId`.
- A quest never stores duplicate content.
- The parent agent usually reads the result through `quest.result(toAgentId, questId)`. `message.read` remains the precise low-level read path when needed.
- If the child agent starts another task after completing this quest, the old quest result remains stable.

### 3.4 Queue Item

The queue can store message ids instead of duplicating message content:

```js
{
  messageId: 'm_123',
  priority: 0,
  interrupt: false,
  createdAt: 1777880000000
}
```

Default behavior:

- If target agent is idle, scheduler starts the queued message immediately.
- If target agent is running, the item stays queued.
- If `interrupt: true`, scheduler stops the current execution and places this item at the front.

### 3.5 Inbox Event

```js
{
  id: 'evt_1',
  type: 'quest.completed',
  fromAgentId: 'a_child',
  questId: 'm_123',
  resultMessageId: 'm_456',
  summary: 'Completed a four-line poem.',
  consumed: false,
  createdAt: 1777880000000
}
```

Inbox events are notifications, not large context payloads. They do not interrupt a running requester. They point to stable ids and are processed when the requester reaches a scheduler checkpoint.

Completion events are batched by checkpoint:

- If the requester is running when a child quest completes, the event stays unread in `inbox`.
- When the requester reaches a scheduler checkpoint, the runtime may enqueue one continuation containing every unread completion event that is already available at that moment.
- The continuation can read and summarize all completed events in that batch.
- Still-running sibling quests are background status only. They must not block the current continuation.
- Later child completions create later events and later continuations.
- The runtime must not wait for "all delegated quests" unless the user or the agent explicitly asked to wait for all.

## 4. Status Model

### 4.1 Agent Status

```text
idle              no current work
queued            has queued messages but not running yet
running           processing activeMessageId
waiting_approval  tool call needs user apply/reject
failed            current message failed
stopped           current message was stopped
```

### 4.2 Message Status

```text
queued
running
done
failed
stopped
```

### 4.3 Quest Status

```text
queued
running
waiting_approval
completed
failed
stopped
```

Completion rules:

- A normal single-turn task completes when the assistant message finishes and has no pending tool approval.
- A tool-backed task completes only after tool state reaches `completed` or `applied`.
- A quest completes when the target agent creates a final assistant message for that request.
- Natural language such as "I am done" is not a completion signal by itself.

## 5. Public API

Use names that match existing aiditor style while keeping the final model clean.

### 5.1 Send a Local Message

```js
aiditor.ai.message.send(agentId, {
  content,
  from: 'user',
  attachments: [],
  contextRefs: [],
  interrupt: false
})
```

Returns:

```js
{
  agentId,
  messageId,
  status
}
```

This is used by the UI send box.

### 5.2 Send a Cross-Agent Quest

```js
aiditor.ai.agent.send(toAgentId, {
  fromAgentId,
  content,
  attachments: [],
  contextRefs: [],
  interrupt: false
})
```

Returns:

```js
{
  agentId: toAgentId,
  questId: requestMessageId,
  messageId: requestMessageId,
  status: 'queued' | 'running'
}
```

This is the only default way for one agent to assign work to another.

### 5.3 Read Quest

```js
aiditor.ai.quest.read(agentId, questId, actor)
```

Returns:

```js
{
  agentId,
  questId,
  status,
  resultId,
  summary,
  createdAt,
  completedAt
}
```

`agentId` is the target agent that owns the quest.

### 5.4 Read Message

```js
aiditor.ai.message.read(agentId, messageId, actor)
```

Returns the exact message. This is the precise result-read path after a quest completes.

### 5.5 Read Agent Summary

```js
aiditor.ai.agent.read(agentId, actor)
```

Returns a summary only:

```js
{
  id,
  name,
  parentAgentId,
  status,
  statusText,
  activeMessageId,
  activeQuestId,
  queuedCount,
  unreadInboxCount,
  recentQuests
}
```

It must not return the full transcript by default.

### 5.6 Debug Transcript

For UI/debug only:

```js
aiditor.ai.agent.messages(agentId, {
  limit,
  after,
  includeToolMessages: false
})
```

This is not the default agent-to-agent collaboration API.

## 6. Scheduler

The scheduler is mechanical. It does not plan, reason, or decide task quality.

### 6.1 Start Rule

```text
When a queue item is added:
  if agent.status is idle/queued/stopped/failed:
    start next queue item
  else:
    leave it queued
```

### 6.2 Turn Completion Rule

```text
When an agent finishes processing a message:
  write assistant message
  update request message status
  update quest status if this message belongs to a quest
  emit quest.completed or quest.failed to requester inbox
  if the same agent has more queued messages:
    start next queue item
  else if it has actionable inbox events:
    enqueue a continuation message
  else:
    set agent.status = idle
```

Inbox continuation batching:

```text
At a scheduler checkpoint for an agent:
  collect unread completed/failed inbox events available now
  enqueue one system continuation for that completed batch
  include pending related quests only as non-blocking background
  do not wait for pending quests
```

Completion event delivery is not an interrupt. If the requester is currently running, the event remains in `inbox` until the next scheduler checkpoint.

### 6.3 Tool Approval Rule

```text
When a tool call needs user approval:
  set message.status = running
  set agent.status = waiting_approval
  set agent.statusText = waiting for approval: tool.name
```

After user applies/rejects:

```text
if applied:
  continue the same message execution
if rejected:
  append rejection result and let model continue or fail
```

### 6.4 Interrupt Rule

```text
If interrupt message arrives:
  stop current provider/tool execution
  set current message status = stopped
  put interrupt message at queue front
  start it
```

### 6.5 Concurrency Rule

The scheduler may run multiple agents at once. It should support a configurable global concurrency limit and optional per-agent limit:

```js
{
  maxConcurrentAgents: 8,
  maxConcurrentMessagesPerAgent: 1
}
```

Default per-agent concurrency is 1 to keep each agent transcript ordered.

## 7. Agent-to-Agent Workflow

Example: main asks child to write a poem.

```text
main tool call:
  agent.send(child, "Write a poem")

runtime:
  create child request message m_123
  create quest id m_123
  enqueue m_123 on child
  return { agentId: child.id, questId: "m_123" }

child:
  processes m_123
  appends assistant result m_456
  marks quest m_123 completed with resultMessageId m_456

runtime:
  emits inbox event to main:
    quest.completed(child, m_123, m_456)

main:
  reaches a scheduler checkpoint
  sees the event in a continuation batch
  calls quest.result(child, m_123)
  uses the stable result
  does not wait for unrelated pending quests
```

If three child agents run in parallel, each produces its own quest event. Main processes the completed event batch that exists at its next scheduler checkpoint. If one child is complete and two are still running, main handles the one completed result and leaves the other two alone. If all three completed before the checkpoint, main can handle all three together.

Sending a quest does not force main to wait. Main may continue local work, dispatch more quests, or finish its current answer. Child completion only appends an inbox notification; the scheduler decides when the parent gets a continuation.

### 7.1 Parallel Delegation Semantics

Example: main delegates two tasks, then has local work to do.

```text
main:
  tool call agent.delegate(poet, "Write a poem")
  tool call agent.delegate(coder, "Write Rust hello world")

runtime:
  dispatches both child quests
  does not put main into a waiting state

main:
  continues local work that does not depend on child results

poet completes while main is running:
  runtime appends quest.completed to main.inbox
  main is not interrupted

main finishes local work:
  scheduler sees completed inbox events
  enqueues a continuation for the currently completed batch

main continuation:
  reads and reports completed results in that batch
  leaves still-running quests alone

coder completes later:
  runtime appends a new quest.completed event
  scheduler processes it at the next checkpoint
```

The parent handles mature results opportunistically. It does not block on unfinished siblings.

### 7.2 Action-Only Tool Turns

Provider responses that contain side-effecting tool calls are action turns. They should not carry final user-visible work in the same assistant message.

Rules:

- A turn containing `agent.delegate`, `agent.send`, or another side-effecting tool is for dispatching actions.
- Local work that should happen after delegation belongs in a follow-up continuation after tool calls have executed.
- The UI may show a short planning note from an action turn, but final answer content should come from a non-action continuation.
- This prevents the model from writing "I started the children and here is my local answer" before the runtime has actually dispatched the children.

## 8. Permissions

Default rules:

- User can read/write all agents.
- An agent can read/write itself.
- An agent can send messages to descendants under its parentAgentId ownership tree.
- An agent can read quest status and result messages for quests it created.
- An agent cannot read a parent or sibling full transcript by default.
- A child agent should not create its own child agents unless explicitly granted.

Required checks:

```js
canSendMessage(actorAgentId, targetAgentId)
canReadMessage(actorAgentId, targetAgentId, messageId)
canReadQuest(actorAgentId, targetAgentId, questId)
canUseTool(actorAgentId, toolId, phase)
```

Project plugins may extend permission resolution, but they must not bypass the framework runtime when changing agent/message/quest state.

## 9. Context Building

The framework builds model context. Providers and bridges only transport requests.

Each request may include:

- Current agent summary.
- Current message.
- Recent local messages within budget.
- The current completed inbox event batch, when the request is an inbox continuation.
- Relevant pending quest summaries as non-blocking background.
- Explicit context refs and attachments.
- Available tools and skills.
- Project/plugin rules.

It must not automatically include full child transcripts. The model should call `quest.result` when it needs exact child results.

## 10. UI Projection

### AgentList

- Show one status dot per agent.
- Show queued count.
- Show unread inbox count.
- Show running/waiting status compactly.
- Auto-expand parent agent when a child agent is created.
- Do not auto-select a child agent created by a tool.

### Message

- User and assistant messages render as chat cards.
- Tool calls render as compact activities.
- Default tool activity header:

```text
tool.name                         Always  Apply  Reject
```

- Completed/applied tool calls show no buttons.
- Large args/results are collapsed by default.
- ChangeSet/GDE patch keeps full review UI.

### Quest Activity

Cross-agent send should render as a compact activity:

```text
poet · running · quest m_123
poet · completed · 4.5s · View result
```

Clicking result jumps to the child agent message or opens a preview.

## 11. Migration From Current Code

Implementation should be staged but the final API should not preserve old compatibility names.

### Stage 1: Data Shape

- Add `agent.queue`, `agent.inbox`, `agent.quests`.
- Add `message.agentId`, `message.questId`, `message.resultForQuestId`.
- Keep existing message fields only if they remain part of the final schema.
- Remove user-facing dependency on `agent.mode`.

### Stage 2: Message API

- Implement `aiditor.ai.message.send`.
- Implement `aiditor.ai.message.read`.
- Update AI send panel to use `message.send`.

### Stage 3: Quest API

- Rework `agent.send` tool to create a target message and quest, return `{ agentId, questId, messageId, status }`.
- Implement `aiditor.ai.quest.read`.
- Implement quest completion update when target agent finishes the request message.

### Stage 4: Scheduler

- Add queue-based scheduler.
- Allow messages to be added while an agent is running.
- Emit inbox events on quest completion.
- Schedule continuations for actionable inbox events.

### Stage 5: UI

- Update AgentList badges/status.
- Update Message panel tool and quest activity rendering.
- Ensure tool-created child agents expand but do not become active.

### Stage 6: Tests

Required tests:

- `agent.send` returns child request `messageId` as `questId`.
- `quest.result(child, questId)` returns the exact final child result after completion.
- A child can process another task after quest completion without changing old quest result.
- Multiple child quests can run concurrently and complete out of order.
- Sending a user message while agent is running queues it.
- Interrupt stops current execution and runs interrupt message next.
- Agent cannot read sibling transcript by default.
- Parent can read result message for a quest it created.

## 12. Non-Goals

- No hidden plan daemon.
- No separate chat/goal runtime modes.
- No default full transcript sharing between agents.
- No unlimited recursive subagent creation.
- No project-level direct mutation of runtime state outside framework APIs.

## 13. Final Mental Model

```text
Agent   = peer execution entity
Message = smallest conversation/task unit
Quest   = cross-agent completion index for one request message
Queue   = ordered pending input
Inbox   = async event notifications
Tool    = only side-effect boundary
Context = framework-built request payload
Provider= transport only
UI      = projection of real runtime state
```

This model supports Codex-style parallel collaboration while staying small enough for AIditor: a parent can dispatch many child quests, continue its own work, process whatever child results have completed by the next scheduler checkpoint, and read exact results by `agentId/messageId` without contaminating context or losing task boundaries.
