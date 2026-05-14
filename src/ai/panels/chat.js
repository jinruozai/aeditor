;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui

  const PERMISSION_OPTIONS = [
    { value: 'default', label: 'Default permissions', icon: 'settings' },
    { value: 'auto', label: 'Auto review', icon: 'clock' },
    { value: 'full', label: 'Full access', icon: 'alert-circle' },
    { value: 'custom', label: 'Custom', icon: 'sliders' },
  ]

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

  function optionsFrom(items) {
    const list = readList(items)
    const out = []
    for (let i = 0; i < list.length; i++) {
      const it = list[i]
      out.push(typeof it === 'string'
        ? { value: it, label: it }
        : { value: it.id || it.value || it.name, label: it.label || it.name || it.id || it.value })
    }
    return out
  }

  function pushOption(out, item) {
    const value = typeof item === 'string' ? item : (item.id || item.value || item.name || item.model)
    if (!value) return
    for (let i = 0; i < out.length; i++) if (out[i].value === value) return
    out.push(typeof item === 'string'
      ? { value: value, label: value }
      : { value: value, label: item.label || item.name || value })
  }

  function connectionOptions() {
    if (aeditor.ai.connectionOptions) return aeditor.ai.connectionOptions()
    return aeditor.ai.connections ? optionsFrom(aeditor.ai.connections) : optionsFrom(aeditor.ai.listConnections())
  }

  function defaultConnection() {
    if (aeditor.settings && aeditor.settings.values) aeditor.settings.values()
    if (aeditor.settings) return aeditor.settings.get('ai.defaultConnection') || aeditor.ai.defaultConnection || 'mock'
    return aeditor.ai.defaultConnection || 'mock'
  }

  function connectionConfig(connection) {
    return aeditor.ai.getConnectionConfig ? aeditor.ai.getConnectionConfig(connection || defaultConnection()) : {}
  }

  function defaultModel(connection) {
    return connectionConfig(connection).defaultModel || ''
  }

  function modelOptions(connection, config) {
    const o = config || {}
    const out = []
    const hints = (!o.loadedOnly && aeditor.ai.modelHints) ? aeditor.ai.modelHints(connection) : []
    for (let h = 0; h < hints.length; h++) pushOption(out, hints[h])
    const connections = aeditor.ai.connections ? readList(aeditor.ai.connections) : []
    for (let i = 0; i < connections.length; i++) {
      const p = connections[i]
      if (typeof p !== 'string' && (p.id === connection || p.name === connection || p.value === connection)) {
        const metaModels = p.models || []
        for (let m = 0; m < metaModels.length; m++) pushOption(out, metaModels[m])
      }
    }
    const models = aeditor.ai.models ? (read(aeditor.ai.models) || []) : []
    const loaded = (Array.isArray(models) ? models : models[connection]) || []
    for (let j = 0; j < loaded.length; j++) pushOption(out, loaded[j])
    const fallback = defaultModel(connection)
    if (fallback) pushOption(out, fallback)
    return out
  }

  function modelContextLimit(modelId) {
    const id = String(modelId || '').toLowerCase()
    if (id.indexOf('gpt-5.5') >= 0) return 400000
    if (id.indexOf('gpt-5') >= 0) return 400000
    if (id.indexOf('claude') >= 0) return 200000
    if (id.indexOf('gemini') >= 0) return 1000000
    if (id.indexOf('deepseek') >= 0) return 64000
    return 128000
  }

  function textOfContent(content) {
    if (content == null) return ''
    if (typeof content === 'string') return content
    if (content && typeof content === 'object' && content.type === 'rich-prompt') {
      return content.renderedText || (aeditor.ai.richPrompt && aeditor.ai.richPrompt.toModelText ? aeditor.ai.richPrompt.toModelText(content) : '')
    }
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

  function messagesForEstimate(agent) {
    if (!agent) return []
    if (aeditor.ai.compaction && aeditor.ai.compaction.requestMessages) return aeditor.ai.compaction.requestMessages(agent, null)
    return agent && agent.messages || []
  }

  function compactedMessageCount(agent) {
    const seen = {}
    const records = agent && agent.compactions || []
    for (let i = 0; i < records.length; i++) {
      const ids = records[i].messageIds || []
      for (let j = 0; j < ids.length; j++) seen[ids[j]] = true
    }
    return Object.keys(seen).length
  }

  function latestCompaction(agent) {
    const records = agent && agent.compactions || []
    return records.length ? records[records.length - 1] : null
  }

  function contextMetrics(agent, draftValue) {
    const parts = []
    const rawParts = []
    const messages = messagesForEstimate(agent)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.status === 'running') continue
      parts.push((msg.role || 'message') + ': ' + textOfContent(msg.content != null ? msg.content : msg.text))
    }
    const compacted = aeditor.ai.compaction && aeditor.ai.compaction.contextMessages ? aeditor.ai.compaction.contextMessages(agent) : []
    for (let i = 0; i < compacted.length; i++) parts.push('system: ' + textOfContent(compacted[i].content))
    const rawMessages = agent && agent.messages || []
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i]
      if (msg.status === 'running') continue
      rawParts.push((msg.role || 'message') + ': ' + textOfContent(msg.content != null ? msg.content : msg.text))
    }
    if (draftValue && !aeditor.ai.richPrompt.isEmpty(draftValue)) {
      const draftText = 'draft: ' + aeditor.ai.richPrompt.toModelText(draftValue)
      parts.push(draftText)
      rawParts.push(draftText)
    }
    const last = latestCompaction(agent)
    return {
      used: estimateTokens(parts.join('\n\n')),
      rawUsed: estimateTokens(rawParts.join('\n\n')),
      compactions: agent && agent.compactions ? agent.compactions.length : 0,
      compactedMessages: compactedMessageCount(agent),
      latestBefore: last && last.tokenEstimateBefore || 0,
      latestAfter: last && last.tokenEstimateAfter || 0,
    }
  }

  function configuredConnectionOptions() {
    const connections = connectionOptions()
    const statuses = aeditor.ai.connectionStatus ? (read(aeditor.ai.connectionStatus) || {}) : {}
    const loadedMap = aeditor.ai.models ? (read(aeditor.ai.models) || {}) : {}
    const out = []
    for (let i = 0; i < connections.length; i++) {
      const p = connections[i]
      const id = p.value || p.id
      if (!id || id === 'mock') continue
      const cfg = connectionConfig(id)
      const isLocal = id === 'ollama' || id === 'local-bridge'
      const isSubscription = p.authType === 'subscriptionBridge'
      const loaded = (Array.isArray(loadedMap) ? loadedMap : loadedMap[id]) || []
      const opts = modelOptions(id, { loadedOnly: isLocal })
      const hasCredential = !!cfg.apiKey
      const signedIn = statuses[id] && statuses[id].state === 'signed_in'
      const hasConfiguredLocal = (isLocal || p.authType === 'localBridge') && (!!cfg.defaultModel || !!loaded.length)
      if (p.authType === 'apiKey' && !hasCredential) continue
      if (isSubscription && !signedIn && !cfg.defaultModel && !loaded.length) continue
      if ((isLocal || p.authType === 'localBridge') && !hasConfiguredLocal) continue
      if (!opts.length) continue
      out.push({ id: id, label: p.label || p.name || id, models: opts })
    }
    return out
  }

  function modelValue(connection, model) {
    return (connection || '') + '::' + (model || '')
  }

  function parseModelValue(value) {
    const s = String(value || '')
    const idx = s.indexOf('::')
    return idx < 0 ? { connection: defaultConnection(), model: s } : { connection: s.slice(0, idx), model: s.slice(idx + 2) }
  }

  function hasModelOption(items, value) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].value === value) return true
    }
    return false
  }

  function groupedModelOptions(currentConnection, currentModel) {
    const groups = configuredConnectionOptions()
    const out = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (!g.models.length) continue
      if (out.length) out.push({ type: 'divider' })
      out.push({ type: 'header', label: g.label })
      for (let j = 0; j < g.models.length; j++) {
        const m = g.models[j]
        out.push({
          value: modelValue(g.id, m.value),
          label: m.label || m.value,
        })
      }
    }
    const currentValue = modelValue(currentConnection, currentModel)
    if (currentConnection && currentModel && !hasModelOption(out, currentValue)) {
      if (out.length) out.push({ type: 'divider' })
      out.push({ type: 'header', label: 'Current agent' })
      out.push({ value: currentValue, label: currentModel })
    }
    return out
  }

  function agents() {
    return readList(aeditor.ai.agents)
  }

  function attachments() {
    return readList(aeditor.ai.attachments)
  }

  function activeAgent() {
    const id = read(aeditor.ai.activeAgentId)
    const list = agents()
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
    return null
  }

  function updateCurrentAgent(patch) {
    const agent = activeAgent()
    if (agent) aeditor.ai.updateAgent(agent.id, patch)
  }

  function permissionLabel(value) {
    for (let i = 0; i < PERMISSION_OPTIONS.length; i++) {
      if (PERMISSION_OPTIONS[i].value === value) return PERMISSION_OPTIONS[i].label
    }
    return 'Permissions'
  }

  function refTitle(item) {
    return item.title || item.label || item.name || item.uri || item.id || 'Attachment'
  }

  function openAttachmentMenu(anchor, insertAttachments) {
    const all = attachments()
    const items = all.length ? all.map(function (attachment) {
      return {
        label: refTitle(attachment),
        icon: 'plus',
        onSelect: function () { insertAttachments([attachment]) },
      }
    }) : [{ type: 'header', label: 'No attachments available' }]
    ui.menu({ anchor: anchor, items: items, side: 'top', align: 'start' })
  }

  function openPermissionMenu(anchor, permSig) {
    const items = PERMISSION_OPTIONS.map(function (opt) {
      return {
        label: opt.label,
        icon: opt.icon,
        checked: permSig.peek() === opt.value,
        onSelect: function () {
          permSig.set(opt.value)
          updateCurrentAgent({ permissionMode: opt.value })
        },
      }
    })
    ui.menu({ anchor: anchor, items: items, side: 'top', align: 'start' })
  }

  function factory(propsSig, ctx) {
    const props = propsSig.peek() || {}
    const connection = aeditor.signal(props.connection || defaultConnection())
    const model = aeditor.signal(props.model || defaultModel(connection.peek()))
    const permissionMode = aeditor.signal(props.permissionMode || 'full')
    const draft = aeditor.signal(aeditor.ai.richPrompt.empty())
    const hasTarget = aeditor.derived(function () { return !!activeAgent() })
    const busy = aeditor.derived(function () {
      const a = activeAgent()
      return !!(a && (a.status === 'running' || a.status === 'queued'))
    })
    const stoppable = aeditor.derived(function () {
      const a = activeAgent()
      return !!(a && (a.status === 'running' || a.status === 'waiting_approval'))
    })
    const controlDisabled = aeditor.derived(function () { return !hasTarget() })
    const sendDisabled = aeditor.derived(function () { return !hasTarget() || (aeditor.ai.richPrompt.isEmpty(draft()) && !stoppable()) })
    const sendIcon = aeditor.derived(function () { return stoppable() && aeditor.ai.richPrompt.isEmpty(draft()) ? 'square' : 'arrow-up' })

    const root = ui.view({ scroll: 'hidden', className: 'aeditor-ai-panel aeditor-ai-chat' })
    ui.collect(root, hasTarget.dispose)
    ui.collect(root, busy.dispose)
    ui.collect(root, stoppable.dispose)
    ui.collect(root, controlDisabled.dispose)
    ui.collect(root, sendDisabled.dispose)
    ui.collect(root, sendIcon.dispose)

    const composer = ui.h('div', 'aeditor-ai-composer')
    if (aeditor.ai.installTargetDrop) {
      aeditor.ai.installTargetDrop(composer, {
        onDrop: function (targets) { insertTargets(targets) },
      })
    }
    const onAddToChat = function (ev) {
      const targets = ev.detail && ev.detail.targets
      if (targets && targets.length) insertTargets(targets)
    }
    window.addEventListener('aeditor-ai-add-to-chat', onAddToChat)
    ui.collect(root, function () { window.removeEventListener('aeditor-ai-add-to-chat', onAddToChat) })

    const editorWrap = ui.h('div', 'aeditor-ai-chat-input-wrap')
    const editor = ui.richPromptInput({
      value: draft,
      placeholder: 'Message current agent...',
      disabled: controlDisabled,
      onSubmit: sendClick,
    })
    editor.classList.add('aeditor-ai-chat-input')
    editorWrap.appendChild(editor)
    composer.appendChild(editorWrap)

    const actions = ui.h('div', 'aeditor-ai-chat-actions')
    const leftActions = ui.h('div', 'aeditor-ai-chat-actions-left')
    const rightActions = ui.h('div', 'aeditor-ai-chat-actions-right')
    const add = ui.iconButton({
      icon: 'plus',
      title: 'Add context',
      kind: 'ghost',
      disabled: controlDisabled,
      onClick: function (ev) { openAttachmentMenu(ev.currentTarget, insertAttachments) },
    })
    const permissionText = aeditor.derived(function () { return permissionLabel(permissionMode()) })
    ui.collect(root, permissionText.dispose)
    const permission = ui.button({
      text: permissionText,
      icon: ui.icon({ name: 'alert-circle', size: 'sm' }),
      kind: 'ghost',
      size: 'sm',
      disabled: controlDisabled,
      onClick: function (ev) { openPermissionMenu(ev.currentTarget, permissionMode) },
    })
    const modelSlot = ui.h('div', 'aeditor-ai-model-control')
    const contextMeter = ui.h('div', 'aeditor-ai-context-meter')
    const contextInfo = aeditor.signal({ used: 0, rawUsed: 0, limit: modelContextLimit(model.peek()), compactions: 0, compactedMessages: 0, latestBefore: 0, latestAfter: 0 })
    let contextTimer = null
    function scheduleContextEstimate(delay) {
      if (contextTimer) clearTimeout(contextTimer)
      contextTimer = setTimeout(function () {
        contextTimer = null
        const a = activeAgent()
        contextInfo.set(Object.assign({
          limit: modelContextLimit(model.peek()),
        }, contextMetrics(a, draft.peek())))
      }, delay == null ? 260 : delay)
    }
    const contextTip = aeditor.derived(function () {
      const info = contextInfo()
      const used = info.used || 0
      const rawUsed = info.rawUsed || used
      const limit = info.limit || modelContextLimit(model.peek())
      const pct = Math.min(100, Math.round(used / limit * 100))
      const lines = [
        'Context ' + pct + '%',
        used.toLocaleString() + ' / ' + limit.toLocaleString() + ' tokens (estimated request view)',
      ]
      if (rawUsed > used) lines.push('Raw transcript estimate: ' + rawUsed.toLocaleString() + ' tokens')
      if (info.compactions) {
        lines.push('Compactions: ' + info.compactions + ' records, ' + (info.compactedMessages || 0) + ' raw messages hidden from request')
        if (info.latestBefore || info.latestAfter) lines.push('Latest compaction: ' + (info.latestBefore || 0).toLocaleString() + ' -> ' + (info.latestAfter || 0).toLocaleString() + ' tokens')
      }
      return lines.join('\n')
    })
    ui.collect(root, contextTip.dispose)
    ui.tooltip(contextMeter, { text: contextTip, side: 'top', delay: 250 })
    ui.collect(root, function () {
      if (contextTimer) clearTimeout(contextTimer)
      contextTimer = null
    })
    ui.collect(root, aeditor.effect(function () {
      const info = contextInfo()
      const used = info.used || 0
      const limit = info.limit || modelContextLimit(model.peek())
      const pct = Math.max(0, Math.min(1, used / limit))
      contextMeter.style.setProperty('--aeditor-ai-context-pct', String(pct * 100))
      contextMeter.setAttribute('aria-label', contextTip())
    }))
    ui.collect(root, aeditor.effect(function () {
      draft()
      model()
      const agentId = read(aeditor.ai.activeAgentId)
      if (agentId && aeditor.ai.messageListVersion) aeditor.ai.messageListVersion(agentId)
      scheduleContextEstimate()
    }))
    const sendTitle = aeditor.derived(function () { return stoppable() && aeditor.ai.richPrompt.isEmpty(draft()) ? 'Stop' : (busy() ? 'Queue message' : 'Send') })
    ui.collect(root, sendTitle.dispose)
    const send = ui.iconButton({
      icon: sendIcon,
      title: sendTitle,
      kind: 'primary',
      disabled: sendDisabled,
      onClick: sendClick,
    })
    leftActions.appendChild(add)
    leftActions.appendChild(permission)
    rightActions.appendChild(contextMeter)
    rightActions.appendChild(modelSlot)
    rightActions.appendChild(send)
    actions.appendChild(leftActions)
    actions.appendChild(rightActions)
    composer.appendChild(actions)
    root.appendChild(composer)

    ui.collect(root, aeditor.effect(function () {
      const opts = connectionOptions()
      const preferred = defaultConnection()
      if (opts.length && !connection.peek()) connection.set(preferred || opts[0].value)
    }))

    ui.collect(root, aeditor.effect(function () {
      const opts = groupedModelOptions(connection(), model())
      const selected = aeditor.signal(modelValue(connection(), model()))
      disposeTree(modelSlot.firstChild)
      modelSlot.appendChild(ui.select({
        value: selected,
        options: opts,
        placeholder: 'Model',
        variant: 'minimal',
        autoWidth: true,
        side: 'top',
        disabled: controlDisabled,
        onChange: function (v) {
          const parsed = parseModelValue(v)
          aeditor.batch(function () {
            connection.set(parsed.connection)
            model.set(parsed.model)
            updateCurrentAgent({ connection: parsed.connection, model: parsed.model, stream: !!connectionConfig(parsed.connection).stream })
          })
        },
      }))
    }))

    ui.collect(root, aeditor.effect(function () {
      const a = activeAgent()
      if (!a) {
        connection.set(defaultConnection())
        model.set(defaultModel(connection.peek()))
        return
      }
      connection.set(a.connection || defaultConnection())
      model.set(a.model || defaultModel(a.connection || defaultConnection()))
      permissionMode.set(a.permissionMode || 'full')
    }))

    return root

    function insertAttachments(list) {
      if (!list || !list.length) return
      if (editor.__aeditorRichPromptInsertRefs) editor.__aeditorRichPromptInsertRefs(list)
      if (editor.__aeditorRichPromptFocus) editor.__aeditorRichPromptFocus()
    }

    function insertTargets(targets) {
      const stored = []
      for (let i = 0; i < (targets || []).length; i++) {
        const attachment = aeditor.ai.addTarget ? aeditor.ai.addTarget(targets[i]) : null
        if (attachment) stored.push(attachment)
      }
      insertAttachments(stored)
    }

    function sendClick() {
      const agent = activeAgent()
      if (!agent) return
      const currentDraft = aeditor.ai.richPrompt.normalize(draft.peek())
      if (aeditor.ai.richPrompt.isEmpty(currentDraft) && stoppable()) {
        aeditor.ai.stopAgent(agent.id)
        return
      }
      if (aeditor.ai.richPrompt.isEmpty(currentDraft)) return
      const refs = aeditor.ai.richPrompt.refs(currentDraft)
      const content = aeditor.ai.richPrompt.content(currentDraft)
      aeditor.ai.updateAgent(agent.id, {
        connection: connection.peek(),
        model: model.peek() || defaultModel(connection.peek()),
        permissionMode: permissionMode.peek(),
        stream: !!connectionConfig(connection.peek()).stream,
      })
      const meta = {
        connection: connection.peek(),
        model: model.peek() || defaultModel(connection.peek()),
        permissionMode: permissionMode.peek(),
        attachmentRefs: refs,
        renderedText: content.renderedText,
      }
      aeditor.ai.message.send(agent.id, { content: content, contextRefs: refs, meta: meta, from: 'user' })
      draft.set(aeditor.ai.richPrompt.empty())
    }
  }

  aeditor.registerComponent('ai-chatinput', {
    category: 'panel',
    label: 'AIChatInput',
    icon: 'message-circle',
    defaults: function () { return { title: 'AIChatInput', icon: 'message-circle', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.aeditor = window.aeditor || {})
