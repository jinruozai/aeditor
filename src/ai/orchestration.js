// EF.ai built-in agent orchestration tools.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  function clone(value) {
    return value == null ? value : structuredClone(value)
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

  function agentSummary(agent, full) {
    const out = {
      id: agent.id,
      name: agent.name,
      parentAgentId: agent.parentAgentId || null,
      order: agent.order,
      connection: agent.connection,
      model: agent.model,
      permissionMode: agent.permissionMode,
      status: agent.status,
      statusText: agent.statusText || '',
      activeMessageId: agent.activeMessageId || null,
      activeQuestId: agent.activeQuestId || null,
      queuedCount: (agent.queue || []).length,
      unreadInboxCount: (agent.inbox || []).filter(function (event) { return !event.consumed }).length,
      recentQuests: clone((agent.quests || []).slice(-8)),
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
      out.queue = clone(agent.queue || [])
      out.inbox = clone(agent.inbox || [])
      out.memory = clone(agent.memory || {})
      out.state = clone(agent.state || {})
    }
    return out
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
    const existingNames = ai.agents.peek().map(function (agent) { return agent.name })
    return {
      action: 'create',
      kind: 'agent',
      agent: {
        name: args.name || ai.generateAgentName(existingNames),
        parentAgentId: args.parentAgentId || null,
        connection: args.connection || (ctx.agent && ctx.agent.connection) || ai.defaultConnection || 'mock',
        model: args.model || (ctx.agent && ctx.agent.model) || '',
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
    spec.select = false
    const agent = ai.createAgent(spec)
    return Object.assign({ applied: true }, agentSummary(agent, true))
  }

  function delegateAgentPreview(args, ctx) {
    const target = args.agentId ? ai.findAgent(args.agentId) : null
    if (args.agentId) {
      if (!target) throw new Error('Agent not found')
      requireSend(ctx, target.id)
      return {
        action: 'delegate',
        kind: 'agent',
        agentId: target.id,
        content: args.content || '',
        contextRefs: clone(args.contextRefs || []),
        attachments: clone(args.attachments || []),
        meta: clone(args.meta || null),
        interrupt: !!args.interrupt,
        guidance: args.guidance || null,
      }
    }
    const parentId = args.parentAgentId || (ctx.agent && ctx.agent.id) || null
    if (parentId) requireManageOrSelf(ctx, parentId)
    return {
      action: 'delegate',
      kind: 'agent',
      agent: {
        name: args.name || 'Agent',
        parentAgentId: parentId,
        connection: args.connection || (ctx.agent && ctx.agent.connection) || ai.defaultConnection || 'mock',
        model: args.model || (ctx.agent && ctx.agent.model) || '',
        systemPrompt: args.systemPrompt || '',
        contextRefs: clone(args.agentContextRefs || []),
        skillRefs: clone(args.skillRefs || []),
        toolRefs: clone(args.toolRefs || []),
        permissions: clone(args.permissions || null),
        state: clone(args.state || {}),
        memory: clone(args.memory || {}),
        meta: clone(args.agentMeta || {}),
      },
      content: args.content || '',
      contextRefs: clone(args.contextRefs || []),
      attachments: clone(args.attachments || []),
      meta: clone(args.meta || null),
      interrupt: !!args.interrupt,
      guidance: args.guidance || null,
    }
  }

  function delegateAgentApply(args, ctx) {
    const agent = args.agentId ? ai.findAgent(args.agentId) : createAgentApply({ agent: args.agent })
    if (!agent) throw new Error('Agent not found')
    const sent = ai.agent.send(agent.id, {
      fromAgentId: actor(ctx) === 'user' ? null : actor(ctx),
      content: args.content || '',
      contextRefs: clone(args.contextRefs || []),
      attachments: clone(args.attachments || []),
      meta: clone(args.meta || null),
      interrupt: !!args.interrupt,
      guidance: args.guidance || null,
    })
    return {
      applied: true,
      agent: agentSummary(ai.findAgent(agent.id), false),
      agentId: agent.id,
      questId: sent && sent.questId,
      messageId: sent && sent.messageId,
      status: sent && sent.status,
    }
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
      fromParentAgentId: agent.parentAgentId || null,
      toParentAgentId: args.parentAgentId || null,
      order: args.order == null ? agent.order : args.order,
    }
  }

  function reparentAgentApply(args) {
    const parentAgentId = args.toParentAgentId || args.parentAgentId || null
    const agent = ai.reparentAgent(args.agentId, parentAgentId, args.order)
    return Object.assign({ applied: true }, agentSummary(agent, false))
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
        return item.id !== agent.id && ai.isDescendant(agent.id, item.id)
      }).map(function (item) { return item.id }),
    }
  }

  function deleteAgentApply(args) {
    const agent = ai.deleteAgent(args.agent && args.agent.id)
    return Object.assign({ applied: true }, agent ? agentSummary(agent, false) : {})
  }

  function sendAgent(args, ctx) {
    requireSend(ctx, args.agentId)
    return ai.agent.send(args.agentId, {
      fromAgentId: actor(ctx) === 'user' ? null : actor(ctx),
      content: args.content || '',
      contextRefs: clone(args.contextRefs || []),
      attachments: clone(args.attachments || []),
      meta: clone(args.meta || null),
      interrupt: !!args.interrupt,
      guidance: args.guidance || null,
    })
  }

  function readQuest(args, ctx) {
    const result = ai.quest.read(args.agentId, args.questId, actor(ctx))
    if (!result) throw new Error('Quest not found or permission denied')
    return result
  }

  function readQuestResult(args, ctx) {
    const result = ai.quest.result(args.agentId, args.questId, actor(ctx))
    if (!result) throw new Error('Quest not found or permission denied')
    return result
  }

  function readMessage(args, ctx) {
    const result = ai.message.read(args.agentId, args.messageId, actor(ctx))
    if (!result) throw new Error('Message not found or permission denied')
    return result
  }

  function stopAgent(args, ctx) {
    requireManage(ctx, args.agentId)
    return { stopped: ai.stopAgent(args.agentId) }
  }

  ai.registerTool('agent.read', {
    title: 'Read Agents',
    description: 'Read one agent or list readable agent summaries.',
    schema: { type: 'object', properties: { agentId: { type: 'string' } } },
    permissions: ['tool.call'],
    run: readAgent,
  })

  ai.registerTool('agent.create', {
    title: 'Create Agent',
    description: 'Create an AI agent after preview approval. Creation only creates the agent; if the user asked this agent to do work, continue with agent.send unless the request only asked for creation.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        parentAgentId: { type: 'string' },
        connection: { type: 'string' },
        model: { type: 'string' },
        systemPrompt: { type: 'string' },
        contextRefs: { type: 'array' },
        skillRefs: { type: 'array' },
        toolRefs: { type: 'array' },
        permissions: { type: 'object' },
        state: { type: 'object' },
        memory: { type: 'object' },
        meta: { type: 'object' },
      },
    },
    permissions: ['tool.call', 'tool.apply'],
    preview: createAgentPreview,
    apply: createAgentApply,
  })

  ai.registerTool('agent.delegate', {
    title: 'Delegate Agent Task',
    description: 'Create or reuse an agent and send it a delegated task in one workflow. Returns agentId and questId. Delegation does not force the parent to wait.',
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        agentId: { type: 'string' },
        name: { type: 'string' },
        parentAgentId: { type: 'string' },
        systemPrompt: { type: 'string' },
        content: { type: 'string' },
        contextRefs: { type: 'array' },
        attachments: { type: 'array' },
        interrupt: { type: 'boolean' },
        guidance: { type: 'string' },
      },
    },
    permissions: ['tool.call', 'tool.apply'],
    preview: delegateAgentPreview,
    apply: delegateAgentApply,
  })

  ai.registerTool('agent.reparent', {
    title: 'Reparent Agent',
    description: 'Move an agent under another agent, or to the root when parentAgentId is empty.',
    schema: { type: 'object', required: ['agentId'] },
    permissions: ['tool.call', 'tool.apply'],
    preview: reparentAgentPreview,
    apply: reparentAgentApply,
  })

  ai.registerTool('agent.delete', {
    title: 'Delete Agent',
    description: 'Delete an agent and its descendants after preview approval.',
    schema: { type: 'object', required: ['agentId'] },
    permissions: ['tool.call', 'tool.apply'],
    preview: deleteAgentPreview,
    apply: deleteAgentApply,
  })

  ai.registerTool('agent.send', {
    title: 'Send Agent Message',
    description: 'Send a message to another agent. Returns a questId for this exact delegated task; prefer quest.result after the runtime reports completion.',
    schema: { type: 'object', required: ['agentId', 'content'] },
    permissions: ['tool.call'],
    run: sendAgent,
  })

  ai.registerTool('quest.read', {
    title: 'Read Quest',
    description: 'Read the status and result message id for a cross-agent quest.',
    schema: { type: 'object', required: ['agentId', 'questId'] },
    permissions: ['tool.call'],
    run: readQuest,
  })

  ai.registerTool('quest.result', {
    title: 'Read Quest Result',
    description: 'Read a quest and, when completed, return its result message content in one call.',
    schema: { type: 'object', required: ['agentId', 'questId'] },
    permissions: ['tool.call'],
    run: readQuestResult,
  })

  ai.registerTool('message.read', {
    title: 'Read Message',
    description: 'Read one exact message by agent id and message id.',
    schema: { type: 'object', required: ['agentId', 'messageId'] },
    permissions: ['tool.call'],
    run: readMessage,
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
    version: '2.0.0',
    description: 'Create, read, message, stop, delete, and reorganize EF.ai agents within permission boundaries.',
    systemPrompt: 'Use agent.* and quest.* tools to coordinate EF.ai agents. Complete delegated tasks end-to-end when possible. Prefer agent.delegate for create/reuse + send. Delegation is parallel: continue useful local work, then use quest.result for completed inbox event batches.',
    rules: [
      'Agents are identified by id. Names are display labels and may repeat.',
      'Use parentAgentId for parent/child ownership. There are no groups and no path identity.',
      'Use agent.delegate when the user asks an agent to do work; it is the stable one-step delegation workflow.',
      'After agent.delegate or agent.send, do not immediately poll quest.result. Continue useful work or stop; child completions arrive later as inbox notifications.',
      'When processing an inbox event batch, use quest.result for completed events in that batch and do not wait for pending sibling quests.',
      'If you are already running as a child agent, do not create further child agents unless the user explicitly requests deeper delegation.',
    ],
    tools: [
      'agent.read',
      'agent.create',
      'agent.delegate',
      'agent.reparent',
      'agent.delete',
      'agent.send',
      'quest.read',
      'quest.result',
      'message.read',
      'agent.stop',
    ],
  })
})(window.EF = window.EF || {})
