// EF.ai built-in agent/group orchestration tools.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  function clone(value) {
    return value == null ? value : structuredClone(value)
  }

  function byId(list, id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i]
    }
    return null
  }

  function actor(ctx) {
    return ctx.actor || (ctx.toolCall && ctx.toolCall.actor) || 'user'
  }

  function requireRead(ctx, agentId) {
    if (!ai.canRead(actor(ctx), agentId, 'agent.full')) throw new Error('Permission denied')
  }

  function requireSend(ctx, agentId) {
    if (!ai.canSend(actor(ctx), agentId)) throw new Error('Permission denied')
  }

  function requireManage(ctx, agentId) {
    if (!ai.canManage(actor(ctx), agentId)) throw new Error('Permission denied')
  }

  function requireManageOrSelf(ctx, agentId) {
    if (actor(ctx) !== agentId) requireManage(ctx, agentId)
  }

  function groupSummary(group) {
    return {
      id: group.id,
      name: group.name,
      parentId: group.parentId || null,
      order: group.order,
      collapsed: !!group.collapsed,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }
  }

  function agentSummary(agent, full) {
    const out = {
      id: agent.id,
      name: agent.name,
      path: agent.path,
      groupId: agent.groupId || null,
      order: agent.order,
      connection: agent.connection,
      model: agent.model,
      mode: agent.mode,
      permissionMode: agent.permissionMode,
      status: agent.status,
      contextRefs: clone(agent.contextRefs || []),
      skillRefs: clone(agent.skillRefs || []),
      toolRefs: clone(agent.toolRefs || []),
      permissions: clone(agent.permissions),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      meta: clone(agent.meta || {}),
    }
    if (full) {
      out.systemPrompt = agent.systemPrompt || ''
      out.messages = clone(agent.messages || [])
      out.memory = clone(agent.memory || {})
      out.state = clone(agent.state || {})
    }
    return out
  }

  function readGroup(args) {
    const groups = ai.groups.peek()
    if (args && args.groupId) {
      const group = byId(groups, args.groupId)
      if (!group) throw new Error('Group not found')
      return groupSummary(group)
    }
    return groups.map(groupSummary)
  }

  function createGroupPreview(args) {
    return {
      action: 'create',
      kind: 'group',
      group: {
        name: args.name || 'Group',
        parentId: args.parentId || null,
        order: args.order == null ? null : args.order,
        collapsed: !!args.collapsed,
      },
    }
  }

  function createGroupApply(args) {
    return ai.createGroup({
      name: args.group && args.group.name,
      parentId: args.group && args.group.parentId,
      order: args.group && args.group.order,
      collapsed: args.group && args.group.collapsed,
    })
  }

  function reparentGroupPreview(args) {
    const group = ai.findGroup(args.groupId)
    const parent = args.parentId ? ai.findGroup(args.parentId) : null
    if (!group) throw new Error('Group not found')
    if (args.parentId && !parent) throw new Error('Parent group not found')
    return {
      action: 'reparent',
      kind: 'group',
      groupId: group.id,
      fromParentId: group.parentId || null,
      toParentId: args.parentId || null,
      order: args.order == null ? group.order : args.order,
    }
  }

  function reparentGroupApply(args) {
    return ai.moveGroup(args.groupId, { parentId: args.toParentId || null, order: args.order })
  }

  function deleteGroupPreview(args) {
    const group = ai.findGroup(args.groupId)
    if (!group) throw new Error('Group not found')
    return {
      action: 'delete',
      kind: 'group',
      group: groupSummary(group),
      affectedAgentIds: ai.agents.peek().filter(function (agent) { return agent.groupId === group.id }).map(function (agent) { return agent.id }),
    }
  }

  function deleteGroupApply(args) {
    return ai.deleteGroup(args.group && args.group.id)
  }

  function readAgent(args, ctx) {
    if (args && args.agentId) {
      requireRead(ctx, args.agentId)
      const agent = ai.findAgent(args.agentId)
      if (!agent) throw new Error('Agent not found')
      return agentSummary(agent, true)
    }
    const who = actor(ctx)
    const agents = ai.agents.peek()
    const out = []
    for (let i = 0; i < agents.length; i++) {
      if (ai.canRead(who, agents[i].id, 'agent.summary')) out.push(agentSummary(agents[i], false))
    }
    return out
  }

  function createAgentPreview(args, ctx) {
    if (args.parentAgentId) requireManageOrSelf(ctx, args.parentAgentId)
    return {
      action: 'create',
      kind: 'agent',
      agent: {
        name: args.name || 'Agent',
        path: args.path || args.name || 'Agent',
        groupId: args.groupId || null,
        parentAgentId: args.parentAgentId || null,
        connection: args.connection || ai.defaultConnection || 'mock',
        model: args.model || '',
        mode: args.mode || 'chat',
        systemPrompt: args.systemPrompt || '',
        contextRefs: clone(args.contextRefs || []),
        skillRefs: clone(args.skillRefs || []),
        toolRefs: clone(args.toolRefs || []),
        permissions: clone(args.permissions || null),
        state: clone(args.state || {}),
        memory: clone(args.memory || {}),
        meta: clone(args.meta || {}),
      },
    }
  }

  function createAgentApply(args) {
    const spec = clone(args.agent)
    const parentAgentId = spec.parentAgentId
    delete spec.parentAgentId
    if (parentAgentId) {
      const parent = ai.findAgent(parentAgentId)
      spec.path = ai.normalizePath(parent.path + '/' + ai.agentNameFromPath(spec.path || spec.name))
      spec.groupId = parent.groupId || null
    }
    return ai.createAgent(spec)
  }

  function reparentAgentPreview(args, ctx) {
    const agent = ai.findAgent(args.agentId)
    if (!agent) throw new Error('Agent not found')
    requireManage(ctx, agent.id)
    if (args.parentAgentId) requireManageOrSelf(ctx, args.parentAgentId)
    return {
      action: 'reparent',
      kind: 'agent',
      agentId: agent.id,
      fromGroupId: agent.groupId || null,
      toGroupId: args.groupId || null,
      parentAgentId: args.parentAgentId || null,
      order: args.order == null ? agent.order : args.order,
    }
  }

  function reparentAgentApply(args) {
    if (args.parentAgentId) return ai.reparentAgent(args.agentId, args.parentAgentId, args.order)
    return ai.moveAgent(args.agentId, { groupId: args.toGroupId || null, order: args.order })
  }

  function deleteAgentPreview(args, ctx) {
    const agent = ai.findAgent(args.agentId)
    if (!agent) throw new Error('Agent not found')
    requireManage(ctx, agent.id)
    return {
      action: 'delete',
      kind: 'agent',
      agent: agentSummary(agent, false),
      descendantAgentIds: ai.agents.peek().filter(function (item) {
        return item.id !== agent.id && ai.isDescendant(agent.path, item.path)
      }).map(function (item) { return item.id }),
    }
  }

  function deleteAgentApply(args) {
    return ai.deleteAgent(args.agent && args.agent.id)
  }

  function sendAgent(args, ctx) {
    requireSend(ctx, args.agentId)
    const sent = ai.sendMessage(args.agentId, {
      content: args.content || '',
      contextRefs: clone(args.contextRefs || []),
      meta: clone(args.meta || null),
    }, actor(ctx))
    return {
      message: sent && sent.message,
      runId: sent && sent.request && sent.request.runId,
      connection: sent && sent.request && sent.request.connection,
      model: sent && sent.request && sent.request.model,
    }
  }

  function stopAgent(args, ctx) {
    requireManage(ctx, args.agentId)
    return { stopped: ai.stopAgent(args.agentId) }
  }

  ai.registerTool('group.read', {
    title: 'Read Groups',
    description: 'Read one group or list all AI agent groups.',
    schema: { type: 'object', properties: { groupId: { type: 'string' } } },
    permissions: ['tool.call'],
    run: readGroup,
  })

  ai.registerTool('group.create', {
    title: 'Create Group',
    description: 'Create an AI agent group after preview approval.',
    schema: { type: 'object' },
    permissions: ['tool.call', 'tool.apply'],
    preview: createGroupPreview,
    apply: createGroupApply,
  })

  ai.registerTool('group.reparent', {
    title: 'Reparent Group',
    description: 'Move a group under another group after preview approval.',
    schema: { type: 'object' },
    permissions: ['tool.call', 'tool.apply'],
    preview: reparentGroupPreview,
    apply: reparentGroupApply,
  })

  ai.registerTool('group.delete', {
    title: 'Delete Group',
    description: 'Delete a group folder after preview approval. Agents are moved to the root.',
    schema: { type: 'object', required: ['groupId'] },
    permissions: ['tool.call', 'tool.apply'],
    preview: deleteGroupPreview,
    apply: deleteGroupApply,
  })

  ai.registerTool('agent.read', {
    title: 'Read Agents',
    description: 'Read one agent or list readable agent summaries.',
    schema: { type: 'object', properties: { agentId: { type: 'string' } } },
    permissions: ['tool.call'],
    run: readAgent,
  })

  ai.registerTool('agent.create', {
    title: 'Create Agent',
    description: 'Create an AI agent after preview approval.',
    schema: { type: 'object' },
    permissions: ['tool.call', 'tool.apply'],
    preview: createAgentPreview,
    apply: createAgentApply,
  })

  ai.registerTool('agent.reparent', {
    title: 'Reparent Agent',
    description: 'Move an agent to a group or under another agent after preview approval.',
    schema: { type: 'object', required: ['agentId'] },
    permissions: ['tool.call', 'tool.apply'],
    preview: reparentAgentPreview,
    apply: reparentAgentApply,
  })

  ai.registerTool('agent.delete', {
    title: 'Delete Agent',
    description: 'Delete an agent after preview approval.',
    schema: { type: 'object', required: ['agentId'] },
    permissions: ['tool.call', 'tool.apply'],
    preview: deleteAgentPreview,
    apply: deleteAgentApply,
  })

  ai.registerTool('agent.send', {
    title: 'Send Agent Message',
    description: 'Send a message to another agent through the normal EF.ai runtime.',
    schema: { type: 'object', required: ['agentId', 'content'] },
    permissions: ['tool.call'],
    run: sendAgent,
  })

  ai.registerTool('agent.stop', {
    title: 'Stop Agent',
    description: 'Stop a running agent.',
    schema: { type: 'object', required: ['agentId'] },
    permissions: ['tool.call'],
    run: stopAgent,
  })

  ai.registerSkill('orchestration', {
    id: 'orchestration',
    title: 'Agent Orchestration',
    version: '1.0.0',
    description: 'Create, read, message, stop, delete, and reorganize EF.ai agents and groups within permission boundaries.',
    systemPrompt: 'Use agent.* and group.* tools to coordinate EF.ai agents. Preview destructive or structural changes before applying them. Respect readable, sendable, and manageable target boundaries.',
    rules: [
      'Read target agents before changing them.',
      'Use preview/apply tools for create, delete, and reparent operations.',
      'Use agent.send for delegated work and agent.stop only for agents you can manage.',
      'If you are already running as a child agent, do not create further child agents unless the user explicitly requests deeper delegation.',
    ],
    tools: [
      'group.read',
      'group.create',
      'group.reparent',
      'group.delete',
      'agent.read',
      'agent.create',
      'agent.reparent',
      'agent.delete',
      'agent.send',
      'agent.stop',
    ],
  })
})(window.EF = window.EF || {})
