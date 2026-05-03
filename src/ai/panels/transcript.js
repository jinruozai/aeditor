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
    return agent ? (agent.messages || agent.transcript || agent.history || []) : []
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

  function appendToolBlock(parent, title, value, className) {
    if (value == null) return
    const block = ui.h('div', 'ef-ai-tool-call-block ' + className)
    block.appendChild(ui.h('div', 'ef-ai-tool-call-block-title', { text: title }))
      const pre = ui.h('pre', 'ef-ai-tool-call-code ef-ui-scrollarea')
    pre.textContent = displayText(value)
    block.appendChild(pre)
    parent.appendChild(block)
  }

  function appendToolButton(parent, text, enabled, fn, kind) {
    parent.appendChild(ui.button({
      text: text,
      size: 'sm',
      kind: kind || 'default',
      disabled: !enabled,
      onClick: fn,
    }))
  }

  function renderToolActions(card, agentId, call) {
    const state = EF.ai.getToolCallActionState
      ? EF.ai.getToolCallActionState(agentId, call.id, 'user')
      : null
    const actions = ui.h('div', 'ef-ai-tool-call-actions')
    appendToolButton(actions, 'Preview', state && state.canPreview, function () {
      EF.ai.previewToolCall(agentId, call.id, 'user')
    })
    appendToolButton(actions, 'Approve', state && state.canApprove, function () {
      EF.ai.approveToolCall(agentId, call.id, 'user')
    }, 'primary')
    appendToolButton(actions, 'Reject', state && state.canReject, function () {
      EF.ai.rejectToolCall(agentId, call.id, 'Rejected by user', 'user')
    }, 'danger')
    appendToolButton(actions, 'Run', state && state.canRun, function () {
      EF.ai.runToolCall(agentId, call.id, 'user')
    }, 'primary')
    appendToolButton(actions, 'Apply', state && state.canApply, function () {
      EF.ai.applyToolCall(agentId, call.id, 'user')
    }, 'primary')
    card.appendChild(actions)

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
    const card = ui.h('div', 'ef-ai-tool-call ef-ai-tool-call-' + status)
    const head = ui.h('div', 'ef-ai-tool-call-head')
    head.appendChild(ui.h('span', 'ef-ai-tool-call-name', { text: toolName(call) }))
    head.appendChild(ui.h('span', 'ef-ai-tool-call-status', { text: status }))
    card.appendChild(head)

    if (call.description || call.title) {
      card.appendChild(ui.h('div', 'ef-ai-tool-call-desc', { text: call.description || call.title }))
    }
    renderToolActions(card, agentId, call)
    appendToolBlock(card, 'Args', call.args, 'ef-ai-tool-call-args')
    appendToolBlock(card, 'Preview', call.preview, 'ef-ai-tool-call-preview')
    appendToolBlock(card, 'Result', call.result, 'ef-ai-tool-call-result')
    appendToolBlock(card, 'Applied', call.applyResult, 'ef-ai-tool-call-apply-result')
    appendToolBlock(card, 'Error', call.error, 'ef-ai-tool-call-error')
    return card
  }

  function renderToolCalls(parent, agentId, calls) {
    if (!calls || !calls.length) return
    const wrap = ui.h('div', 'ef-ai-tool-calls')
    for (let i = 0; i < calls.length; i++) wrap.appendChild(renderToolCall(agentId, calls[i]))
    parent.appendChild(wrap)
  }

  function renderPayload(msg) {
    const content = msg.content != null ? msg.content : msg.text
    if (content && typeof content === 'object') {
      const pre = ui.h('pre', 'ef-ai-message-code ef-ui-scrollarea')
      pre.textContent = JSON.stringify(content, null, 2)
      return pre
    }
    const wrap = ui.h('div', 'ef-ai-message-content')
    appendTextParts(wrap, content)
    return wrap
  }

  function renderEmpty(item) {
    const row = ui.h('div', 'ef-ai-empty-state')
    row.appendChild(ui.h('div', 'ef-ai-empty-title', { text: item.title }))
    row.appendChild(ui.h('div', 'ef-ai-empty-body', { text: item.content }))
    return row
  }

  function renderMessage(agent, msg) {
    if (msg.empty) return renderEmpty(msg)

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

    const footer = ui.h('div', 'ef-ai-message-footer')
    footer.appendChild(ui.copyButton({ text: messageText(msg), title: 'Copy message', size: 'sm' }))
    if (role !== 'user') {
      const metrics = metricText(msg)
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

      const messages = messagesOf(a)
      if (!messages.length) {
        scroll.appendChild(renderEmpty({ title: 'No messages yet', content: 'Send a message from AI Chat to start this transcript.' }))
        return
      }
      for (let i = 0; i < messages.length; i++) scroll.appendChild(renderMessage(a, messages[i]))
      if (shouldStick) requestAnimationFrame(function () { scroll.scrollTop = scroll.scrollHeight })
    }

    ui.collect(root, EF.effect(render))
    return root
  }

  EF.registerComponent('ai-transcript', {
    defaults: function () { return { title: 'AI Transcript', icon: 'AI', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
  EF.registerComponent('ai-conversation', {
    defaults: function () { return { title: 'AI Chat', icon: 'AI', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
