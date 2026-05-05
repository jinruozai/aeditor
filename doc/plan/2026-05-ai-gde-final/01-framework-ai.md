# Framework AI Work Plan

## Boundary

Framework owns reusable AI infrastructure only:

- id-based agent store
- parent/child agent relationship through `parentAgentId`
- connection/auth/transport registry
- request runtime and context budgeting
- tool registry and tool-call lifecycle
- quest runtime for cross-agent delegated work
- permission resolver
- target/resource protocol and drag/drop transport
- AI panels and common message/tool-call rendering
- Settings integration
- framework ChangeSet review system

Framework must not know about GameDataEditor tables, entities, assets, card styles, or game data formats.

## Final Agent Model

There is no session, no group, and no agent path.

```js
{
  id,
  name,
  parentAgentId,
  order,
  connection,
  model,
  status,
  messages,
  queue,
  inbox,
  quests,
  contextRefs,
  toolRefs,
  skillRefs,
  permissions
}
```

Rules:

- `id` is the only stable identity.
- `name` is display text and may repeat.
- `parentAgentId` is the only hierarchy field.
- UI may render a tree from `parentAgentId`, but the data model has no folder/group layer.
- Mentions and UI labels display names but store ids.

## Final Public Surface

Panels:

| ID | Purpose |
| --- | --- |
| `ai-agents-list` | Agent browser and management |
| `ai-chatinput` | Composer, inline refs, connection/model, permission mode |
| `ai-messages` | Active agent message transcript and tool-call results |

Core APIs:

```js
EF.ai.createAgent(spec)
EF.ai.updateAgent(id, patch)
EF.ai.renameAgent(id, name)
EF.ai.deleteAgent(id)
EF.ai.reparentAgent(id, parentAgentId, order)
EF.ai.moveAgent(id, patch)
EF.ai.selectAgent(id)

EF.ai.agent.send(agentId, message, actor)
EF.ai.agent.read(agentId, actor)
EF.ai.agent.messages(agentId, opts, actor)
EF.ai.quest.read(agentId, questId, actor)
EF.ai.quest.result(agentId, questId, actor)
EF.ai.message.read(agentId, messageId, actor)

EF.ai.registerConnection(id, connection)
EF.ai.registerAuthDriver(type, driver)
EF.ai.registerTransport(type, driver)
EF.ai.registerTool(id, tool)
EF.ai.registerSkill(id, skill)
EF.ai.registerTargetProvider(id, provider)
EF.ai.bindTarget(el, targetOrFn, opts)
EF.ai.installTargetDrop(el, opts)
EF.ai.attachTargetsToAgent(agentId, targets)

EF.ai.createToolCall(agentId, spec, actor)
EF.ai.previewToolCall(agentId, callId, actor)
EF.ai.approveToolCall(agentId, callId, actor)
EF.ai.rejectToolCall(agentId, callId, actor)
EF.ai.runToolCall(agentId, callId, actor)
EF.ai.applyToolCall(agentId, callId, actor)

EF.changeSet.create(spec)
EF.changeSet.apply(id, scope, actor)
EF.changeSet.reject(id, scope, actor)
EF.changeSet.registerAdapter(id, adapter)
EF.changeSet.registerRenderer(kind, renderer)
EF.ui.changeReview(spec)
```

Built-in orchestration tools:

```txt
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

## Permission Model

Permission checks gate:

- reading agent state
- reading messages
- sending messages
- managing agents
- reading resources
- calling tools
- applying tool results

Default relationship:

- User can do everything.
- An agent can read/send to itself.
- Parent agents can read summaries, send messages, and manage descendants.
- A quest result is readable by the agent that created that quest.
- Resource permissions still use application resource paths, but those paths are not agent identity.

Resource metadata and payload must share the same permission boundary. If an actor cannot read resources, the provider request must not receive target metadata.

## Delegation Runtime

`agent.delegate` is the preferred one-step create/reuse + send operation. It returns:

```js
{
  agentId,
  questId,
  messageId,
  status
}
```

Delegation does not force the parent into a waiting state. The parent can:

- continue doing useful local work
- delegate to other children
- stop and wait for runtime events
- call `quest.result(agentId, questId)` after a completion event

The runtime inserts compact inbox events when child quests complete. These are notifications, not interrupts. If the parent is running, the event waits in `inbox` until the next scheduler checkpoint.

At a checkpoint, the scheduler should enqueue one continuation for the completed event batch available now:

- If one child has completed and others are still running, process the one completed result.
- If multiple children completed before the checkpoint, process that completed batch together.
- Pending sibling quests are background only and must not block the continuation.
- Waiting for all children is allowed only when the user or agent explicitly requested that policy.

Tool turns that dispatch side effects should be action-only. A response containing `agent.delegate` or `agent.send` should not also be treated as the final visible answer; local work after delegation belongs in a follow-up continuation after the tool calls have actually executed.

## Message Queue

When an agent is running:

- non-interrupt user messages are queued in order
- interrupt messages stop the current run and move to the front
- guidance text may be attached to a queued message and is included in the next request context

The composer should keep this visible and predictable, but the store remains the source of truth.

## UI Requirements

- `ai-agents-list`
  - renders only agents
  - no group/folder creation
  - right click root: new root agent
  - right click agent: new child, rename, delete
  - drag onto agent: make child
  - drag before/after: reorder at same parent
  - moving an agent moves its descendants implicitly

- `ai-chatinput`
  - supports inline resource refs
  - supports file/resource drops
  - shows only configured model choices
  - send while running queues; empty send while running stops

- `ai-messages`
  - user messages compact right aligned
  - assistant messages text-first, no heavy card
  - tool calls collapsed by default
  - tool preview shows only Apply/Reject plus allow toggle
  - event messages are compact system rows, not normal chat bubbles

## Implementation Tasks

1. Remove group/path APIs and tests.
2. Keep agent tree purely derived from `parentAgentId`.
3. Keep orchestration tools id-first and parentAgentId-only.
4. Keep request context aligned with id/name/parentAgentId.
5. Verify queue, interrupt, delegation, quest result, resource permission, and persistence tests.
6. Rebuild `dist` and sync GameDataEditor vendor.
