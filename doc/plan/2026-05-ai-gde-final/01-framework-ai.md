# Framework AI work plan

## Ownership

Framework owns reusable AI infrastructure only:

- agent/group store
- provider registry and request runtime
- tool registry and tool-call lifecycle
- permission resolver
- target protocol and drag/drop transport
- AI panels
- settings integration
- common message/tool-call rendering

Framework must not know about tables, entities, assets, card styles, or GameDataEditor data formats.

## Final Public Surface

Panels:

| ID | Purpose |
| --- | --- |
| `ai-agents-list` | Agent/group browser and management |
| `ai-chatinput` | Composer, targets, provider/model/mode/permission |
| `ai-messages` | Active agent message transcript and tool-call results |

Core APIs:

```js
EF.ai.createAgent(spec)
EF.ai.updateAgent(id, patch)
EF.ai.deleteAgent(id)
EF.ai.reparentAgent(id, parentAgentId)
EF.ai.createGroup(spec)
EF.ai.moveAgent(id, patch)
EF.ai.registerProvider(id, provider)
EF.ai.registerTool(id, tool)
EF.ai.registerSkill(id, skill)
EF.ai.registerTargetProvider(id, provider)
EF.ai.bindTarget(el, targetOrFn, opts)
EF.ai.installTargetDrop(el, opts)
EF.ai.attachTargetsToAgent(agentId, targets)
EF.ai.createToolCall(agentId, spec, actor)
EF.ai.previewToolCall(agentId, callId, actor)
EF.ai.approveToolCall(agentId, callId, actor)
EF.ai.runToolCall(agentId, callId, actor)
EF.ai.applyToolCall(agentId, callId, actor)
```

No old component IDs or aliases are allowed.

Built-in orchestration tool IDs:

```txt
group.read
group.create
group.reparent
group.delete
agent.read
agent.create
agent.reparent
agent.delete
agent.send
agent.stop
```

These are registered through `EF.ai.registerTool`, so they do not use an `ai.*` prefix.

## Permission Model

Permission checks must gate:

- reading agent state
- sending messages
- managing agents
- reading resources
- calling tools
- applying tool results

Resource metadata and payload must share the same permission boundary. If an actor cannot read resources, the provider request must not receive target metadata either.

Delegation is intentionally shallow:

- A top-level agent may create direct child agents when splitting work materially helps.
- A child agent may not create another child agent unless the user explicitly requests nested delegation or names the deeper hierarchy.
- Agent creation/reparenting still requires `agent.manage` and relevant tool apply permission.
- Group tools never grant runtime permissions because groups are UI folders only.

## Tool-Call Lifecycle

Every tool call has one of these states:

```text
proposed -> previewed -> approved -> running -> completed -> applied
proposed -> rejected
running -> failed
```

Tools that mutate user data expose `preview` and `apply`. `run` must not silently mutate editor state unless the host explicitly registered a direct-run tool for that purpose.

## UI Requirements

- `ai-chatinput` supports pending target chips, provider/model grouped selection, chat/goal mode, and permission mode.
- `ai-messages` renders:
  - user messages as compact right-aligned bubbles
  - assistant messages as left-aligned text without heavy cards
  - tool calls as collapsible structured blocks
  - patch previews with explicit approval actions
- `ai-agents-list` supports:
  - group creation
  - agent creation
  - drag reorder
  - drag into group
  - drag onto agent to become child agent
  - subtree movement when moving an agent with children

## Implementation Tasks

1. Keep final component IDs only.
2. Add grouped model dropdown behavior that only shows configured providers.
3. Harden target permission filtering.
4. Improve tool-call rendering for previews and apply results.
5. Add tests for target permission, tool lifecycle, grouped model availability, and agent subtree movement.
