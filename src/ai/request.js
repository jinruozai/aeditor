// aeditor.ai canonical request builder.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}

  function resolveResourceRef(ref, all) {
    if (typeof ref === 'string') return all.find(function (item) { return item.id === ref }) || { id: ref }
    return ref
  }

  function effectiveContextRefs(agent, input) {
    const refs = []
    const seen = {}
    function add(ref) {
      const id = typeof ref === 'string' ? ref : (ref && (ref.resourceId || ref.id))
      if (!id || seen[id]) return
      seen[id] = true
      refs.push(ref)
    }
    const agentRefs = agent.contextRefs || []
    const inputRefs = input && input.contextRefs || []
    for (let i = 0; i < agentRefs.length; i++) add(agentRefs[i])
    for (let j = 0; j < inputRefs.length; j++) add(inputRefs[j])
    return refs
  }

  function resolveResources(refs, baseCtx) {
    const out = []
    const all = ai.resources ? ai.resources.peek() : []
    for (let i = 0; i < refs.length; i++) {
      const ref = resolveResourceRef(refs[i], all)
      if (ai.readReference) {
        out.push(ai.readReference(ref, {}, baseCtx))
        continue
      }
      const resolver = ref && ai.getResourceResolver && ai.getResourceResolver(ref.resolver || ref.kind)
      const canResolve = !resolver || !resolver.canResolve || resolver.canResolve(ref, baseCtx)
      if (resolver && resolver.resolve && canResolve) out.push(resolver.resolve(ref, baseCtx))
      else out.push(ref)
    }
    return out
  }

  function describeResources(refs) {
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
        schema: ai.referenceSchema ? ai.referenceSchema(item) : (item.schema || null),
        capabilities: ai.referenceCapabilities ? ai.referenceCapabilities(item) : (item.capabilities || []),
      }
    })
  }

  function resolveTools(agent) {
    const refs = agent.toolRefs && agent.toolRefs.length ? agent.toolRefs : ai.listTools()
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

  function compactString(value, max) {
    const text = String(value == null ? '' : value)
    max = max || 4000
    return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text
  }

  function compactValue(value, maxString, depth) {
    if (value == null) return value
    if (typeof value === 'string') return compactString(value, maxString)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (depth <= 0) return compactJson(value, maxString)
    if (Array.isArray(value)) {
      const out = []
      const n = Math.min(value.length, 24)
      for (let i = 0; i < n; i++) out.push(compactValue(value[i], maxString, depth - 1))
      if (value.length > n) out.push('...[+' + (value.length - n) + ' items]')
      return out
    }
    const out = {}
    const keys = Object.keys(value)
    const n = Math.min(keys.length, 32)
    for (let i = 0; i < n; i++) out[keys[i]] = compactValue(value[keys[i]], maxString, depth - 1)
    if (keys.length > n) out.__truncatedKeys = keys.length - n
    return out
  }

  function compactToolCall(call) {
    return {
      id: call.id || call.providerCallId || null,
      toolId: call.toolId || call.name || call.tool || '',
      name: call.name || call.toolId || call.tool || '',
      args: compactValue(call.args || {}, 4000, 3),
      status: call.status || '',
      error: call.error ? compactString(call.error, 1000) : null,
    }
  }

  function sanitizeResourceMeta(meta) {
    const out = Object.assign({}, meta || {})
    if (out.dataUrl) {
      out.hasImageData = true
      delete out.dataUrl
    }
    return out
  }

  function sanitizeResourcePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
    const out = Object.assign({}, payload)
    if (out.dataUrl) {
      out.hasImageData = true
      delete out.dataUrl
    }
    if (out.meta) out.meta = sanitizeResourceMeta(out.meta)
    return out
  }

  function modelContextLimit(agent) {
    const explicit = Number(agent && (agent.contextBudgetTokens || (agent.meta && agent.meta.contextBudgetTokens)))
    if (explicit > 0) return explicit
    const id = String(agent && agent.model || '').toLowerCase()
    if (id.indexOf('gpt-5') >= 0) return 400000
    if (id.indexOf('claude') >= 0) return 200000
    if (id.indexOf('gemini') >= 0) return 1000000
    if (id.indexOf('deepseek') >= 0) return 64000
    return 128000
  }

  function messageText(content) {
    if (ai.messageText) return ai.messageText(content)
    if (content == null) return ''
    if (typeof content === 'string') return content
    try { return JSON.stringify(content) } catch (_) { return String(content) }
  }

  function estimateTokens(text) {
    const s = String(text || '')
    let ascii = 0
    let wide = 0
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) < 128) ascii++
      else wide++
    }
    return Math.ceil(ascii / 4 + wide * 0.8)
  }

  function messageCost(message) {
    const text = (message.role || '') + '\n' + messageText(message.content != null ? message.content : message.text)
    let cost = estimateTokens(text) + 8
    const calls = message.toolCalls || []
    for (let i = 0; i < calls.length; i++) cost += estimateTokens(compactJson(compactToolCall(calls[i]), 6000)) + 16
    return cost
  }

  function compactMessageForRequest(message, isInput) {
    if (isInput) return message
    const out = Object.assign({}, message)
    if (typeof out.content === 'string') out.content = compactString(out.content, out.role === 'tool' ? 6000 : 16000)
    if (typeof out.reasoning_content === 'string') out.reasoning_content = compactString(out.reasoning_content, 2000)
    if (out.toolCalls && out.toolCalls.length) out.toolCalls = out.toolCalls.map(compactToolCall)
    return out
  }

  function budgetMessages(agent, prefix, messages, input) {
    const limit = Math.max(1024, modelContextLimit(agent))
    const reserve = Math.min(4096, Math.floor(limit * 0.15))
    let remaining = Math.max(512, limit - reserve)
    for (let i = 0; i < prefix.length; i++) remaining -= messageCost(prefix[i])
    const out = []
    const included = {}
    if (input && input.id) {
      included[input.id] = true
      remaining -= messageCost(input)
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (included[message.id]) continue
      const cost = messageCost(message)
      if (out.length && remaining - cost < 0) break
      if (!out.length || remaining - cost >= 0) {
        out.push(compactMessageForRequest(message, input && message.id === input.id))
        remaining -= cost
      }
    }
    out.reverse()
    if (input && input.id && !out.some(function (message) { return message.id === input.id })) {
      const index = messages.indexOf(input)
      if (index >= 0) {
        let inserted = false
        for (let i = 0; i < out.length; i++) {
          if (messages.indexOf(out[i]) > index) {
            out.splice(i, 0, compactMessageForRequest(input, true))
            inserted = true
            break
          }
        }
        if (!inserted) out.push(compactMessageForRequest(input, true))
      } else {
        out.push(compactMessageForRequest(input, true))
      }
    }
    return out
  }

  function resourceContextMessage(resourceRefs, resolvedResources) {
    if (!resourceRefs.length && !resolvedResources.length) return null
    const items = []
    for (let i = 0; i < resourceRefs.length; i++) {
      const ref = resourceRefs[i]
      const resolved = resolvedResources[i] == null ? null : sanitizeResourcePayload(resolvedResources[i])
      items.push({
        id: ref.id || null,
        uri: ref.uri || '',
        kind: ref.kind || ref.resolver || 'resource',
        title: ref.title || '',
        summary: ref.summary || '',
        meta: sanitizeResourceMeta(ref.meta || {}),
        payload: resolved == null ? null : compactJson(resolved, 1400),
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

  function eventSummary(event) {
    return {
      type: event.type,
      fromAgentId: event.fromAgentId,
      questId: event.questId,
      resultMessageId: event.resultMessageId,
      summary: event.summary,
    }
  }

  function inboxContextMessage(agent, input) {
    const meta = input && input.meta
    if (meta && meta.runtimeEvent === 'inbox.continuation') {
      const events = meta.events || []
      const pending = meta.pendingQuests || []
      return {
        id: 'system-inbox-' + Date.now().toString(36),
        from: 'system',
        role: 'system',
        status: 'done',
        content: [
          'Current completed agent runtime event batch.',
          'Process every completed/failed event in this batch.',
          'Use quest.result only for quest ids listed in completedEvents unless the user explicitly asks for broader reads.',
          'Do not wait for pendingQuests. They are non-blocking background and will produce later inbox events.',
          'completedEvents:',
          compactJson(events.map(eventSummary), 4000),
          'pendingQuests:',
          compactJson(pending, 2000),
        ].join('\n'),
      }
    }
    return null
  }

  function queuedContextMessage(agent, input) {
    const queue = agent.queue || []
    if (!queue.length) return null
    const items = []
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      if (input && input.id && item.messageId === input.id) continue
      const message = ai.readMessage ? ai.readMessage(agent.id, item.messageId) : null
      if (!message) continue
      items.push({
        messageId: item.messageId,
        priority: item.priority || 0,
        interrupt: !!item.interrupt,
        guidance: item.guidance || null,
        from: message.from || 'user',
        content: messageText(message.content).slice(0, 500),
      })
    }
    if (!items.length) return null
    return {
      id: 'system-queue-' + Date.now().toString(36),
      from: 'system',
      role: 'system',
      status: 'done',
      content: 'Queued user messages are waiting behind the current work. Do not process them as the current request unless they are marked interrupt/guidance; use them only to avoid conflicting work and to decide whether to finish cleanly.\n' + compactJson(items, 4000),
    }
  }

  function skillLines(agent) {
    const specs = resolveSkills(agent)
    const lines = []
    for (let i = 0; i < specs.length; i++) {
      const skill = specs[i]
      if (skill.systemPrompt) lines.push(skill.title + ': ' + skill.systemPrompt)
      const rules = skill.rules || []
      for (let j = 0; j < rules.length; j++) lines.push('- ' + rules[j])
    }
    return lines
  }

  function runtimeGuideMessage(agent) {
    const lines = [
      'You are an AEditor AI agent running inside an editor runtime.',
      'Complete the user request end-to-end in the current turn whenever the available tools make that possible.',
      'Do not stop after a partial setup step. For delegated work, prefer agent.delegate because it creates/reuses an agent and sends the task in one workflow.',
      'If you use agent.create separately for a delegated task, immediately send that agent the task with agent.send unless the user only asked to create the agent.',
      'agent.send and agent.delegate return a questId. Use quest.result with agentId + questId to read that exact delegated result. Use quest.read only when you only need status.',
      'Do not poll quest.result immediately after agent.delegate or agent.send. If a delegated quest is still running, continue other useful work when possible; otherwise stop and wait for a later inbox notification.',
      'Completion events are notifications, not interrupts. If child work completes while you are running, the runtime will queue it for a later scheduler checkpoint.',
      'When processing an inbox continuation, handle the completed event batch available now. Do not wait for sibling quests that are still pending.',
      'A response that contains agent.delegate or agent.send is an action turn. Do not put final user-visible answer content in that same message; continue in the runtime follow-up continuation.',
      'If new user messages are queued while you are running, finish the current request cleanly unless the queued message is explicitly interrupting or marked as guidance.',
      'After applying an editor operation that creates or changes visible UI, verify the returned result and any available host/panel health reference before claiming the UI is done.',
      'For AEditor UI panels, prefer aeditor.ui.* components over hand-built controls when the library has a suitable component.',
      'For scrollable panel content, use aeditor.ui.scrollArea instead of native overflow scrollbars so styling matches the framework.',
      'For hover tips or anchored floating UI, prefer aeditor.ui.tooltip/popover/menu; scoped aeditor.ui overlays close automatically when the panel is no longer active. If you manually append floating DOM outside the panel root, register it with aeditor.ui.registerScopedOverlay(anchor, close).',
      'Generated panels live inside resizable docks: make the root height:100%, minHeight:0, boxSizing:border-box, avoid viewport-sized or fixed-width layouts, and use flex/grid with minmax()/auto-fit where possible.',
      'When an AI workspace is set, use workspace.* tools to inspect and edit files. Those tools are bounded to the current AI workspace shared by all agents.',
      'Only ask the user for clarification or confirmation when the requested outcome is ambiguous, destructive, or blocked by permissions/errors.',
      'If you are already a child agent, do not create another child agent unless the user explicitly requests deeper delegation.',
      'CURRENT_AGENT_ID: ' + (agent.id || ''),
      'CURRENT_AGENT_NAME: ' + (agent.name || ''),
      'CURRENT_PARENT_AGENT_ID: ' + (agent.parentAgentId || ''),
    ]
    if (aeditor.ai.workspaceMeta && aeditor.ai.workspaceMeta()) lines.push('CURRENT_AI_WORKSPACE: ' + compactJson(aeditor.ai.workspaceMeta(), 400))
    if (agent.systemPrompt) lines.push('AGENT_SYSTEM_PROMPT:\n' + agent.systemPrompt)
    const skills = skillLines(agent)
    if (skills.length) lines.push('ACTIVE_SKILLS:\n' + skills.join('\n'))
    return {
      id: 'system-runtime-' + Date.now().toString(36),
      from: 'system',
      role: 'system',
      status: 'done',
      content: lines.join('\n'),
    }
  }

  function requestMessages(agent, input, resourceRefs, resolvedResources) {
    const messages = (agent.messages || []).filter(function (message) {
      return message.status !== 'queued' || (input && message.id === input.id)
    })
    const context = resourceContextMessage(resourceRefs, resolvedResources)
    const inbox = inboxContextMessage(agent, input)
    const queued = queuedContextMessage(agent, input)
    const prefix = [runtimeGuideMessage(agent)]
    if (context) prefix.push(context)
    if (inbox) prefix.push(inbox)
    if (queued) prefix.push(queued)
    return prefix.concat(budgetMessages(agent, prefix, messages, input))
  }

  function makeRequest(agent, input, runId, actor, turn) {
    const who = actor || 'user'
    const baseCtx = { ai: ai, agent: agent, actor: who, runId: runId }
    const allowedResources = ai.canRead(who, agent.id, 'resources.read')
    const contextRefs = effectiveContextRefs(agent, input)
    const resolvedResources = allowedResources ? resolveResources(contextRefs, baseCtx) : []
    const resourceRefs = allowedResources ? describeResources(contextRefs) : []
    return {
      runId: runId,
      agent: agent,
      actor: who,
      connectionName: agent.connection || ai.defaultConnection || 'mock',
      connection: agent.connection || ai.defaultConnection || 'mock',
      model: agent.model || '',
      input: input || null,
      messages: requestMessages(agent, input, resourceRefs, resolvedResources),
      contextRefs: contextRefs.slice(),
      resourceRefs: resourceRefs,
      resources: resolvedResources,
      resolvedResources: resolvedResources,
      tools: agent.toolRefs && agent.toolRefs.length ? agent.toolRefs.slice() : ai.listTools(),
      toolSpecs: resolveTools(agent),
      skills: agent.skillRefs ? agent.skillRefs.slice() : [],
      skillSpecs: resolveSkills(agent),
      responseFormat: agent.responseFormat || null,
      stream: !!agent.stream,
      target: agent,
      event: input && input.event ? input.event : null,
      turn: turn || 0,
      time: Date.now(),
    }
  }

  ai.makeRequest = makeRequest
})(window.aeditor = window.aeditor || {})
