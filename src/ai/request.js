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
      const id = typeof ref === 'string' ? ref : (ref && (ref.resourceId || ref.id || ref.uri))
      if (!id || seen[id]) return
      seen[id] = true
      refs.push(ref)
    }
    const agentRefs = (agent.contextRefs || []).concat(agent.attachments || [])
    const inputRefs = input ? (input.contextRefs || []).concat(input.attachments || []) : []
    for (let i = 0; i < agentRefs.length; i++) add(agentRefs[i])
    for (let j = 0; j < inputRefs.length; j++) add(inputRefs[j])
    return refs
  }

  function resolveResources(refs, baseCtx) {
    const out = []
    const store = ai.attachments
    const all = store ? store.peek() : []
    for (let i = 0; i < refs.length; i++) {
      const ref = resolveResourceRef(refs[i], all)
      if (ai.references && ai.references.read) {
        out.push(ai.references.read(ref, {}, baseCtx))
        continue
      }
      out.push(ref)
    }
    return out
  }

  function describeResources(refs) {
    const store = ai.attachments
    const all = store ? store.peek() : []
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
        schema: ai.references && ai.references.schema ? ai.references.schema(item) : (item.schema || null),
        capabilities: ai.references && ai.references.capabilities ? ai.references.capabilities(item) : (item.capabilities || []),
      }
    })
  }

  function resolveToolRefs(agent, ctx) {
    const explicit = !!(agent.toolRefs && agent.toolRefs.length)
    const refs = explicit ? agent.toolRefs : ai.tools.list()
    return ai.tools.visibleList ? ai.tools.visibleList(refs, ctx, explicit) : refs
  }

  function resolveTools(agent, ctx, toolRefs) {
    const refs = toolRefs || resolveToolRefs(agent, ctx)
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const tool = ai.tools.get(refs[i])
      out.push({
        id: refs[i],
        title: tool.title || refs[i],
        description: tool.description || '',
        schema: tool.schema || null,
        permissions: tool.permissions || null,
      })
    }
    return out
  }

  function addUnique(list, seen, id) {
    if (!id || seen[id]) return
    seen[id] = true
    list.push(id)
  }

  function effectiveSkillRefs(agent, input, ctx) {
    const refs = []
    const seen = {}
    const explicit = agent.skillRefs || []
    for (let i = 0; i < explicit.length; i++) addUnique(refs, seen, explicit[i])
    if (
      ai.skills &&
      ai.skills.get &&
      ai.skills.get('aeditor.authoring') &&
      (uiAuthoringIntent(input) || (ai.currentWorkspace && ai.currentWorkspace()))
    ) {
      addUnique(refs, seen, 'aeditor.authoring')
    }
    if (ai.skills && ai.skills.list && ai.skills.get) {
      const names = ai.skills.list()
      for (let j = 0; j < names.length; j++) {
        const id = names[j]
        if (id === 'aeditor.authoring' || seen[id]) continue
        const skill = ai.skills.get(id)
        if (skill && typeof skill.auto === 'function' && skill.auto(ctx || {})) addUnique(refs, seen, id)
      }
    }
    return refs
  }

  function resolveSkills(agent, input, ctx) {
    const refs = effectiveSkillRefs(agent, input, ctx)
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const skill = ai.skills.get(refs[i])
      if (skill) out.push(Object.assign({ id: refs[i] }, skill))
    }
    return out
  }

  function compactJson(value, max) {
    let text = ''
    try { text = ai.serialize && ai.serialize.stringify ? ai.serialize.stringify(value) : JSON.stringify(value) } catch (_) { text = String(value) }
    max = max || 1200
    return text.length > max ? text.slice(0, max) + '...' : text
  }

  function compactString(value, max) {
    max = max || 4000
    if (ai.serialize && ai.serialize.compactString) return ai.serialize.compactString(value, max)
    const text = String(value == null ? '' : value)
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

  function compactToolArg(value, key, depth) {
    if (typeof value === 'string') {
      const text = String(value)
      if ((key === 'text' || key === 'content' || key === 'source') && text.length > 1000) {
        return {
          omitted: true,
          originalLength: text.length,
          preview: text.slice(0, 400),
        }
      }
      return compactString(text, 1000)
    }
    if (!value || typeof value !== 'object' || depth <= 0) return compactValue(value, 1000, 1)
    if (Array.isArray(value)) {
      const out = []
      const n = Math.min(value.length, 24)
      for (let i = 0; i < n; i++) out.push(compactToolArg(value[i], '', depth - 1))
      if (value.length > n) out.push('...[+' + (value.length - n) + ' items]')
      return out
    }
    const out = {}
    const keys = Object.keys(value)
    const n = Math.min(keys.length, 32)
    for (let i = 0; i < n; i++) out[keys[i]] = compactToolArg(value[keys[i]], keys[i], depth - 1)
    if (keys.length > n) out.__truncatedKeys = keys.length - n
    return out
  }

  function compactToolCall(call) {
    return {
      id: call.id || call.providerCallId || null,
      toolId: call.toolId || call.name || call.tool || '',
      name: call.name || call.toolId || call.tool || '',
      args: compactToolArg(call.args || {}, '', 3),
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

  function sanitizeAttachmentPayload(payload) {
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
    try { return ai.serialize && ai.serialize.stringify ? ai.serialize.stringify(content) : JSON.stringify(content) } catch (_) { return String(content) }
  }

  function uiAuthoringIntent(input) {
    const text = messageText(input && (input.content != null ? input.content : input.text)).toLowerCase()
    if (!text) return false
    const normalizedAction = /(create|make|build|write|add|modify|change|design|generate|implement|put|mount|\u5199|\u505a|\u521b\u5efa|\u65b0\u5efa|\u8bbe\u8ba1|\u751f\u6210|\u6dfb\u52a0|\u653e\u5230|\u653e\u5728|\u6302\u5230|\u4fee\u6539|\u5b9e\u73b0|\u6784\u5efa)/.test(text)
    const normalizedTarget = /(ui|panel|dock|interface|screen|view|component|\u754c\u9762|\u9762\u677f|\u4e3b\s*dock|\u7ec4\u4ef6|\u89c6\u56fe|\u7a97\u53e3)/.test(text)
    if (normalizedAction && normalizedTarget) return true
    const action = /(create|make|build|write|add|modify|change|design|generate|implement|put|mount|创建|新建|写|设计|生成|添加|放到|放在|挂到|修改|实现)/.test(text)
    const target = /(ui|panel|dock|interface|screen|view|component|界面|面板|主dock|主\s*dock|组件|视图|窗口)/.test(text)
    return action && target
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

  function groupMessages(messages) {
    const groups = []
    let i = 0
    while (i < messages.length) {
      const message = messages[i]
      const group = { index: groups.length, messages: [message] }
      const calls = message.toolCalls || []
      if (calls.length) {
        const sourceId = message.id
        let j = i + 1
        while (j < messages.length) {
          const next = messages[j]
          if (next.role !== 'tool' || !next.meta || next.meta.sourceMessageId !== sourceId) break
          group.messages.push(next)
          j++
        }
        i = j
      } else {
        i++
      }
      groups.push(group)
    }
    return groups
  }

  function groupCost(group) {
    let cost = 0
    for (let i = 0; i < group.messages.length; i++) cost += messageCost(group.messages[i])
    return cost
  }

  function groupHasInput(group, input) {
    if (!input || !input.id) return false
    for (let i = 0; i < group.messages.length; i++) if (group.messages[i].id === input.id) return true
    return false
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
    const groups = groupMessages(messages)
    const includedGroups = {}
    const selected = []
    for (let i = 0; i < groups.length; i++) {
      if (!groupHasInput(groups[i], input)) continue
      includedGroups[i] = true
      selected.push(groups[i])
      remaining -= groupCost(groups[i])
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      if (includedGroups[i]) continue
      const group = groups[i]
      const cost = groupCost(group)
      if (selected.length && remaining - cost < 0) break
      if (!selected.length || remaining - cost >= 0) {
        selected.push(group)
        remaining -= cost
      }
    }
    selected.sort(function (a, b) { return a.index - b.index })
    const out = []
    for (let i = 0; i < selected.length; i++) {
      const group = selected[i]
      for (let j = 0; j < group.messages.length; j++) {
        const message = group.messages[j]
        out.push(compactMessageForRequest(message, input && message.id === input.id))
      }
    }
    return out
  }

  function attachmentContextMessage(attachmentRefs, resolvedAttachments) {
    if (!attachmentRefs.length && !resolvedAttachments.length) return null
    const items = []
    for (let i = 0; i < attachmentRefs.length; i++) {
      const ref = attachmentRefs[i]
      const resolved = resolvedAttachments[i] == null ? null : sanitizeAttachmentPayload(resolvedAttachments[i])
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
      content: 'Attached editor context. Use attachment uri/kind/meta to choose precise tools. Large payloads are summarized; call tools for full data.\n' + compactJson(items, 6000),
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

  function skillLines(agent, input, requestCtx) {
    const specs = resolveSkills(agent, input, requestCtx)
    const lines = []
    for (let i = 0; i < specs.length; i++) {
      const skill = specs[i]
      if (skill.systemPrompt) lines.push(skill.title + ': ' + skill.systemPrompt)
      const rules = skill.rules || []
      for (let j = 0; j < rules.length; j++) lines.push('- ' + rules[j])
    }
    return lines
  }

  function runtimeGuideMessage(agent, requestCtx) {
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
      'Current runtime state in this system message overrides older transcript history. If older messages mention a workspace/tool/capability that is not present now, treat it as unavailable now.',
      'Stop the run with a clear final answer when the requested work is complete and, for edits, verification is done or explicitly unavailable.',
      'Stop and clearly report a blocker when required workspace/project state, permissions, APIs, files, schemas, or user decisions are missing. Do not keep searching for workaround tools.',
      'Stop and ask the user when the next step is ambiguous, destructive, or requires confirmation. Say exactly what decision or input is needed.',
      'Stop after a repeated equivalent tool/schema failure instead of retrying the same action under new guessed names.',
      'Do not guess editor operation names. The generic aeditor.previewOperation/applyOperation bridge is hidden from normal requests; use concrete tools exposed in this request.',
      'Use workspace.fileSummary, code.map, search, and range reads before loading large files.',
      'When verify.* tools are available, run the narrowest relevant check after editing workspace files and use diagnostics to repair failures before claiming completion.',
      'Only ask the user for clarification or confirmation when the requested outcome is ambiguous, destructive, or blocked by permissions/errors.',
      'If you are already a child agent, do not create another child agent unless the user explicitly requests deeper delegation.',
      'CURRENT_AGENT_ID: ' + (agent.id || ''),
      'CURRENT_AGENT_NAME: ' + (agent.name || ''),
      'CURRENT_PARENT_AGENT_ID: ' + (agent.parentAgentId || ''),
    ]
    if (aeditor.ai.workspaceMeta && aeditor.ai.workspaceMeta()) lines.push('CURRENT_AI_WORKSPACE: ' + compactJson(aeditor.ai.workspaceMeta(), 400))
    else lines.push('NO_CURRENT_AI_WORKSPACE: workspace-backed file tools are unavailable until the user opens or selects a workspace.')
    if (requestCtx && requestCtx.uiAuthoringBlocked) {
      lines.push('CURRENT_REQUEST_BLOCKED: The user is asking to create or modify UI/panels/docks, but no workspace project is open. Do not call tools, do not search for workaround operations, and do not try older extension/dock paths. Reply briefly that a workspace project must be opened or selected first.')
    }
    if (agent.systemPrompt) lines.push('AGENT_SYSTEM_PROMPT:\n' + agent.systemPrompt)
    const skills = skillLines(agent, requestCtx && requestCtx.input, requestCtx)
    if (skills.length) lines.push('ACTIVE_SKILLS:\n' + skills.join('\n'))
    return {
      id: 'system-runtime-' + Date.now().toString(36),
      from: 'system',
      role: 'system',
      status: 'done',
      content: lines.join('\n'),
    }
  }

  function requestMessages(agent, input, attachmentRefs, resolvedAttachments, requestCtx) {
    const baseMessages = ai.compaction && ai.compaction.requestMessages ? ai.compaction.requestMessages(agent, input) : (agent.messages || [])
    const messages = baseMessages.filter(function (message) {
      return message.status !== 'queued' || (input && message.id === input.id)
    })
    const context = attachmentContextMessage(attachmentRefs, resolvedAttachments)
    const inbox = inboxContextMessage(agent, input)
    const queued = queuedContextMessage(agent, input)
    const prefix = [runtimeGuideMessage(agent, requestCtx)]
    const compacted = ai.compaction && ai.compaction.contextMessages ? ai.compaction.contextMessages(agent) : []
    for (let i = 0; i < compacted.length; i++) prefix.push(compacted[i])
    if (context) prefix.push(context)
    if (inbox) prefix.push(inbox)
    if (queued) prefix.push(queued)
    return prefix.concat(budgetMessages(agent, prefix, messages, input))
  }

  function makeRequest(agent, input, runId, actor, turn) {
    const who = actor || 'user'
    const baseCtx = {
      ai: ai,
      agent: agent,
      actor: who,
      runId: runId,
      input: input || null,
      workspace: ai.currentWorkspace ? ai.currentWorkspace() : null,
      workspaceMeta: ai.workspaceMeta ? ai.workspaceMeta() : null,
    }
    baseCtx.uiAuthoringIntent = uiAuthoringIntent(input)
    baseCtx.uiAuthoringBlocked = !baseCtx.workspace && uiAuthoringIntent(input)
    const allowedAttachments = ai.canRead(who, agent.id, 'attachments.read')
    const contextRefs = effectiveContextRefs(agent, input)
    const resolvedAttachments = allowedAttachments ? resolveResources(contextRefs, baseCtx) : []
    const attachmentRefs = allowedAttachments ? describeResources(contextRefs) : []
    const tools = resolveToolRefs(agent, baseCtx)
    return {
      runId: runId,
      agent: agent,
      actor: who,
      connectionName: agent.connection || ai.defaultConnection || 'mock',
      connection: agent.connection || ai.defaultConnection || 'mock',
      model: agent.model || '',
      input: input || null,
      messages: requestMessages(agent, input, attachmentRefs, resolvedAttachments, baseCtx),
      contextRefs: contextRefs.slice(),
      attachmentRefs: attachmentRefs,
      attachments: resolvedAttachments,
      resolvedAttachments: resolvedAttachments,
      tools: tools,
      toolSpecs: resolveTools(agent, baseCtx, tools),
      skills: effectiveSkillRefs(agent, input, baseCtx),
      skillSpecs: resolveSkills(agent, input, baseCtx),
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
