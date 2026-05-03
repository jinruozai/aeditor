// EF.ai agent runtime.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const runs = {}
  let nextRunId = 1

  function normalizeProviderMessage(result, request) {
    if (typeof result === 'string') return { role: 'assistant', content: result }
    if (result && result.message) return result.message
    return Object.assign({ role: 'assistant', content: '' }, result || {}, {
      provider: request.providerName,
      model: request.agent.model || null,
    })
  }

  function isIterable(value) {
    return value && (typeof value[Symbol.asyncIterator] === 'function' || typeof value[Symbol.iterator] === 'function')
  }

  function toAsyncIterable(value) {
    if (value && typeof value[Symbol.asyncIterator] === 'function') return value
    return (async function* () {
      const iterator = value[Symbol.iterator]()
      let next = iterator.next()
      while (!next.done) {
        yield next.value
        next = iterator.next()
      }
    })()
  }

  function deltaContent(delta) {
    if (delta == null) return ''
    if (typeof delta === 'string') return delta
    if (delta.delta != null) return deltaContent(delta.delta)
    if (delta.text != null) return String(delta.text)
    if (delta.content != null) return String(delta.content)
    if (delta.message && delta.message.content != null) return String(delta.message.content)
    if (delta.choices && delta.choices[0] && delta.choices[0].delta) return deltaContent(delta.choices[0].delta)
    return ''
  }

  function deltaToolCalls(delta) {
    return (delta && (delta.toolCalls || delta.tool_calls)) || []
  }

  function normalizeToolCalls(calls, actor) {
    return (calls || []).map(function (call) {
      return Object.assign({}, call, {
        toolId: call.toolId || call.name || call.tool || '',
        name: call.name || call.toolId || call.tool || '',
        args: call.args || {},
        status: call.status || 'proposed',
        actor: call.actor || actor || 'user',
        createdAt: call.createdAt || Date.now(),
        updatedAt: call.updatedAt || Date.now(),
      })
    })
  }

  function applyDelta(agentId, messageId, state, delta, request) {
    const text = deltaContent(delta)
    const calls = deltaToolCalls(delta)
    if (text) {
      if (!state.firstTokenAt) state.firstTokenAt = Date.now()
      state.content += text
    }
    if (calls.length) state.toolCalls = state.toolCalls.concat(calls)
    if (delta && delta.provider) state.provider = delta.provider
    if (delta && delta.model) state.model = delta.model
    if (delta && delta.usage) state.usage = delta.usage
    return ai.updateMessage(agentId, messageId, {
      content: state.content,
      toolCalls: state.toolCalls,
      provider: state.provider || request.providerName,
      model: state.model || request.agent.model || null,
      status: 'running',
    })
  }

  function finishStreamingMessage(agentId, messageId, state, result, request) {
    const message = normalizeProviderMessage(result || {}, request)
    const content = message.content != null && (message.content !== '' || !state.content) ? message.content : state.content
    const toolCalls = normalizeToolCalls(message.toolCalls || state.toolCalls, request.actor)
    const completedAt = Date.now()
    const usage = message.usage || (result && result.usage) || state.usage || null
    const cost = ai.estimateUsageCost ? ai.estimateUsageCost(request.providerName, message.model || state.model || request.agent.model, usage) : null
    const firstTokenAt = state.firstTokenAt || null
    return ai.updateMessage(agentId, messageId, Object.assign({}, message, {
      content: content,
      toolCalls: toolCalls,
      provider: message.provider || state.provider || request.providerName,
      model: message.model || state.model || request.agent.model || null,
      status: message.status || 'done',
      stats: {
        runId: request.runId,
        startTime: state.startTime,
        firstTokenAt: firstTokenAt,
        completedAt: completedAt,
        durationMs: completedAt - state.startTime,
        ttftMs: firstTokenAt ? firstTokenAt - state.startTime : null,
        generationMs: firstTokenAt ? completedAt - firstTokenAt : completedAt - state.startTime,
        usage: usage,
        cost: cost,
      },
    }))
  }

  function consumeDeltas(agentId, messageId, state, source, request, controller) {
    return (async function () {
      for await (const delta of toAsyncIterable(source)) {
        if (controller.signal.aborted) return null
        applyDelta(agentId, messageId, state, delta, request)
      }
      return null
    })()
  }

  function toolResultContent(value) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  function appendToolResult(agentId, call, result, status) {
    return ai.appendMessage(agentId, {
      from: 'tool:' + call.toolId,
      role: 'tool',
      content: toolResultContent(result),
      status: status || 'done',
      meta: {
        toolCallId: call.id,
        toolId: call.toolId,
      },
    })
  }

  function executeToolCalls(agentId, message, actor) {
    const calls = message.toolCalls || []
    if (!calls.length) return Promise.resolve({ count: 0, waiting: false })
    const jobs = []
    let waiting = false
    for (let i = 0; i < calls.length; i++) {
      jobs.push(executeOneToolCall(agentId, calls[i], actor).then(function (state) {
        if (state && state.waiting) waiting = true
        return state
      }))
    }
    return Promise.all(jobs).then(function () {
      return { count: calls.length, waiting: waiting }
    })
  }

  function executeOneToolCall(agentId, call, actor) {
    const tool = ai.getTool(call.toolId)
    if (!tool) {
      appendToolResult(agentId, call, { error: 'Tool not found: ' + call.toolId }, 'error')
      return Promise.resolve({ waiting: false })
    }
    if (tool.apply && !tool.run) {
      const previewed = ai.previewToolCall(agentId, call.id, actor)
      appendToolResult(agentId, call, previewed && (previewed.preview || previewed.error || previewed), previewed && previewed.status === 'failed' ? 'error' : 'done')
      return Promise.resolve({ waiting: true })
    }
    const approved = ai.approveToolCall(agentId, call.id, actor)
    const run = approved && ai.runToolCall(agentId, call.id, actor)
    if (!run || !run.promise) {
      appendToolResult(agentId, call, { error: 'Tool call was not allowed: ' + call.toolId }, 'error')
      return Promise.resolve({ waiting: false })
    }
    return run.promise.then(function (done) {
      appendToolResult(agentId, call, done && (done.result || done.error || done), done && done.status === 'failed' ? 'error' : 'done')
      return { waiting: false }
    })
  }

  function runChatTurn(agentId, provider, request, ctx, controller, actor) {
    const assistant = ai.appendMessage(agentId, {
      from: 'agent:' + agentId,
      role: 'assistant',
      content: '',
      provider: request.providerName,
      model: request.agent.model || null,
      status: 'running',
      contextRefs: [],
      meta: { runId: request.runId },
    })
    if (runs[agentId]) runs[agentId].messageId = assistant.id
    const state = {
      content: '',
      toolCalls: [],
      provider: request.providerName,
      model: request.agent.model || null,
      startTime: Date.now(),
    }
    return Promise.resolve().then(function () {
      request.stream = request.stream || !!provider.stream
      return provider.stream ? provider.stream(request, ctx) : provider.send(request, ctx)
    }).then(function (result) {
      if (controller.signal.aborted) return null
      if (isIterable(result)) {
        return consumeDeltas(agentId, assistant.id, state, result, request, controller).then(function () {
          if (controller.signal.aborted) return null
          const done = finishStreamingMessage(agentId, assistant.id, state, { content: state.content, toolCalls: state.toolCalls }, request)
          return continueAfterTools(agentId, provider, done, done, request, controller, actor)
        })
      }
      if (result && result.deltas && isIterable(result.deltas)) {
        return consumeDeltas(agentId, assistant.id, state, result.deltas, request, controller).then(function () {
          if (controller.signal.aborted) return null
          const done = finishStreamingMessage(agentId, assistant.id, state, result.message || result, request)
          return continueAfterTools(agentId, provider, done, result, request, controller, actor)
        })
      }
      const done = finishStreamingMessage(agentId, assistant.id, state, result, request)
      return continueAfterTools(agentId, provider, done, result, request, controller, actor)
    }, function (err) {
      if (controller.signal.aborted) return null
      const completedAt = Date.now()
      ai.updateMessage(agentId, assistant.id, {
        status: 'error',
        meta: {
          error: String(err && err.message ? err.message : err),
        },
        stats: {
          runId: request.runId,
          startTime: state.startTime,
          completedAt: completedAt,
          durationMs: completedAt - state.startTime,
        },
      })
      throw err
    })
  }

  function continueAfterTools(agentId, provider, message, result, request, controller, actor) {
    const calls = (result && result.toolCalls) || message.toolCalls || []
    if (!calls.length) return message
    if ((request.turn || 0) >= 8) return message
    return executeToolCalls(agentId, message, actor).then(function (state) {
      if (controller.signal.aborted || !state.count) return message
      const current = ai.findAgent(agentId)
      if (!current || state.waiting) return message
      const nextRequest = makeRequest(current, null, request.runId, actor, (request.turn || 0) + 1)
      const nextCtx = ai.createRunContext(nextRequest, controller)
      return runChatTurn(agentId, provider, nextRequest, nextCtx, controller, actor)
    })
  }

  function resolveResourceRef(ref, all) {
    if (typeof ref === 'string') return all.find(function (item) { return item.id === ref }) || { id: ref }
    return ref
  }

  function resolveResources(agent, baseCtx) {
    const out = []
    const refs = agent.contextRefs || []
    const all = ai.resources ? ai.resources.peek() : []
    for (let i = 0; i < refs.length; i++) {
      const ref = resolveResourceRef(refs[i], all)
      const resolver = ref && ai.getResourceResolver && ai.getResourceResolver(ref.resolver || ref.kind)
      const canResolve = !resolver || !resolver.canResolve || resolver.canResolve(ref, baseCtx)
      if (resolver && resolver.resolve && canResolve) out.push(resolver.resolve(ref, baseCtx))
      else out.push(ref)
    }
    return out
  }

  function describeResources(agent) {
    const refs = agent.contextRefs || []
    const all = ai.resources ? ai.resources.peek() : []
    return refs.map(function (ref) {
      const item = resolveResourceRef(ref, all)
      return {
        id: item.id || null,
        resolver: item.resolver || item.kind || '',
        uri: item.uri || '',
        title: item.title || '',
        kind: item.kind || 'resource',
        summary: item.summary || '',
        meta: item.meta || {},
      }
    })
  }

  function resolveTools(agent) {
    const refs = agent.toolRefs || ai.listTools()
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const tool = ai.getTool(refs[i])
      if (tool) {
        out.push({
          id: refs[i],
          title: tool.title || refs[i],
          description: tool.description || '',
          schema: tool.schema || null,
          permissions: tool.permissions || null,
        })
      }
    }
    return out
  }

  function resolveSkills(agent) {
    const refs = agent.skillRefs || []
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const skill = ai.getSkill(refs[i])
      if (skill) out.push(Object.assign({ id: refs[i] }, skill))
    }
    return out
  }

  function compactJson(value, max) {
    let text = ''
    try { text = JSON.stringify(value) } catch (_) { text = String(value) }
    max = max || 1200
    return text.length > max ? text.slice(0, max) + '...' : text
  }

  function resourceContextMessage(resourceRefs, resolvedResources) {
    if (!resourceRefs.length && !resolvedResources.length) return null
    const items = []
    for (let i = 0; i < resourceRefs.length; i++) {
      const ref = resourceRefs[i]
      items.push({
        id: ref.id || null,
        uri: ref.uri || '',
        kind: ref.kind || ref.resolver || 'resource',
        title: ref.title || '',
        summary: ref.summary || '',
        meta: ref.meta || {},
        payload: resolvedResources[i] == null ? null : compactJson(resolvedResources[i], 1400),
      })
    }
    return {
      id: 'system-context-' + Date.now().toString(36),
      from: 'system',
      role: 'system',
      status: 'done',
      content: 'Attached editor context resources. Use their uri/kind/meta to choose precise tools. Large payloads are summarized; call tools for full data.\n' + compactJson(items, 6000),
    }
  }

  function requestMessages(agent, resourceRefs, resolvedResources) {
    const messages = agent.messages.slice()
    const context = resourceContextMessage(resourceRefs, resolvedResources)
    return context ? [context].concat(messages) : messages
  }

  function goalPolicy(agent) {
    const policy = (agent.state && agent.state.goalPolicy) || {}
    return {
      maxTurns: Math.max(1, Number(policy.maxTurns || 20)),
      maxToolCalls: Math.max(0, Number(policy.maxToolCalls || 50)),
      requireUserApprovalForApply: policy.requireUserApprovalForApply !== false,
      stopWhen: policy.stopWhen || 'self_check_passed',
    }
  }

  function makeRequest(agent, input, runId, actor, turn) {
    const baseCtx = { ai: ai, agent: agent, actor: actor || 'user', runId: runId }
    const allowedResources = ai.canRead(actor || 'user', agent.id, 'resources.read')
    const resolvedResources = allowedResources ? resolveResources(agent, baseCtx) : []
    const resourceRefs = describeResources(agent)
    return {
      runId: runId,
      agent: agent,
      actor: actor || 'user',
      providerName: agent.provider || ai.defaultProvider || 'mock',
      provider: agent.provider || ai.defaultProvider || 'mock',
      model: agent.model || '',
      input: input || null,
      messages: requestMessages(agent, resourceRefs, resolvedResources),
      contextRefs: agent.contextRefs.slice(),
      resourceRefs: resourceRefs,
      resources: resolvedResources,
      resolvedResources: resolvedResources,
      tools: agent.toolRefs ? agent.toolRefs.slice() : ai.listTools(),
      toolSpecs: resolveTools(agent),
      skills: agent.skillRefs ? agent.skillRefs.slice() : [],
      skillSpecs: resolveSkills(agent),
      responseFormat: agent.responseFormat || null,
      stream: !!agent.stream,
      target: agent,
      event: input && input.event ? input.event : null,
      turn: turn || 0,
      goalPolicy: agent.mode === 'goal' ? goalPolicy(agent) : null,
      time: Date.now(),
    }
  }

  function handleToolCalls(agentId, message, result, actor, policy, toolCount) {
    const calls = (result && result.toolCalls) || message.toolCalls || []
    if (!calls.length) return { count: toolCount, waiting: false }
    const attached = message.toolCalls && message.toolCalls.length
      ? message.toolCalls
      : ai.attachToolCalls(agentId, message.id, calls, actor)
    const nextCount = toolCount + attached.length
    return {
      count: nextCount,
      waiting: policy && policy.requireUserApprovalForApply && attached.length > 0,
    }
  }

  function runAgent(agentId, input) {
    const agent = agentId ? ai.findAgent(agentId) : ai.getActiveAgent()
    const provider = ai.getProvider(agent && agent.provider)
    if (!agent || !provider) return null
    const controller = new AbortController()
    const runId = 'run_' + Date.now().toString(36) + '_' + nextRunId++
    const actor = (input && input.actor) || 'user'
    const request = makeRequest(agent, input, runId, actor, 0)
    const ctx = ai.createRunContext(request, controller)
    const key = agent.id

    runs[key] = { controller: controller, provider: provider, runId: runId }
    ai.setAgentStatus(agent.id, 'running')

    const promise = Promise.resolve().then(function () {
      if (agent.mode === 'goal') return runGoalLoop(agent.id, provider, input, controller, runId, actor)
      return runChatTurn(agent.id, provider, request, ctx, controller, actor)
    }).then(function (result) {
      if (controller.signal.aborted) return null
      if (agent.mode === 'goal') {
        delete runs[key]
        ai.setAgentStatus(agent.id, result && result.waiting ? 'waiting' : 'idle')
        return result && result.message
      }
      ai.setAgentStatus(agent.id, 'idle')
      delete runs[key]
      return result
    }, function (err) {
      delete runs[key]
      ai.setAgentStatus(agent.id, controller.signal.aborted ? 'idle' : 'error')
      if (!controller.signal.aborted && EF.reportError) EF.reportError({ scope: 'ai', provider: request.providerName }, err)
      return null
    })

    return { request: request, controller: controller, promise: promise }
  }

  function runGoalLoop(agentId, provider, input, controller, runId, actor) {
    let turn = 0
    let toolCount = 0
    let lastMessage = null
    let waiting = false

    function step() {
      const current = ai.findAgent(agentId)
      const policy = goalPolicy(current)
      if (controller.signal.aborted || turn >= policy.maxTurns || toolCount >= policy.maxToolCalls || waiting) {
        return { message: lastMessage, waiting: waiting }
      }
      const request = makeRequest(current, input, runId, actor, turn)
      const ctx = ai.createRunContext(request, controller)
      turn++
      return Promise.resolve(provider.send(request, ctx)).then(function (result) {
        if (controller.signal.aborted) return { message: null, waiting: false }
        const message = normalizeProviderMessage(result, request)
        lastMessage = ai.appendMessage(agentId, message)
        const toolState = handleToolCalls(agentId, lastMessage, result, actor, policy, toolCount)
        toolCount = toolState.count
        waiting = toolState.waiting
        if (result && (result.done || result.stop)) return { message: lastMessage, waiting: false }
        if (!result || result.continue !== true) return { message: lastMessage, waiting: waiting }
        return step()
      })
    }

    return step()
  }

  function stopAgent(agentId) {
    const agent = agentId ? ai.findAgent(agentId) : ai.getActiveAgent()
    if (!agent) return false
    const run = runs[agent.id]
    if (!run) return false
    run.controller.abort()
    if (run.messageId) ai.updateMessage(agent.id, run.messageId, { status: 'stopped' })
    if (run.provider && run.provider.abort) {
      if (EF.safeCall) EF.safeCall({ scope: 'ai', provider: agent.provider || ai.defaultProvider, runId: run.runId }, function () { run.provider.abort(run.runId) })
      else run.provider.abort(run.runId)
    }
    delete runs[agent.id]
    ai.setAgentStatus(agent.id, 'idle')
    return true
  }

  function sendMessage(agentId, content, from, meta) {
    const agent = agentId ? ai.findAgent(agentId) : ai.getActiveAgent()
    if (!agent) return null
    const spec = content && typeof content === 'object' ? content : { content: content }
    const message = ai.appendMessage(agent.id, {
      from: from || 'user',
      role: 'user',
      content: spec.content,
      provider: agent.provider,
      model: agent.model || null,
      contextRefs: spec.contextRefs || [],
      meta: meta || spec.meta || null,
    })
    const run = runAgent(agent.id, message)
    return Object.assign({ message: message }, run)
  }

  ai.runAgent = runAgent
  ai.stopAgent = stopAgent
  ai.sendMessage = sendMessage
})(window.EF = window.EF || {})
