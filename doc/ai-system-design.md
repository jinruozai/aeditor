# EditorFrame AI System Design

Status: final model contract
Scope: framework-level AI runtime, panels, extension contracts

## 1. Goal

EditorFrame provides a generic AI workbench for editor applications:

- group/agent organization
- many parallel agents
- provider/model abstraction
- structured resource references and resolvers
- context capture from editor UI
- tools with preview/approval flow
- reusable panels for groups, agents, chat, and transcript
- global skill, template, plugin, provider, and context-provider extension points

The framework must not know GameDataEditor tables, game assets, card styles, or project schemas. Those belong to application adapters.

## 2. Core Principle

There is no session concept.

The AI model has only two project-visible entities:

- `Group`: a pure UI folder for organizing agents.
- `Agent`: the only runnable entity.

Groups never own runtime state. They do not own messages, context, resources, permissions, providers, or models. Deleting or moving a group only changes UI organization; it must not delete or mutate agents unless an explicit agent operation is called.

Agents own their complete runtime state:

```js
{
  id,
  groupId,
  name,
  messages,
  contextRefs,
  memory,
  state,
  provider,
  model,
  mode,
  status,
  createdAt,
  updatedAt,
  meta
}
```

## 3. Framework Ownership

Framework owns:

- `EF.ai` namespace
- group store
- agent store
- resource reference store
- active agent selection
- global provider registry
- global model/provider option discovery
- global resource resolver registry
- global context provider registry
- global tool registry
- global skill registry
- global agent template registry
- global plugin contribution registry
- permission resolver
- runtime scheduler
- common AI panels
- common transcript/tool-call UI

Applications own:

- domain prompts
- domain resource resolvers
- domain context providers
- domain tools
- validation and apply logic
- project AI defaults
- project skills and templates
- project plugins

## 4. Store Shape

The public store is flat and session-free:

```js
EF.ai.groups          // signal<Group[]>
EF.ai.agents          // signal<Agent[]>
EF.ai.resources       // signal<ResourceRef[]>
EF.ai.activeAgentId   // signal<string|null>
```

### Group

```js
{
  id,
  parentId,       // null for root-level UI folder
  name,
  order,
  collapsed,
  createdAt,
  updatedAt,
  meta
}
```

Group operations:

```js
EF.ai.createGroup({ name, parentId, order, collapsed, meta })
EF.ai.moveGroup(groupId, { parentId, order })
EF.ai.deleteGroup(groupId)
```

`deleteGroup` removes only the folder. Agents previously pointing to that group are reparented to `null` unless a future explicit option says otherwise.

### Agent

```js
{
  id,
  groupId,
  name,
  messages,
  contextRefs,
  memory,
  state,
  provider,
  model,
  mode,        // "chat" | "goal"
  status,      // "idle" | "queued" | "running" | "waiting" | "done" | "error"
  permissions,
  createdAt,
  updatedAt,
  meta
}
```

Agent operations:

```js
EF.ai.createAgent({ groupId, name, provider, model, mode, contextRefs, memory, state, permissions, meta })
EF.ai.renameAgent(agentId, name)
EF.ai.moveAgent(agentId, { groupId, order })
EF.ai.reparentAgent(agentId, groupId)
EF.ai.deleteAgent(agentId)
```

`moveAgent` is for ordering and grouping. `reparentAgent` is the narrow group-only operation used by UI trees and drag/drop.

### Message

Messages live on the target agent:

```js
{
  id,
  from,          // "user" | "agent:<id>" | "system" | "tool:<id>"
  role,          // "user" | "assistant" | "system" | "tool"
  content,
  contextRefs,
  attachments,
  toolCalls,
  createdAt,
  status,
  meta
}
```

API:

```js
EF.ai.sendMessage(agentId, message, actor)
EF.ai.runAgent(agentId)
EF.ai.stopAgent(agentId)
```

`sendMessage` appends to `agent.messages` and schedules that agent only. Agent-to-agent messaging uses the same API with an actor of another agent id.

## 5. Resources

Resources are references, not embedded domain data:

```js
{
  id,
  resolver,
  uri,
  title,
  kind,
  summary,
  meta,
  createdAt
}
```

Resolvers are global capabilities:

