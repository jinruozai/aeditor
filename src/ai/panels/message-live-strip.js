;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui
  const ai = aeditor.ai = aeditor.ai || {}

  function usageNumber(usage, keys) {
    if (!usage) return 0
    for (let i = 0; i < keys.length; i++) {
      const v = Number(usage[keys[i]])
      if (v > 0) return v
    }
    return 0
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return ''
    if (ms < 1000) return String(Math.max(1, Math.round(ms))) + ' ms'
    if (ms < 10000) return (ms / 1000).toFixed(1).replace(/\.0$/, '') + ' s'
    return String(Math.round(ms / 1000)) + ' s'
  }

  function formatCost(cost) {
    const n = Number(cost && cost.amount || 0)
    if (!n) return ''
    const digits = n < 0.0001 ? 6 : (n < 0.01 ? 5 : 4)
    return '$' + n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')
  }

  function normalizePreview(text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
  }

  function displayModelTail(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
  }

  function previewText(state) {
    const activity = normalizePreview(state && state.activityText)
    const model = displayModelTail(state && state.modelTail)
    const preview = model || normalizePreview(state && state.previewTail)
    const s = state && state.state || 'idle'
    if ((s === 'tool' || s === 'waiting_approval') && activity) return activity + (preview ? ' | ' + preview : '')
    return preview || activity
  }

  function stateLabel(state) {
    const s = state && state.state || 'idle'
    if (s === 'waiting_approval') return 'approval'
    return s
  }

  function metricsText(state) {
    state = state || {}
    const parts = []
    const started = state.startedAt || null
    const ended = state.completedAt || null
    if (started) parts.push(formatDuration((ended || Date.now()) - started))
    if (state.firstTokenAt && started) parts.push('TTFT ' + formatDuration(state.firstTokenAt - started))
    const total = state.totalTokens || usageNumber(state.usage, ['total_tokens', 'totalTokens'])
    const out = state.outputTokens || usageNumber(state.usage, ['output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens'])
    if (total) parts.push(String(total) + ' tok')
    else if (out) parts.push(String(out) + ' out')
    const speedMs = state.firstTokenAt ? (ended || Date.now()) - state.firstTokenAt : (started ? (ended || Date.now()) - started : 0)
    if (out && speedMs > 0) parts.push((out / Math.max(speedMs / 1000, 0.001)).toFixed(1).replace(/\.0$/, '') + ' tok/s')
    if (state.cost && state.cost.amount > 0) parts.push(formatCost(state.cost))
    return parts.join(' · ')
  }

  function createMessageLiveStrip() {
    const root = ui.h('div', 'aeditor-ai-live-run')
    const plate = ui.h('div', 'aeditor-ai-live-run-plate')
    const dot = ui.h('span', 'aeditor-ai-live-run-dot')
    const arrow = ui.h('button', 'aeditor-ai-live-run-arrow', { type: 'button', title: 'Toggle run preview' })
    const label = ui.h('span', 'aeditor-ai-live-run-label')
    const preview = ui.h('span', 'aeditor-ai-live-run-preview')
    const metrics = ui.h('div', 'aeditor-ai-live-run-metrics')
    let lastState = null
    let idleExpanded = false

    plate.appendChild(dot)
    plate.appendChild(arrow)
    plate.appendChild(label)
    plate.appendChild(preview)
    root.appendChild(plate)
    root.appendChild(metrics)

    arrow.addEventListener('click', function () {
      if ((lastState && lastState.state || 'idle') !== 'idle') return
      idleExpanded = !idleExpanded
      update(lastState)
    })

    function update(state) {
      lastState = state || null
      const s = state && state.state || 'idle'
      if (s !== 'idle') idleExpanded = false
      const collapsed = s === 'idle' && !idleExpanded
      root.setAttribute('data-state', s)
      root.setAttribute('data-collapsed', collapsed ? 'true' : 'false')
      arrow.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      label.textContent = stateLabel(state)
      preview.textContent = previewText(state) || (s === 'idle' ? '' : 'waiting for model output...')
      metrics.textContent = metricsText(state)
    }

    update(null)
    return {
      el: root,
      update: update,
      tick: function () {
        if (lastState && lastState.startedAt && !lastState.completedAt) metrics.textContent = metricsText(lastState)
      },
    }
  }

  ai.createMessageLiveStrip = createMessageLiveStrip
})(window.aeditor = window.aeditor || {})
