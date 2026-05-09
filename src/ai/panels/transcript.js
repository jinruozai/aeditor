;(function (EF) {
  'use strict'

  const ui = EF.ui

  function read(v) {
    return ui.isSignal(v) ? v() : v
  }

  function readList(v) {
    return read(v) || []
  }

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function activeAgent() {
    const id = read(EF.ai.activeAgentId)
    const list = readList(EF.ai.agents)
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
    return null
  }

  function messagesOf(agent) {
    return agent ? (agent.messages || agent.transcript || agent.history || []).filter(function (msg) {
      return (msg.role || msg.type) !== 'tool' && !isHiddenRuntimeMessage(msg)
    }) : []
  }

  function isHiddenRuntimeMessage(msg) {
    const event = msg && msg.meta && msg.meta.runtimeEvent
    return event === 'post-delegation.continuation'
  }

  function roleLabel(msg) {
    if (msg.empty) return msg.title
    if (msg.from && msg.from !== 'user') return msg.from
    return msg.role || msg.type || 'message'
  }

  function statusOf(msg) {
    return msg.status || (msg.meta && msg.meta.status) || 'done'
  }

  function formatTime(time) {
    if (!time) return ''
    const date = new Date(time)
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return h + ':' + m
  }

  function displayText(v) {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && v.type === 'rich-prompt') {
      return v.renderedText || (EF.ai.richPrompt && EF.ai.richPrompt.toModelText ? EF.ai.richPrompt.toModelText(v) : '')
    }
    return JSON.stringify(v, null, 2)
  }

  function messageText(msg) {
    return displayText(msg.content != null ? msg.content : msg.text)
  }

  function usageOf(msg) {
    return msg.usage || (msg.stats && msg.stats.usage) || (msg.meta && msg.meta.usage) || null
  }

  function usageNumber(usage, keys) {
    if (!usage) return 0
    for (let i = 0; i < keys.length; i++) {
      const v = Number(usage[keys[i]])
      if (v > 0) return v
    }
    return 0
  }

  function durationMs(msg) {
    const meta = msg.stats || msg.meta || {}
    if (meta.durationMs > 0) return meta.durationMs
    if (meta.startTime && (meta.completedAt || msg.time)) return (meta.completedAt || msg.time) - meta.startTime
    return 0
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return ''
    if (ms < 1000) return String(Math.max(1, Math.round(ms))) + ' ms'
    if (ms < 10000) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + ' s'
    return String(Math.round(ms / 1000)) + ' s'
  }

  function metricText(msg) {
    const parts = []
    const ms = durationMs(msg)
    if (ms) parts.push(formatDuration(ms))
    const stats = msg.stats || msg.meta || {}
    if (stats.ttftMs > 0) parts.push('TTFT ' + formatDuration(stats.ttftMs))
    const usage = usageOf(msg)
    const out = usageNumber(usage, ['output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens'])
    const total = usageNumber(usage, ['total_tokens', 'totalTokens'])
    if (total) parts.push(String(total) + ' tok')
    else if (out) parts.push(String(out) + ' out')
    const speedMs = (stats.generationMs > 0 ? stats.generationMs : ms)
    if (out && speedMs) parts.push((out / Math.max(speedMs / 1000, 0.001)).toFixed(1).replace(/\.0$/, '') + ' tok/s')
    const cost = msg.stats && msg.stats.cost
    if (cost && cost.amount > 0) parts.push(formatCost(cost))
    return parts.join(' · ')
  }

  function runIdOf(msg) {
    return (msg.meta && msg.meta.runId) || (msg.stats && msg.stats.runId) || ''
  }

  function isAssistantMessage(msg) {
    return (msg.role || msg.type) === 'assistant'
  }

  function runFooterInfo(messages) {
    const groups = {}
    const out = {}
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const runId = runIdOf(msg)
      if (!runId || !isAssistantMessage(msg)) continue
      if (!groups[runId]) {
        groups[runId] = {
          lastId: null,
          content: [],
          toolCalls: 0,
          duration: 0,
          totalTokens: 0,
          outputTokens: 0,
          cost: 0,
          complete: false,
        }
      }
      const group = groups[runId]
      group.lastId = msg.id
      const text = messageText(msg).trim()
      if (text) group.content.push(text)
      group.toolCalls += toolCallsOf(msg).length
      group.duration += durationMs(msg)
      const usage = usageOf(msg)
      group.totalTokens += usageNumber(usage, ['total_tokens', 'totalTokens'])
      group.outputTokens += usageNumber(usage, ['output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens'])
      const cost = msg.stats && msg.stats.cost
      if (cost && cost.amount > 0) group.cost += Number(cost.amount || 0)
      group.complete = statusOf(msg) !== 'running' && statusOf(msg) !== 'queued'
    }
    Object.keys(groups).forEach(function (runId) {
      const group = groups[runId]
      out[group.lastId] = group
    })
    return out
  }

  function runMetricText(info, fallback) {
    if (!info) return fallback || ''
    const parts = []
    if (info.duration) parts.push(formatDuration(info.duration))
    if (info.totalTokens) parts.push(String(info.totalTokens) + ' tok')
    else if (info.outputTokens) parts.push(String(info.outputTokens) + ' out')
    if (info.outputTokens && info.duration) {
      parts.push((info.outputTokens / Math.max(info.duration / 1000, 0.001)).toFixed(1).replace(/\.0$/, '') + ' tok/s')
    }
    if (info.cost > 0) parts.push(formatCost({ amount: info.cost }))
    return parts.join(' · ') || fallback || ''
  }

  function formatCost(cost) {
    const n = Number(cost.amount || 0)
    if (!n) return ''
    const digits = n < 0.0001 ? 6 : (n < 0.01 ? 5 : 4)
    return '$' + n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')
  }

  function appendTextParts(parent, text) {
    const source = String(text == null ? '' : text)
    const parts = source.split(/```/g)
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i]
      if (!chunk) continue
      if (i % 2) {
        const pre = ui.h('pre', 'ef-ai-message-code ef-ui-scrollarea')
        pre.textContent = chunk.replace(/^\w+\n/, '')
        parent.appendChild(pre)
      } else {
        const lines = chunk.split(/\n{2,}/g)
        for (let j = 0; j < lines.length; j++) {
          const line = lines[j].trim()
          if (!line) continue
          const p = ui.h('p', 'ef-ai-message-text')
          p.textContent = line
          parent.appendChild(p)
        }
      }
    }
    if (!parent.firstChild) parent.appendChild(ui.h('p', 'ef-ai-message-text', { text: '' }))
  }

  function appendChips(parent, className, items) {
    if (!items || !items.length) return
    const wrap = ui.h('div', className)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const label = typeof item === 'string'
        ? item
        : (item.title || item.label || item.name || item.uri || item.id || item.resourceId || 'context')
      const kind = typeof item === 'string' ? 'ref' : (item.kind || item.resolver || 'ref')
      const chip = ui.h('span', 'ef-ai-message-chip')
      chip.appendChild(ui.h('span', 'ef-ai-message-chip-kind', { text: kind }))
      chip.appendChild(ui.h('span', 'ef-ai-message-chip-title', { text: label }))
      wrap.appendChild(chip)
    }
    parent.appendChild(wrap)
  }

  function toolCallsOf(msg) {
    return msg.toolCalls || (msg.meta && msg.meta.toolCalls) || []
  }

  function toolName(call) {
    return call.name || call.toolId || call.tool || call.id || 'tool'
  }

  function toolStatus(call) {
    return call.status || call.state || 'proposed'
  }

  function isAgentSendCall(call) {
    return (call.toolId || call.name || call.tool) === 'agent.send'
  }

  function isQuestProducingCall(call) {
    const id = call.toolId || call.name || call.tool
    return id === 'agent.send' || id === 'agent.delegate'
  }

  function questActivity(call) {
    const result = call.result || call.applyResult || {}
    if (!result || !result.questId || !result.agentId) return null
    const quest = EF.ai.quest && EF.ai.quest.read ? EF.ai.quest.read(result.agentId, result.questId, 'user') : null
    return {
      agentId: result.agentId,
      questId: result.questId,
      status: (quest && quest.status) || result.status || toolStatus(call),
      resultId: quest && quest.resultId,
      summary: (quest && quest.summary) || '',
      completedAt: quest && quest.completedAt,
      createdAt: quest && quest.createdAt,
    }
  }

  function renderQuestActivity(call) {
    const quest = questActivity(call)
    if (!quest) return null
    const row = ui.h('div', 'ef-ai-quest-activity ef-ai-quest-' + quest.status)
    row.appendChild(ui.h('span', 'ef-ai-quest-agent', { text: quest.agentId }))
    row.appendChild(ui.h('span', 'ef-ai-quest-status', { text: quest.status }))
    row.appendChild(ui.h('span', 'ef-ai-quest-id', { text: quest.questId }))
    if (quest.completedAt && quest.createdAt) row.appendChild(ui.h('span', 'ef-ai-quest-time', { text: formatDuration(quest.completedAt - quest.createdAt) }))
    if (quest.resultId) {
      row.appendChild(ui.button({
        text: 'View result',
        size: 'sm',
        onClick: function () {
          const message = EF.ai.message && EF.ai.message.read ? EF.ai.message.read(quest.agentId, quest.resultId, 'user') : null
          ui.alert({
            title: 'Quest Result',
            message: message ? displayText(message.content) : 'Result message is not readable.',
          })
        },
      }))
    }
    return row
  }

  function runtimeEventsOf(msg) {
    return msg && msg.meta && msg.meta.runtimeEvent === 'inbox.continuation'
      ? (msg.meta.events || [])
      : []
  }

  function questKey(agentId, questId) {
    return String(agentId || '') + '::' + String(questId || '')
  }

  function visibleQuestKeys(messages) {
    const keys = {}
    for (let i = 0; i < messages.length; i++) {
      if (runtimeEventsOf(messages[i]).length) continue
      const calls = toolCallsOf(messages[i])
      for (let j = 0; j < calls.length; j++) {
        if (!isQuestProducingCall(calls[j])) continue
        const result = calls[j].result || calls[j].applyResult || {}
        if (result.agentId && result.questId) keys[questKey(result.agentId, result.questId)] = true
      }
    }
    return keys
  }

  function withRuntimeEvents(msg, events) {
    const meta = Object.assign({}, msg.meta || {}, { events: events })
    return Object.assign({}, msg, { meta: meta })
  }

  function agentLabel(agentId) {
    const list = readList(EF.ai.agents)
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === agentId) return list[i].name || list[i].path || list[i].id
    }
    return agentId || 'runtime'
  }

  function eventState(event) {
    const type = String(event && event.type || '')
    if (type.indexOf('failed') >= 0 || type.indexOf('error') >= 0) return 'failed'
    if (type.indexOf('stopped') >= 0 || type.indexOf('cancel') >= 0) return 'stopped'
    if (type.indexOf('completed') >= 0 || type.indexOf('done') >= 0) return 'completed'
    return 'pending'
  }

  function projectedMessages(messages) {
    const out = []
    const seenQuest = visibleQuestKeys(messages)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const events = runtimeEventsOf(msg)
      const visibleEvents = events.filter(function (event) {
        return !seenQuest[questKey(event.fromAgentId, event.questId)]
      })
      if (events.length && !visibleEvents.length) continue
      const nextMsg = events.length ? withRuntimeEvents(msg, visibleEvents) : msg
      const isEvent = visibleEvents.length > 0
      const prev = out[out.length - 1]
      if (isEvent && prev && (prev.role || prev.type) === 'assistant') {
        out[out.length - 1] = nextMsg
        out.push(prev)
      } else {
        out.push(nextMsg)
      }
    }
    return out
  }

  function renderRuntimeEvent(agent, msg) {
    const row = ui.h('div', 'ef-ai-message-row ef-ai-message-row-runtime ef-ai-message-row-status-' + statusOf(msg))
    const stack = ui.h('div', 'ef-ai-message-stack')
    const events = runtimeEventsOf(msg)
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      const card = ui.h('div', 'ef-ai-runtime-event ef-ai-runtime-event-' + eventState(event))
      card.appendChild(ui.h('span', 'ef-ai-runtime-event-label', { text: 'event:' }))
      card.appendChild(ui.h('span', 'ef-ai-runtime-event-agent', { text: agentLabel(event.fromAgentId) }))
      card.appendChild(ui.h('span', 'ef-ai-runtime-event-summary', { text: event.summary || event.type || 'Runtime event' }))
      const btn = ui.h('button', 'ef-ai-runtime-event-action', { text: 'View' })
      btn.type = 'button'
      btn.addEventListener('click', function () {
        const message = event.resultMessageId && EF.ai.message && EF.ai.message.read
          ? EF.ai.message.read(event.fromAgentId, event.resultMessageId, 'user')
          : null
        ui.alert({
          title: 'Agent Event',
          message: 'Event\n' + displayText(event) + (message ? '\n\nResult\n' + displayText(message.content) : ''),
        })
      })
      card.appendChild(btn)
      stack.appendChild(card)
    }
    row.appendChild(stack)
    return row
  }

  function appendToolBlock(parent, title, value, className, opts) {
    if (value == null) return
    opts = opts || {}
    if ((title === 'Preview' || title === 'Applied' || title === 'Result') && !isChangeSet(value)) return
    const block = ui.h('div', 'ef-ai-tool-call-block ' + className)
    if (isChangeSet(value)) {
      block.appendChild(ui.changeReview({
        changeSet: value,
        allowApply: !!(opts.state && opts.state.canApply),
        allowReject: !!(opts.state && opts.state.canReject),
        onApply: function () { return afterToolAction(opts.agentId, EF.ai.applyToolCall(opts.agentId, opts.call.id, 'user')) },
        onReject: function () {
          const rejected = EF.ai.rejectToolCall(opts.agentId, opts.call.id, 'Rejected by user', 'user')
          if (EF.ai.resumeAgent) EF.ai.resumeAgent(opts.agentId, 'user')
          return rejected
        },
      }))
      parent.appendChild(block)
      return
    }
    const pre = ui.h('pre', 'ef-ai-tool-call-code ef-ui-scrollarea')
    pre.textContent = displayText(value)
    block.appendChild(pre)
    parent.appendChild(block)
  }

  function isChangeSet(value) {
    return !!(EF.changeSet && EF.changeSet.isChangeSet && EF.changeSet.isChangeSet(value))
  }

  function appendToolButton(parent, text, enabled, fn, kind) {
    if (!enabled) return
    parent.appendChild(ui.button({
      text: text,
      size: 'sm',
      kind: kind || 'default',
      disabled: !enabled,
      onClick: fn,
    }))
  }

  function applyToolCallSmart(agentId, call) {
    let state = EF.ai.getToolCallActionState ? EF.ai.getToolCallActionState(agentId, call.id, 'user') : null
    if (!state) return null
    if (state.canApply) return afterToolAction(agentId, EF.ai.applyToolCall(agentId, call.id, 'user'))
    if (state.canPreview) {
      EF.ai.previewToolCall(agentId, call.id, 'user')
      state = EF.ai.getToolCallActionState(agentId, call.id, 'user')
      if (state && state.canApply) return afterToolAction(agentId, EF.ai.applyToolCall(agentId, call.id, 'user'))
      return null
    }
    if (state.canApprove) {
      EF.ai.approveToolCall(agentId, call.id, 'user')
      state = EF.ai.getToolCallActionState(agentId, call.id, 'user')
    }
    return state && state.canRun ? afterToolAction(agentId, EF.ai.runToolCall(agentId, call.id, 'user')) : null
  }

  function afterToolAction(agentId, action) {
    if (!action) return action
    if (action.promise) {
      action.promise.then(function () {
        if (EF.ai.resumeAgent) EF.ai.resumeAgent(agentId, 'user')
      })
      return action
    }
    if (EF.ai.resumeAgent) EF.ai.resumeAgent(agentId, 'user')
    return action
  }

  function renderToolActions(card, agentId, call) {
    const state = EF.ai.getToolCallActionState
      ? EF.ai.getToolCallActionState(agentId, call.id, 'user')
      : null
    const actions = ui.h('div', 'ef-ai-tool-call-actions')
    if (state && (state.canPreview || state.canApply || state.canApprove || state.canRun || state.canReject)) {
      actions.appendChild(ui['switch']({
        value: !!(EF.ai.isToolAlwaysAllowed && EF.ai.isToolAlwaysAllowed(agentId, call.toolId)),
        label: 'Always',
        onChange: function (value) {
          if (EF.ai.setToolAlwaysAllowed) EF.ai.setToolAlwaysAllowed(agentId, call.toolId, value)
        },
      }))
    }
    appendToolButton(actions, 'Reject', state && state.canReject, function () {
      EF.ai.rejectToolCall(agentId, call.id, 'Rejected by user', 'user')
      if (EF.ai.resumeAgent) EF.ai.resumeAgent(agentId, 'user')
    }, 'danger')
    appendToolButton(actions, 'Apply', state && (state.canApply || state.canPreview || state.canApprove || state.canRun), function () {
      applyToolCallSmart(agentId, call)
    }, 'primary')
    if (actions.firstChild) card.appendChild(actions)

    if (state && (!state.callAllowed || (state.hasApply && !state.applyAllowed))) {
      card.appendChild(ui.h('div', 'ef-ai-tool-call-permission', {
        text: !state.callAllowed
          ? 'Tool call permission is not granted for this agent.'
          : 'Tool apply permission is not granted for this agent.',
      }))
    }
  }

  function renderToolCall(agentId, call) {
    const status = toolStatus(call)
    const card = ui.h('details', 'ef-ai-tool-call ef-ai-tool-call-' + status)
    const head = ui.h('summary', 'ef-ai-tool-call-head')
    const right = ui.h('div', 'ef-ai-tool-call-head-right')
    right.addEventListener('click', function (ev) { ev.stopPropagation() })
    head.appendChild(ui.h('span', 'ef-ai-tool-call-name', { text: toolName(call) }))
    if (status !== 'previewed') right.appendChild(ui.h('span', 'ef-ai-tool-call-status', { text: status }))
    const args = call.args && Object.keys(call.args).length ? compactArgs(call.args) : ''
    if (args) head.appendChild(ui.h('span', 'ef-ai-tool-call-summary', { text: args }))

    const state = EF.ai.getToolCallActionState
      ? EF.ai.getToolCallActionState(agentId, call.id, 'user')
      : null
    renderToolActions(right, agentId, call)
    head.appendChild(right)
    card.appendChild(head)
    if (call.description || call.title) {
      card.appendChild(ui.h('div', 'ef-ai-tool-call-desc', { text: call.description || call.title }))
    }
    const opts = { agentId: agentId, call: call, state: state }
    appendToolBlock(card, 'Args', call.args, 'ef-ai-tool-call-args', opts)
    if (isQuestProducingCall(call)) {
      const quest = renderQuestActivity(call)
      if (quest) card.appendChild(quest)
    }
    appendToolBlock(card, 'Preview', call.preview, 'ef-ai-tool-call-preview', opts)
    appendToolBlock(card, 'Result', call.result, 'ef-ai-tool-call-result', opts)
    appendToolBlock(card, 'Applied', call.applyResult, 'ef-ai-tool-call-apply-result', opts)
    appendToolBlock(card, 'Error', call.error, 'ef-ai-tool-call-error', opts)
    return card
  }

  function compactArgs(args) {
    const keys = Object.keys(args || {})
    if (!keys.length) return ''
    const shown = keys.slice(0, 3).map(function (key) {
      const value = args[key]
      if (value == null) return key + ': null'
      if (typeof value === 'string') return key + ': ' + (value.length > 28 ? value.slice(0, 25) + '...' : value)
      if (typeof value === 'number' || typeof value === 'boolean') return key + ': ' + String(value)
      return key + ': ' + (Array.isArray(value) ? '[' + value.length + ']' : '{...}')
    })
    if (keys.length > shown.length) shown.push('+' + String(keys.length - shown.length))
    return shown.join(' · ')
  }

  function renderToolCalls(parent, agentId, calls) {
    if (!calls || !calls.length) return
    const wrap = ui.h('div', 'ef-ai-tool-calls')
    for (let i = 0; i < calls.length; i++) wrap.appendChild(renderToolCall(agentId, calls[i]))
    parent.appendChild(wrap)
  }

  function renderPayload(msg) {
    const content = msg.content != null ? msg.content : msg.text
    if (content && typeof content === 'object' && content.type !== 'rich-prompt') {
      const pre = ui.h('pre', 'ef-ai-message-code ef-ui-scrollarea')
      pre.textContent = JSON.stringify(content, null, 2)
      return pre
    }
    const wrap = ui.h('div', 'ef-ai-message-content')
    appendTextParts(wrap, displayText(content))
    return wrap
  }

  function renderEmpty(item) {
    const row = ui.h('div', 'ef-ai-empty-state')
    row.appendChild(ui.h('div', 'ef-ai-empty-title', { text: item.title }))
    row.appendChild(ui.h('div', 'ef-ai-empty-body', { text: item.content }))
    return row
  }

  function renderMessage(agent, msg, runFooters) {
    if (msg.empty) return renderEmpty(msg)
    if (runtimeEventsOf(msg).length) return renderRuntimeEvent(agent, msg)

    const role = msg.role || msg.type || 'message'
    const status = statusOf(msg)
    const row = ui.h('div', 'ef-ai-message-row ef-ai-message-row-' + role + ' ef-ai-message-row-status-' + status)
    const stack = ui.h('div', 'ef-ai-message-stack')
    const card = ui.h('div', 'ef-ai-message')

    const body = ui.h('div', 'ef-ai-message-body')
    body.appendChild(renderPayload(msg))
    if (status === 'error' && msg.meta && msg.meta.error) {
      body.appendChild(ui.h('div', 'ef-ai-message-error', { text: msg.meta.error }))
    }
    renderToolCalls(body, agent.id, toolCallsOf(msg))
    card.appendChild(body)
    appendChips(card, 'ef-ai-message-contexts', msg.contextRefs)
    appendChips(card, 'ef-ai-message-attachments', msg.attachments || (msg.meta && msg.meta.attachments))
    stack.appendChild(card)

    const runId = runIdOf(msg)
    const runFooter = runId && runFooters ? runFooters[msg.id] : null
    if (runId && isAssistantMessage(msg) && !runFooter) {
      row.appendChild(stack)
      return row
    }
    if (runFooter && !runFooter.complete) {
      row.appendChild(stack)
      return row
    }

    const copyText = runFooter && runFooter.content.length ? runFooter.content.join('\n\n') : messageText(msg)
    const footer = ui.h('div', 'ef-ai-message-footer')
    footer.appendChild(ui.copyButton({ text: copyText, title: runFooter ? 'Copy run' : 'Copy message', size: 'sm' }))
    const calls = toolCallsOf(msg)
    const callCount = runFooter ? runFooter.toolCalls : calls.length
    if (callCount) footer.appendChild(ui.h('span', 'ef-ai-message-metrics', { text: callCount + ' tool call' + (callCount === 1 ? '' : 's') }))
    if (role !== 'user') {
      const metrics = runFooter ? runMetricText(runFooter, metricText(msg)) : metricText(msg)
      if (metrics) footer.appendChild(ui.h('span', 'ef-ai-message-metrics', { text: metrics }))
    }
    stack.appendChild(footer)
    row.appendChild(stack)
    return row
  }

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'ef-ai-panel ef-ai-transcript')

    const scroll = ui.scrollArea({ children: [] })
    scroll.classList.add('ef-ai-message-scroll')
    root.appendChild(scroll)
    let stickToBottom = true
    scroll.addEventListener('scroll', function () {
      stickToBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 32
    }, { passive: true })

    function clearScroll() {
      while (scroll.firstChild) disposeTree(scroll.firstChild)
    }

    function render() {
      const shouldStick = stickToBottom || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 32
      const a = activeAgent()
      clearScroll()
      if (!a) {
        scroll.appendChild(renderEmpty({ title: 'No active agent', content: 'Select an agent to inspect its transcript.' }))
        return
      }

      const messages = projectedMessages(messagesOf(a))
      const runFooters = runFooterInfo(messages)
      if (!messages.length) {
        scroll.appendChild(renderEmpty({ title: 'No messages yet', content: 'Send a message from AI Chat to start this transcript.' }))
        return
      }
      for (let i = 0; i < messages.length; i++) scroll.appendChild(renderMessage(a, messages[i], runFooters))
      if (shouldStick) requestAnimationFrame(function () { scroll.scrollTop = scroll.scrollHeight })
    }

    ui.collect(root, EF.effect(render))
    return root
  }

  EF.registerComponent('ai-messages', {
    category: 'panel',
    label: 'AI Messages',
    icon: 'message-circle',
    defaults: function () { return { title: 'AI Messages', icon: 'message-circle', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
