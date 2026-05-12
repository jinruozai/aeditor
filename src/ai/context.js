// aeditor.ai runtime context registries.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  const tools = {}
  const toolMeta = {}
  const skills = {}
  const contextProviders = {}
  const agentTemplates = {}
  const bundles = {}
  const bundleRecords = {}
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
    if (to === 'previewing') return status === 'proposed'
    if (to === 'previewed') return status === 'proposed'
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

  function errorMessage(value, fallback) {
    if (!value) return fallback || 'Tool failed'
    if (typeof value === 'string') return value
    if (value.message) return String(value.message)
    if (value.error) return String(value.error)
    return serialize(value)
  }

  function errorCode(message) {
    const text = String(message || '')
    if (/baseHash mismatch/i.test(text)) return 'BASE_HASH_MISMATCH'
    if (/permission denied/i.test(text)) return 'PERMISSION_DENIED'
    if (/workspace.*not available|workspace.*required|No AI workspace/i.test(text)) return 'WORKSPACE_REQUIRED'
    if (/file not found|path not found/i.test(text)) return 'FILE_NOT_FOUND'
    if (/invalid JSON/i.test(text)) return 'INVALID_JSON'
    if (/invalid JavaScript|syntax error/i.test(text)) return 'INVALID_JAVASCRIPT'
    if (/not found/i.test(text)) return 'NOT_FOUND'
    if (/not allowed|not available/i.test(text)) return 'NOT_ALLOWED'
    return 'TOOL_FAILED'
  }

  function recoverHint(code) {
    if (code === 'BASE_HASH_MISMATCH') return 'Read the current resource again, then retry with the new hash.'
    if (code === 'WORKSPACE_REQUIRED') return 'Ask the user to open or select a workspace before writing files.'
    if (code === 'FILE_NOT_FOUND') return 'Check the path with list/search tools, then retry with an existing path or create the file first.'
    if (code === 'INVALID_JSON') return 'Fix the JSON syntax and retry.'
    if (code === 'INVALID_JAVASCRIPT') return 'Fix the JavaScript syntax and retry.'
    if (code === 'PERMISSION_DENIED') return 'Stop or ask the user for permission instead of trying alternate write paths.'
    return ''
  }

  function failureEnvelope(toolId, phase, value) {
    const message = errorMessage(value, 'Tool failed')
    const code = value && value.code ? String(value.code) : errorCode(message)
    const out = {
      ok: false,
      code: code,
      message: message,
      error: message,
      toolId: toolId || '',
      phase: phase || 'run',
      recoverable: code !== 'PERMISSION_DENIED',
    }
    const hint = value && value.hint ? String(value.hint) : recoverHint(code)
    if (hint) out.hint = hint
    if (value && typeof value === 'object') out.details = value
    return out
  }

  function resultFailed(result) {
    return !!(result && typeof result === 'object' && (result.ok === false || result.status === 'failed'))
  }

  function failToolCall(agentId, callId, found, err, phase) {
    if (aeditor.reportError) aeditor.reportError({ scope: 'ai', tool: found.toolCall.toolId }, err)
    const envelope = failureEnvelope(found.toolCall.toolId, phase || 'run', err)
    const patch = { status: 'failed', error: envelope.message, errorDetails: envelope }
    if (phase === 'preview') patch.preview = envelope
    else if (phase === 'apply') patch.applyResult = envelope
    else patch.result = envelope
    return updateToolCall(agentId, callId, patch)
  }

  function isPromiseLike(value) {
    return value && typeof value.then === 'function'
  }

  function serialize(value) {
    try { return ai.serialize && ai.serialize.stringify ? ai.serialize.stringify(value) : JSON.stringify(value) } catch (_) { return String(value) }
  }

  function applySucceeded(result) {
    if (!result || typeof result !== 'object') return false
    return result.applied === true || result.status === 'applied'
  }

  function applyFailureMessage(result) {
    if (!result || typeof result !== 'object') return 'Tool apply did not report success'
    if (result.error) return String(result.error)
    const validation = result.validation || {}
    const errors = result.errors || validation.errors || []
    if (errors.length) {
      return errors.map(function (item) {
        return item && typeof item === 'object'
          ? ((item.path ? item.path + ': ' : '') + (item.message || serialize(item)))
          : String(item)
      }).join('\n')
    }
    if (result.ok === false) return 'Tool apply returned ok=false'
    return 'Tool apply did not report success'
  }

  function previewFailureMessage(result) {
    if (!result || typeof result !== 'object') return 'Tool preview did not report success'
    if (result.error) return String(result.error)
    const validation = result.validation || {}
    const errors = result.errors || validation.errors || []
    if (errors.length) {
      return errors.map(function (item) {
        return item && typeof item === 'object'
          ? ((item.path ? item.path + ': ' : '') + (item.message || serialize(item)))
          : String(item)
      }).join('\n')
    }
    return 'Tool preview returned ok=false'
  }

  function finishApplyToolCall(agentId, callId, found, result) {
    if (applySucceeded(result)) {
      return updateToolCall(agentId, callId, { status: 'applied', applyResult: result, error: null })
    }
    return updateToolCall(agentId, callId, { status: 'failed', applyResult: result, error: applyFailureMessage(result), errorDetails: failureEnvelope(found.toolCall.toolId, 'apply', result) })
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

  function isToolAlwaysAllowed(agentId, toolId) {
    const agent = ai.findAgent(agentId)
    const map = agent && agent.meta && agent.meta.alwaysAllowTools
    return !!(map && map[toolId])
  }

  function setToolAlwaysAllowed(agentId, toolId, allowed) {
    const agent = ai.findAgent(agentId)
    if (!agent || !toolId) return null
    const meta = Object.assign({}, agent.meta || {})
    const map = Object.assign({}, meta.alwaysAllowTools || {})
    if (allowed) map[toolId] = true
    else delete map[toolId]
    meta.alwaysAllowTools = map
    return ai.updateAgent(agentId, { meta: meta })
  }

  function previewToolCall(agentId, callId, actor) {
    const state = getToolCallActionState(agentId, callId, actor || 'user')
    if (!state || !state.canPreview) return null
    const found = findToolCall(agentId, callId)
    try {
      updateToolCall(agentId, callId, { status: 'previewing' })
      const result = callToolPhase(agentId, callId, actor || state.toolCall.actor || 'user', 'preview')
      if (isPromiseLike(result)) {
        const promise = Promise.resolve(result).then(function (done) {
          if (resultFailed(done)) {
            return updateToolCall(agentId, callId, { status: 'failed', preview: done, error: previewFailureMessage(done), errorDetails: failureEnvelope(found.toolCall.toolId, 'preview', done) })
          }
          return updateToolCall(agentId, callId, { status: 'previewed', preview: done, error: null })
        }, function (err) {
          return failToolCall(agentId, callId, found, err, 'preview')
        })
        return { toolCall: findToolCall(agentId, callId).toolCall, promise: promise }
      }
      if (resultFailed(result)) {
        return updateToolCall(agentId, callId, { status: 'failed', preview: result, error: previewFailureMessage(result), errorDetails: failureEnvelope(found.toolCall.toolId, 'preview', result) })
      }
      return updateToolCall(agentId, callId, { status: 'previewed', preview: result, error: null })
    } catch (err) {
      return failToolCall(agentId, callId, found, err, 'preview')
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
      if (resultFailed(result)) {
        return updateToolCall(agentId, callId, { status: 'failed', result: result, error: errorMessage(result), errorDetails: failureEnvelope(found.toolCall.toolId, 'run', result) })
      }
      return updateToolCall(agentId, callId, { status: 'completed', result: result, error: null })
    }, function (err) {
      return failToolCall(agentId, callId, found, err, 'run')
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
      if (!isPromiseLike(result)) return finishApplyToolCall(agentId, callId, found, result)
      const promise = Promise.resolve(result).then(function (done) {
        return finishApplyToolCall(agentId, callId, found, done)
      }, function (err) {
        return failToolCall(agentId, callId, found, err, 'apply')
      })
      return { toolCall: findToolCall(agentId, callId).toolCall, promise: promise }
    } catch (err) {
      return failToolCall(agentId, callId, found, err, 'apply')
    }
  }

  function normalizeMeta(meta) {
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    return out
  }

  const matchesPrefix = aeditor.names.matchesPrefix

  function registerTool(name, tool, meta) {
    tools[name] = tool
    toolMeta[name] = normalizeMeta(meta)
    return tool
  }

  function getTool(name) {
    return tools[name]
  }

  function isToolVisibleToModel(name, ctx, explicit) {
    const tool = getTool(name)
    if (!tool) return false
    if (ctx && ctx.uiAuthoringBlocked) return false
    if (tool.exposeToModel === false && !explicit) return false
    if (typeof tool.available === 'function' && tool.available(ctx || {}) === false) return false
    return true
  }

  function visibleToolNames(refs, ctx, explicit) {
    const list = refs && refs.length ? refs : keys(tools)
    const out = []
    for (let i = 0; i < list.length; i++) {
      if (isToolVisibleToModel(list[i], ctx, !!explicit)) out.push(list[i])
    }
    return out
  }

  function unregisterTool(name, meta) {
    if (!tools[name]) return false
    const existing = toolMeta[name] || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('ai.tools.unregister: owner mismatch for "' + name + '"')
    delete tools[name]
    delete toolMeta[name]
    return true
  }

  function unregisterToolOwner(owner) {
    const removed = []
    keys(toolMeta).forEach(function (name) {
      if (toolMeta[name].owner === owner) {
        delete tools[name]
        delete toolMeta[name]
        removed.push(name)
      }
    })
    return removed
  }

  function unregisterToolPrefix(prefix) {
    const removed = []
    keys(tools).forEach(function (name) {
      if (matchesPrefix(name, prefix)) {
        delete tools[name]
        delete toolMeta[name]
        removed.push(name)
      }
    })
    return removed
  }

  function registerSkill(name, skill) {
    skills[name] = skill
    return skill
  }

  function getSkill(name) {
    return skills[name]
  }

  function unregisterSkill(name) {
    if (!skills[name]) return false
    delete skills[name]
    return true
  }

  function unregisterSkillPrefix(prefix) {
    const removed = []
    keys(skills).forEach(function (name) {
      if (matchesPrefix(name, prefix)) {
        delete skills[name]
        removed.push(name)
      }
    })
    return removed
  }

  function registerContextProvider(name, provider) {
    contextProviders[name] = provider
    return provider
  }

  function unregisterContextProvider(name) {
    if (!contextProviders[name]) return false
    delete contextProviders[name]
    return true
  }

  function unregisterContextProviderPrefix(prefix) {
    const removed = []
    keys(contextProviders).forEach(function (name) {
      if (matchesPrefix(name, prefix)) {
        delete contextProviders[name]
        removed.push(name)
      }
    })
    return removed
  }

  function getContextProvider(name) {
    return contextProviders[name]
  }

  function registerAgentTemplate(name, template) {
    agentTemplates[name] = template
    return template
  }

  function getAgentTemplate(name) {
    return agentTemplates[name]
  }

  function unregisterAgentTemplate(name) {
    if (!agentTemplates[name]) return false
    delete agentTemplates[name]
    return true
  }

  function unregisterAgentTemplatePrefix(prefix) {
    const removed = []
    keys(agentTemplates).forEach(function (name) {
      if (matchesPrefix(name, prefix)) {
        delete agentTemplates[name]
        removed.push(name)
      }
    })
    return removed
  }

  function registerBundle(name, bundle) {
    if (bundles[name]) unregisterBundle(name)
    bundles[name] = bundle
    bundleRecords[name] = {
      connections: registerBundleList(bundle && bundle.connections, ai.registerConnection),
      skills: registerBundleList(bundle && bundle.skills, registerSkill),
      tools: registerBundleList(bundle && bundle.tools, registerTool),
      contextProviders: registerBundleList(bundle && bundle.contextProviders, registerContextProvider),
      agentTemplates: registerBundleList(bundle && bundle.agentTemplates, registerAgentTemplate),
    }
    if (bundle && typeof bundle.activate === 'function') {
      bundle.activate({ ai: ai })
    }
    return bundle
  }

  function getBundle(name) {
    return bundles[name]
  }

  function unregisterBundle(name) {
    if (!bundles[name]) return false
    unregisterBundleRecord(bundleRecords[name])
    delete bundles[name]
    delete bundleRecords[name]
    return true
  }

  function unregisterBundlePrefix(prefix) {
    const removed = []
    keys(bundles).forEach(function (name) {
      if (matchesPrefix(name, prefix)) {
        unregisterBundle(name)
        removed.push(name)
      }
    })
    return removed
  }

  function registerBundleList(items, register) {
    const names = []
    for (let i = 0; items && i < items.length; i++) {
      const name = items[i].id || items[i].name
      register(name, items[i])
      names.push(name)
    }
    return names
  }

  function unregisterBundleRecord(record) {
    record = record || {}
    unregisterNames(record.connections, ai.unregisterConnection)
    unregisterNames(record.skills, unregisterSkill)
    unregisterNames(record.tools, unregisterTool)
    unregisterNames(record.contextProviders, unregisterContextProvider)
    unregisterNames(record.agentTemplates, unregisterAgentTemplate)
  }

  function unregisterNames(names, unregister) {
    if (!unregister) return
    for (let i = 0; names && i < names.length; i++) unregister(names[i])
  }

  function collectContext(request, ctx) {
    const out = []
    const names = keys(contextProviders)
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const provider = contextProviders[name]
      const matched = !provider.match || provider.match(request.target || request.agent, request.event || null, ctx)
      if (matched) {
        const captured = aeditor.safeCall
          ? aeditor.safeCall({ scope: 'ai', provider: name }, function () {
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

  ai.tools = {
    register: registerTool,
    unregister: unregisterTool,
    unregisterOwner: unregisterToolOwner,
    unregisterPrefix: unregisterToolPrefix,
    get: getTool,
    visible: isToolVisibleToModel,
    visibleList: visibleToolNames,
    list: function (prefix) {
      const names = keys(tools)
      return prefix ? names.filter(function (name) { return matchesPrefix(name, prefix) }) : names
    },
    meta: function (name) { return Object.assign({}, toolMeta[name] || {}) },
  }
  ai.toolMeta = function (name) { return Object.assign({}, toolMeta[name] || {}) }
  ai.createToolCall = createToolCall
  ai.attachToolCalls = attachToolCalls
  ai.findToolCall = findToolCall
  ai.previewToolCall = previewToolCall
  ai.approveToolCall = approveToolCall
  ai.rejectToolCall = rejectToolCall
  ai.runToolCall = runToolCall
  ai.applyToolCall = applyToolCall
  ai.getToolCallActionState = getToolCallActionState
  ai.isToolAlwaysAllowed = isToolAlwaysAllowed
  ai.setToolAlwaysAllowed = setToolAlwaysAllowed
  ai.skills = {
    register: registerSkill,
    unregister: unregisterSkill,
    unregisterPrefix: unregisterSkillPrefix,
    get: getSkill,
    list: function (prefix) {
      const names = keys(skills)
      return prefix ? names.filter(function (name) { return matchesPrefix(name, prefix) }) : names
    },
  }
  ai.context = {
    register: registerContextProvider,
    unregister: unregisterContextProvider,
    unregisterPrefix: unregisterContextProviderPrefix,
    get: getContextProvider,
    list: function (prefix) {
      const names = keys(contextProviders)
      return prefix ? names.filter(function (name) { return matchesPrefix(name, prefix) }) : names
    },
  }
  ai.agentTemplates = {
    register: registerAgentTemplate,
    unregister: unregisterAgentTemplate,
    unregisterPrefix: unregisterAgentTemplatePrefix,
    get: getAgentTemplate,
    list: function (prefix) {
      const names = keys(agentTemplates)
      return prefix ? names.filter(function (name) { return matchesPrefix(name, prefix) }) : names
    },
  }
  ai.bundles = {
    register: registerBundle,
    unregister: unregisterBundle,
    unregisterPrefix: unregisterBundlePrefix,
    get: getBundle,
    list: function (prefix) {
      const names = keys(bundles)
      return prefix ? names.filter(function (name) { return matchesPrefix(name, prefix) }) : names
    },
  }
  ai.createRunContext = createRunContext
})(window.aeditor = window.aeditor || {})