```js
EF.ai.registerResourceResolver("gde", {
  canResolve(ref, ctx) {},
  resolve(ref, ctx) {},
  summarize(ref, ctx) {}
})
```

Agents reference resources through `agent.contextRefs`. Provider requests resolve only the resources allowed for the actor and target agent.

## 6. Global Capabilities

The following are globally registered. Agents only reference them by id.

```js
EF.ai.registerProvider(id, provider)
EF.ai.registerContextProvider(id, provider)
EF.ai.registerTool(id, tool)
EF.ai.registerSkill(id, skill)
EF.ai.registerAgentTemplate(id, template)
EF.ai.registerPlugin(id, plugin)
EF.ai.registerResourceResolver(id, resolver)
```

Capabilities must not store agent-local runtime state. Runtime data belongs on `Agent`.

## 7. Permissions

Permissions are agent-target based, not path/session based.

Default rules:

- user can read/send/manage all agents
- an agent can read itself
- an agent can read summaries of agents it manages
- an agent can send messages only where permission allows
- an agent can manage only agents explicitly delegated to it

API:

```js
EF.ai.canRead(actor, targetAgentId, scope)
EF.ai.canSend(actor, targetAgentId)
EF.ai.canManage(actor, targetAgentId)
```

`actor` is `"user"` or an agent id.

Permission scopes:

```js
"agent.summary"
"agent.full"
"messages.read"
"messages.send"
"resources.read"
"memory.read"
"memory.write"
"tool.call"
"tool.apply"
"agent.manage"
```

Applications and plugins may add policy hooks:

```js
EF.ai.setPermissionResolver(function (ctx, next) {
  return next(ctx)
})
```

## 8. Runtime Modes

### Chat Mode

One inbound message creates one assistant turn:

1. receive user, system, tool, or agent message
2. resolve allowed resources and context providers
3. call provider
4. append response to the same agent
5. stop

### Goal Mode

Goal mode loops until completion or policy limit:

```js
state: {
  goalPolicy: {
    maxTurns: 20,
    maxToolCalls: 50,
    requireUserApprovalForApply: true,
    stopWhen: "self_check_passed"
  }
}
```

Goal mode must always have bounded limits. Infinite autonomous loops are not allowed.

## 9. Provider Model

Provider interface:

```js
EF.ai.registerProvider("openai-compatible", {
  models(config) {},
  send(request, ctx) {},
  abort(runId) {}
})
```

Request:

```js
{
  agent,
  provider,
  model,
  messages,
  resources,
  tools,
  skills,
  responseFormat,
  stream
}
```

Provider types:

- OpenAI-compatible HTTP endpoint
- Anthropic-compatible endpoint
- local bridge
- mock provider for testing
- plugin provider

Browser API key mode is allowed for local/personal use, but framework should also support local bridge mode so production setups do not expose keys in the front end.

## 10. Context Providers

Context providers are global and structured:

```js
EF.ai.registerContextProvider("selection", {
  match(target, event) {},
  capture(target, event) {}
})
```

Captured context is stored as resource refs when it should persist on an agent. Temporary run context may be included directly in the provider request.

Recommended interactions:

- application-chosen context menu entry: "Ask AI"
- drag selection to AI context area
- inspector row action: "Send to AI"
- keyboard shortcuts chosen by the application

Framework supplies protocol and UI. Applications register domain providers.

## 11. Tool Calls

Framework tool contract:

```js
EF.ai.registerTool("name", {
  title,
  description,
  schema,
  permissions,
  preview(args, ctx) {},
  run(args, ctx) {},
  apply(result, ctx) {}
})
```

Tool call lifecycle:

```txt
proposed -> previewed -> approved -> running -> completed
proposed -> rejected
running -> failed
```

`preview` is required for editor data changes. It lets the UI show a diff before applying.

Built-in orchestration tools are registered by the framework under the existing `EF.ai` tool registry. Their ids use the short `agent.*` / `group.*` form, not `ai.agent.*`, because they are already scoped by `EF.ai.registerTool`.

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

`agent.create`, `agent.reparent`, `agent.delete`, `group.create`, `group.reparent`, and `group.delete` are preview/apply tools. Preview returns the intended structural change and must not mutate store state; apply commits the change after `tool.apply` permission passes.

Agent-targeted tools preserve the agent permission boundary:

