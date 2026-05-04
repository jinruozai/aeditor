// EF.ai runtime context registries.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const tools = {}
  const skills = {}
  const contextProviders = {}
  const resourceResolvers = {}
  const agentTemplates = {}
  const plugins = {}
  let nextToolCallId = 1

  function keys(obj) { return Object.keys(obj) }

  function makeToolCall(spec, actor) {
    spec = spec || {}
    return {
      id: spec.id || 'tc_' + Date.now().toString(36) + '_' + nextToolCallId++,
      toolId: spec.toolId || spec.name || spec.tool || '',
      name: spec.name || spec.toolId || spec.tool || '',
      args: spec.args || {},
      status: spec.status || 'proposed',
      actor: actor || spec.actor || 'user',
      messageId: spec.messageId || null,
      preview: spec.preview || null,
      result: spec.result || null,
      applyResult: spec.applyResult || null,
      error: spec.error || null,
      createdAt: spec.createdAt || Date.now(),
      updatedAt: spec.updatedAt || Date.now(),
      meta: spec.meta || {},
    }
  }

  function normalizeToolStatus(status) {
    return status || 'proposed'
  }

  function canTransition(from, to) {
    const status = normalizeToolStatus(from)
    if (to === 'previewed') return status === 'proposed' || status === 'failed'
    if (to === 'approved') return status === 'proposed' || status === 'previewed'
    if (to === 'rejected') return status === 'proposed' || status === 'previewed' || status === 'approved'
    if (to === 'running') return status === 'approved'
    if (to === 'completed') return status === 'running'
    if (to === 'failed') return status === 'previewing' || status === 'running' || status === 'applying'
    if (to === 'applying') return status === 'completed' || status === 'approved' || status === 'previewed'
    if (to === 'applied') return status === 'applying'
    return false
  }

  function updateToolCall(agentId, callId, patch) {
    let out = null
    ai.updateAgent(agentId, {
      messages: ai.findAgent(agentId).messages.map(function (message) {
        const calls = message.toolCalls || []
        let changed = false
        const nextCalls = calls.map(function (call) {
          if (call.id !== callId) return call
          changed = true
          out = Object.assign({}, call, patch || {}, { updatedAt: Date.now() })
          return out
        })
        return changed ? Object.assign({}, message, { toolCalls: nextCalls }) : message
      }),
    })
    return out
  }

  function findToolCall(agentId, callId) {
    const agent = ai.findAgent(agentId)
    const messages = agent.messages
    for (let i = 0; i < messages.length; i++) {
      const calls = messages[i].toolCalls || []
      for (let j = 0; j < calls.length; j++) {
        if (calls[j].id === callId) return { agent: agent, message: messages[i], toolCall: calls[j] }
      }
    }
    return null
  }

  function attachToolCalls(agentId, messageId, calls, actor) {
    let out = []
    ai.updateAgent(agentId, {
      messages: ai.findAgent(agentId).messages.map(function (message) {
        if (message.id !== messageId) return message
        out = (calls || []).map(function (call) {
          return makeToolCall(Object.assign({}, call, { messageId: messageId }), actor)
        })
        return Object.assign({}, message, { toolCalls: (message.toolCalls || []).concat(out) })
      }),
    })
    return out
  }

  function createToolCall(agentId, spec, actor) {
    if (!ai.canUseTool(actor || 'user', agentId, spec.toolId || spec.name || spec.tool, 'call')) return null
    const message = spec.messageId
      ? null
      : ai.appendMessage(agentId, {
        from: actor || 'user',
        role: 'assistant',
        content: '',
        status: 'done',
        toolCalls: [],
      })
    return attachToolCalls(agentId, spec.messageId || message.id, [spec], actor || 'user')[0]
  }

  function createToolContext(found, actor) {
    return {
      ai: ai,
      actor: actor || found.toolCall.actor || 'user',
      agent: found.agent,
      message: found.message,
      toolCall: found.toolCall,
      canRead: function (scope) { return ai.canRead(actor || found.toolCall.actor || 'user', found.agent.id, scope || 'agent.full') },
      canApply: function () { return ai.canUseTool(actor || found.toolCall.actor || 'user', found.agent.id, found.toolCall.toolId, 'apply') },
    }
  }

  function callToolPhase(agentId, callId, actor, phase) {
    const found = findToolCall(agentId, callId)
    const tool = found && getTool(found.toolCall.toolId)
    const fn = tool && tool[phase]
    if (!fn) return null
    const ctx = createToolContext(found, actor)
    const input = phase === 'apply' ? (found.toolCall.result || found.toolCall.preview || found.toolCall.args) : found.toolCall.args
    return fn(input, ctx)
  }

  function failToolCall(agentId, callId, found, err) {
    if (EF.reportError) EF.reportError({ scope: 'ai', tool: found.toolCall.toolId }, err)
    return updateToolCall(agentId, callId, { status: 'failed', error: String(err && err.message ? err.message : err) })
  }

  function getToolCallActionState(agentId, callId, actor) {
    const found = findToolCall(agentId, callId)
    if (!found) return null
    const call = found.toolCall
    const tool = getTool(call.toolId)
    const who = actor || call.actor || 'user'
    const canCall = ai.canUseTool(who, agentId, call.toolId, 'call')
    const canApply = ai.canUseTool(who, agentId, call.toolId, 'apply')
    const status = normalizeToolStatus(call.status)
    return {
      toolCall: call,
      status: status,
      hasPreview: !!(tool && tool.preview),
      hasRun: !!(tool && tool.run),
      hasApply: !!(tool && tool.apply),
      canPreview: !!(tool && tool.preview && canCall && canTransition(status, 'previewed')),
      canApprove: canCall && canTransition(status, 'approved'),
      canReject: canCall && canTransition(status, 'rejected'),
      canRun: !!(tool && tool.run && canCall && canTransition(status, 'running')),
      canApply: !!(tool && tool.apply && canApply && canTransition(status, 'applying')),
      callAllowed: canCall,
      applyAllowed: canApply,
    }
  }

  function previewToolCall(agentId, callId, actor) {
    const state = getToolCallActionState(agentId, callId, actor || 'user')
    if (!state || !state.canPreview) return null
    const found = findToolCall(agentId, callId)
    try {
      const result = callToolPhase(agentId, callId, actor || state.toolCall.actor || 'user', 'preview')
      return updateToolCall(agentId, callId, { status: 'previewed', preview: result, error: null })
    } catch (err) {
      return failToolCall(agentId, callId, found, err)
    }
  }

  function approveToolCall(agentId, callId, actor) {
    const state = getToolCallActionState(agentId, callId, actor || 'user')
    return state && state.canApprove
      ? updateToolCall(agentId, callId, { status: 'approved' })
      : null
  }

  function rejectToolCall(agentId, callId, reason, actor) {
    const state = getToolCallActionState(agentId, callId, actor || 'user')
    return state && state.canReject
      ? updateToolCall(agentId, callId, { status: 'rejected', error: reason || null })
      : null
  }

  function runToolCall(agentId, callId, actor) {
    const found = findToolCall(agentId, callId)
    const state = getToolCallActionState(agentId, callId, actor || (found && found.toolCall.actor) || 'user')
    if (!found || !state || !state.canRun) return null
    updateToolCall(agentId, callId, { status: 'running' })
    const promise = Promise.resolve().then(function () {
      return callToolPhase(agentId, callId, actor || found.toolCall.actor || 'user', 'run')
    }).then(function (result) {
      return updateToolCall(agentId, callId, { status: 'completed', result: result, error: null })
    }, function (err) {
      return failToolCall(agentId, callId, found, err)
    })
    return { toolCall: findToolCall(agentId, callId).toolCall, promise: promise }
  }

  function applyToolCall(agentId, callId, actor) {
    const found = findToolCall(agentId, callId)
    const state = getToolCallActionState(agentId, callId, actor || (found && found.toolCall.actor) || 'user')
    if (!found || !state || !state.canApply) return null
    updateToolCall(agentId, callId, { status: 'applying' })
    try {
      const result = callToolPhase(agentId, callId, actor || found.toolCall.actor || 'user', 'apply')
      return updateToolCall(agentId, callId, { status: 'applied', applyResult: result, error: null })
    } catch (err) {
      return failToolCall(agentId, callId, found, err)
    }
  }

  function registerTool(name, tool) {
    tools[name] = tool
    return tool
  }

  function getTool(name) {
    return tools[name]
  }

  function registerSkill(name, skill) {
    skills[name] = skill
    return skill
  }

  function getSkill(name) {
    return skills[name]
  }

  function registerContextProvider(name, provider) {
    contextProviders[name] = provider
    return provider
  }

  function getContextProvider(name) {
    return contextProviders[name]
  }

  function registerResourceResolver(name, resolver) {
    resourceResolvers[name] = resolver
    return resolver
  }

  function getResourceResolver(name) {
    return resourceResolvers[name]
  }

  function registerAgentTemplate(name, template) {
    agentTemplates[name] = template
    return template
  }

  function getAgentTemplate(name) {
    return agentTemplates[name]
  }

  function registerPlugin(name, plugin) {
    plugins[name] = plugin
    registerPluginList(plugin && plugin.connections, ai.registerConnection)
    registerPluginList(plugin && plugin.skills, registerSkill)
    registerPluginList(plugin && plugin.tools, registerTool)
    registerPluginList(plugin && plugin.contextProviders, registerContextProvider)
    registerPluginList(plugin && plugin.resourceResolvers, registerResourceResolver)
    registerPluginList(plugin && plugin.agentTemplates, registerAgentTemplate)
    if (plugin && typeof plugin.activate === 'function') {
      plugin.activate({ ai: ai })
    }
    return plugin
  }

  function getPlugin(name) {
    return plugins[name]
  }

  function registerPluginList(items, register) {
    for (let i = 0; items && i < items.length; i++) {
      register(items[i].id || items[i].name, items[i])
    }
  }

  function collectContext(request, ctx) {
    const out = []
    const names = keys(contextProviders)
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const provider = contextProviders[name]
      const matched = !provider.match || provider.match(request.target || request.agent, request.event || null, ctx)
      if (matched) {
        const captured = EF.safeCall
          ? EF.safeCall({ scope: 'ai', provider: name }, function () {
            return provider.capture ? provider.capture(request.target || request.agent, request.event || null, ctx) : provider(request, ctx)
          })
          : (provider.capture ? provider.capture(request.target || request.agent, request.event || null, ctx) : provider(request, ctx))
        out.push({ id: name, value: captured })
      }
    }
    return out
  }

  function createRunContext(request, controller) {
    const ctx = {
      ai: ai,
      agent: request.agent,
      actor: request.actor || 'user',
      runId: request.runId,
      signal: controller.signal,
      tools: tools,
      skills: skills,
      resourceResolvers: resourceResolvers,
      context: {},
      canReadPath: function (path) { return ai.canReadPath(request.agent, path) },
      canWritePath: function (path) { return ai.canWritePath(request.agent, path) },
      canRead: function (targetId) { return ai.canRead(request.agent.id, targetId) },
      canSend: function (targetId) { return ai.canSend(request.agent.id, targetId) },
      canManage: function (targetId) { return ai.canManage(request.agent.id, targetId) },
    }
    ctx.context = collectContext(request, ctx)
    return ctx
  }

  ai.registerTool = registerTool
  ai.getTool = getTool
  ai.listTools = function () { return keys(tools) }
  ai.createToolCall = createToolCall
  ai.attachToolCalls = attachToolCalls
  ai.findToolCall = findToolCall
  ai.previewToolCall = previewToolCall
  ai.approveToolCall = approveToolCall
  ai.rejectToolCall = rejectToolCall
  ai.runToolCall = runToolCall
  ai.applyToolCall = applyToolCall
  ai.getToolCallActionState = getToolCallActionState
  ai.registerSkill = registerSkill
  ai.getSkill = getSkill
  ai.listSkills = function () { return keys(skills) }
  ai.registerContextProvider = registerContextProvider
  ai.getContextProvider = getContextProvider
  ai.listContextProviders = function () { return keys(contextProviders) }
  ai.registerResourceResolver = registerResourceResolver
  ai.getResourceResolver = getResourceResolver
  ai.listResourceResolvers = function () { return keys(resourceResolvers) }
  ai.registerAgentTemplate = registerAgentTemplate
  ai.getAgentTemplate = getAgentTemplate
  ai.listAgentTemplates = function () { return keys(agentTemplates) }
  ai.registerPlugin = registerPlugin
  ai.getPlugin = getPlugin
  ai.listPlugins = function () { return keys(plugins) }
  ai.createRunContext = createRunContext
})(window.EF = window.EF || {})
