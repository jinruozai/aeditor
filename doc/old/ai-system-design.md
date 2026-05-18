# Aiditor AI System Design

Status: final model contract  
Scope: framework-level AI runtime, panels, extension contracts

## 1. Goal

Aiditor provides a generic AI workbench for editor applications:

- parallel agents
- connection/model abstraction
- structured resource references and resolvers
- context capture from editor UI
- tools with preview/approval/apply flow
- reusable agent list, chat input, and message panels
- extension points for providers, auth, transports, resources, context, skills, tools, and plugins

The framework never knows GameDataEditor tables, assets, card styles, schemas, or project rules. Applications register those as resources, skills, and tools.

## 2. Core Model

There is no session concept, no group concept, and no path identity.

The AI runtime has one runnable entity:

```js
Agent
```

Agents are flat runtime records. Parent/child is represented only by `parentAgentId`; it controls UI nesting, ownership, and default permissions. Agent `id` is the only stable identity. Agent `name` is a display label and may repeat.

```js
{
  id,
  name,
  parentAgentId,
  order,
  connection,
  model,
  permissionMode,
  status,
  statusText,
  activeMessageId,
  activeQuestId,
  messages,
  queue,
  inbox,
  quests,
  contextRefs,
  memory,
  state,
  skillRefs,
  toolRefs,
  permissions,
  createdAt,
  updatedAt,
  meta
}
```

## 3. Store Shape

```js
aiditor.ai.agents
aiditor.ai.resources
aiditor.ai.activeAgentId
```

No framework API exposes `groups`, `groupId`, or agent `path`.

## 4. Agent APIs

```js
aiditor.ai.createAgent({ name, parentAgentId, connection, model, systemPrompt, contextRefs, skillRefs, toolRefs, permissions, memory, state, meta })
aiditor.ai.renameAgent(agentId, name)
aiditor.ai.moveAgent(agentId, { parentAgentId, order })
aiditor.ai.reparentAgent(agentId, parentAgentId, order)
aiditor.ai.deleteAgent(agentId)
aiditor.ai.selectAgent(agentId)
```

Deletion removes the agent and all descendants. Reparenting rejects cycles.

## 5. Messages And Queue

Every visible chat card is a `Message` with a stable id.

```js
{
  id,
  agentId,
  from,
  role,
  content,
  status,
  contextRefs,
  attachments,
  toolCalls,
  questId,
  resultForQuestId,
  meta
}
```

User input always enters the target agent queue:

```js
aiditor.ai.message.send(agentId, {
  content,
  contextRefs,
  attachments,
  priority,
  interrupt,
  guidance
})
```

If the agent is idle, the scheduler starts immediately. If it is running, the message stays queued. If `interrupt` is true, the current run is stopped and the new message goes to the front. `guidance` is a lightweight instruction attached to the queued message and included in current request context so the running agent can avoid conflicting work.

## 6. Quests

A quest is a cross-agent task index. The quest id is the request message id on the target agent.

```js
{
  id,
  fromAgentId,
  toAgentId,
  requestMessageId,
  status,
  resultMessageId,
  summary
}
```

```js
aiditor.ai.agent.send(toAgentId, { fromAgentId, content, contextRefs, attachments, priority, interrupt, guidance })
aiditor.ai.quest.read(agentId, questId, actor)
aiditor.ai.quest.result(agentId, questId, actor)
```

`quest.result` is the model-facing preferred read path. It returns status and, once completed, the exact result message/content in one call.

Delegation does not force the sender to wait. The sender may continue local work, dispatch more quests, or stop. Child completion appends an inbox notification; it does not interrupt a running sender.

At each sender scheduler checkpoint, the runtime may enqueue one continuation for the completed inbox event batch that is available at that moment. The continuation may read all completed results in that batch. Still-running sibling quests are non-blocking background and must not be waited on unless the user or agent explicitly requested "wait for all".

## 7. Orchestration Tools

The built-in tool surface is intentionally small:

```text
agent.read
agent.create
agent.delegate
agent.reparent
agent.delete
agent.send
quest.read
quest.result
message.read
agent.stop
```

`agent.delegate` is the preferred high-level operation for create/reuse + send. Tools never accept or return `groupId` or agent `path`.

## 8. Mentions

Chat input can render agent mentions inline. A visible mention such as `@poet` stores an agent id internally:

```js
{ type: 'agent-ref', agentId: 'a_xxx', label: 'poet' }
```

Names are not identity. Duplicate names are resolved by the mention picker. Model-facing text must include the id, for example:

```text
@poet(agent:a_xxx)
```

## 9. Permissions

Default rules:

- user can read/send/manage all agents
- an agent can read/write itself
- an agent can read summaries of descendants
- an agent can send to descendants
- an agent can manage descendants
- an agent can read quest results for quests it created
- child agents should not create further child agents unless explicitly requested

Permissions are resolved by agent id and `parentAgentId` ancestry. Application resource permissions may still use resource paths such as `gde`, but those paths are not agent identity.

## 10. Context Building

The framework builds model context. Providers and local bridges only transport requests.

Each request may include:

- current agent id/name/parent id
- current message
- recent local messages within model budget
- the current completed inbox event batch, when processing inbox continuation work
- pending quest summaries as non-blocking background
- queued message summaries
- explicit context refs and attachments
- available tools and skills
- project/plugin rules

It must not automatically include full child transcripts. The model calls `quest.result` when it needs exact child results.

## 11. UI Projection

AgentList renders the `parentAgentId` tree. It must:

- show a single status dot per agent
- show queue/inbox counts compactly
- auto-expand parent agents when a child is created
- not auto-select a child created by a tool
- support drag/drop reparenting by agent id

Chat input sends queued messages while the active agent is running. Empty input turns the send button into Stop.

Messages render tool calls and quest activity compactly by default, with large details collapsed.

Provider responses that contain side-effecting tools are action turns. Final user-visible answer content should be produced in a non-action continuation after the tools have executed. This keeps delegation order truthful: the runtime dispatches children first, then the parent continues local work or handles completed event batches.