- `agent.read` requires readable target access.
- `agent.send` requires send access to the target agent.
- `agent.stop`, `agent.reparent`, and `agent.delete` require manage access to the target agent.
- Creating or reparenting under a parent agent requires managing that parent, except an agent may create or place descendants under itself.

Groups are pure UI folders and do not carry runtime permissions. Group mutation tools are therefore bounded by the tool call/apply permission on the calling agent; they do not grant access to any agent runtime state.

## 12. Skills, Templates, Plugins

Skills are prompt/runtime packages:

```js
{
  id,
  title,
  version,
  description,
  systemPrompt,
  rules,
  examples,
  tools,
  contextPolicy,
  outputSchemas
}
```

Agent templates are reusable creation presets:

```js
{
  id,
  title,
  defaults: {
    provider,
    model,
    mode,
    memory,
    state,
    contextRefs,
    permissions
  },
  skills
}
```

Plugins contribute global capabilities:

```js
{
  providers: [],
  skills: [],
  tools: [],
  contextProviders: [],
  resourceResolvers: [],
  agentTemplates: []
}
```

Plugin code cannot bypass permission checks.

## 13. Panels

Framework provides generic panel components:

### AI Agents

Responsibilities:

- group tree
- agent list/tree
- create/rename/move/reparent/delete groups
- create/rename/move/reparent/delete agents
- active agent selection
- status display
- search/filter

### AI Chat

Responsibilities:

- active provider/model
- active agent
- mode switch: chat/goal
- context/resource chips
- attachments
- input box
- send/stop/regenerate
- tool permission mode

### AI Transcript

Responsibilities:

- active agent message timeline
- streamed output
- tool call cards
- tool result cards
- patch/diff preview
- agent-to-agent messages
- status and errors

The panels must be usable by any EditorFrame application without project code.

## 14. Persistence

Framework should support pluggable persistence:

```js
EF.ai.createStore({
  storage: indexedDbStorage | memoryStorage | customStorage
})
```

Default:

- groups, agents, resources, messages, and settings in IndexedDB
- temporary attachments in IndexedDB
- provider API keys either localStorage/IndexedDB for personal use or external local bridge

## 15. Public API Contract

```js
EF.ai.groups
EF.ai.agents
EF.ai.resources
EF.ai.activeAgentId

EF.ai.createGroup(partial)
EF.ai.moveGroup(groupId, patch)
EF.ai.deleteGroup(groupId)

EF.ai.createAgent(partial)
EF.ai.renameAgent(agentId, name)
EF.ai.moveAgent(agentId, patch)
EF.ai.reparentAgent(agentId, groupId)
EF.ai.deleteAgent(agentId)

EF.ai.sendMessage(agentId, message, actor)
EF.ai.runAgent(agentId)
EF.ai.stopAgent(agentId)

EF.ai.canRead(actor, targetAgentId, scope)
EF.ai.canSend(actor, targetAgentId)
EF.ai.canManage(actor, targetAgentId)

EF.ai.registerProvider(id, provider)
EF.ai.registerTool(id, tool)
EF.ai.registerSkill(id, skill)
EF.ai.registerContextProvider(id, provider)
EF.ai.registerResourceResolver(id, resolver)
EF.ai.registerAgentTemplate(id, template)
EF.ai.registerPlugin(id, plugin)
```

Forbidden legacy surface:

```js
EF.ai.sessions
EF.ai.activeSessionId
EF.ai.createSession()
EF.ai.deleteSession()
EF.ai.selectSession()
EF.ai.findSession()
```

## 16. Implementation Phases

Phase 1:

- session removal
- flat group/agent/resource store
- agent runtime
- mock provider
- provider registry
- contract tests

Phase 2:

- AI Agents panel
- AI Chat panel
- AI Transcript panel
- resource chips
- context provider protocol

Phase 3:

- tool registry
- preview/apply lifecycle
- permission resolver
- goal mode loop

Phase 4:

- skills
- agent templates
- plugin contributions
- robust persistence and export/import

## 17. Design Decision

Most of the AI system belongs in EditorFrame.

Project layers should only add:

- domain resource resolvers
- domain context providers
- domain tools
- domain skills
- project defaults
- validation/apply logic

This keeps AI collaboration reusable for any editor built on EditorFrame while leaving domain authority in the application.
