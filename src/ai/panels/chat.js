;(function (EF) {
  'use strict'

  const ui = EF.ui

  const MODE_OPTIONS = [
    { value: 'chat', label: 'Chat' },
    { value: 'goal', label: 'Goal' },
  ]

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
    if (EF.ai.connectionOptions) return optionsFrom(EF.ai.connectionOptions())
    return EF.ai.connections ? optionsFrom(EF.ai.connections) : optionsFrom(EF.ai.listConnections())
  }

  function defaultConnection() {
    if (EF.settings) return EF.settings.get('ai.defaultConnection') || EF.ai.defaultConnection || 'mock'
    return EF.ai.defaultConnection || 'mock'
  }

  function connectionConfig(connection) {
    return EF.ai.getConnectionConfig ? EF.ai.getConnectionConfig(connection || defaultConnection()) : {}
  }

  function defaultModel(connection) {
    return connectionConfig(connection).defaultModel || ''
  }

  function modelOptions(connection, config) {
    const o = config || {}
    const out = []
    const hints = (!o.loadedOnly && EF.ai.modelHints) ? EF.ai.modelHints(connection) : []
    for (let h = 0; h < hints.length; h++) pushOption(out, hints[h])
    const connections = EF.ai.connections ? readList(EF.ai.connections) : []
    for (let i = 0; i < connections.length; i++) {
      const p = connections[i]
      if (typeof p !== 'string' && (p.id === connection || p.name === connection || p.value === connection)) {
        const metaModels = p.models || []
        for (let m = 0; m < metaModels.length; m++) pushOption(out, metaModels[m])
      }
    }
    const models = EF.ai.models ? (read(EF.ai.models) || []) : []
    const loaded = (Array.isArray(models) ? models : models[connection]) || []
    for (let j = 0; j < loaded.length; j++) pushOption(out, loaded[j])
    const fallback = defaultModel(connection)
    if (fallback) pushOption(out, fallback)
    return out
  }

  function configuredConnectionOptions() {
    const connections = connectionOptions()
    const statuses = EF.ai.connectionStatus ? (read(EF.ai.connectionStatus) || {}) : {}
    const loadedMap = EF.ai.models ? (read(EF.ai.models) || {}) : {}
    const out = []
    for (let i = 0; i < connections.length; i++) {
      const p = connections[i]
      const id = p.value || p.id
      if (!id || id === 'mock') continue
      const cfg = connectionConfig(id)
      const isLocal = id === 'ollama' || id === 'local-bridge'
      const isSubscription = p.authType === 'subscriptionBridge'
      const loaded = (Array.isArray(loadedMap) ? loadedMap : loadedMap[id]) || []
      const opts = modelOptions(id, { loadedOnly: isLocal || (isSubscription && !cfg.defaultModel && !loaded.length) })
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

  function groupedModelOptions() {
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
          subLabel: g.label,
        })
      }
    }
    return out
  }

  function agents() {
    return readList(EF.ai.agents)
  }

  function resources() {
    return readList(EF.ai.resources)
  }

  function activeAgent() {
    const id = read(EF.ai.activeAgentId)
    const list = agents()
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
    return null
  }

  function updateCurrentAgent(patch) {
    const agent = activeAgent()
    if (agent) EF.ai.updateAgent(agent.id, patch)
  }

  function permissionLabel(value) {
    for (let i = 0; i < PERMISSION_OPTIONS.length; i++) {
      if (PERMISSION_OPTIONS[i].value === value) return PERMISSION_OPTIONS[i].label
    }
    return 'Permissions'
  }

  function refTitle(item) {
    return item.title || item.label || item.name || item.uri || item.id || 'Resource'
  }

  function openResourceMenu(anchor, insertResources) {
    const all = resources()
    const items = all.length ? all.map(function (res) {
      return {
        label: refTitle(res),
        icon: 'plus',
        onSelect: function () { insertResources([res]) },
      }
    }) : [{ type: 'header', label: 'No resources available' }]
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
    const connection = EF.signal(props.connection || defaultConnection())
    const model = EF.signal(props.model || defaultModel(connection.peek()))
    const mode = EF.signal(props.mode || 'chat')
    const permissionMode = EF.signal(props.permissionMode || 'full')
    const draft = EF.signal(EF.ai.richPrompt.empty())
    const hasTarget = EF.derived(function () { return !!activeAgent() })
    const busy = EF.derived(function () {
      const a = activeAgent()
      return !!(a && (a.status === 'running' || a.status === 'queued'))
    })
    const controlDisabled = EF.derived(function () { return !hasTarget() })
    const sendDisabled = EF.derived(function () { return !hasTarget() || (!busy() && EF.ai.richPrompt.isEmpty(draft())) })
    const sendIcon = EF.derived(function () { return busy() ? 'square' : 'arrow-up' })

    const root = ui.h('div', 'ef-ai-panel ef-ai-chat')
    ui.collect(root, hasTarget.dispose)
    ui.collect(root, busy.dispose)
    ui.collect(root, controlDisabled.dispose)
    ui.collect(root, sendDisabled.dispose)
    ui.collect(root, sendIcon.dispose)

    const composer = ui.h('div', 'ef-ai-composer')
    if (EF.ai.installTargetDrop) {
      EF.ai.installTargetDrop(composer, {
        onDrop: function (targets) { insertTargets(targets) },
      })
    }
    const onAddToChat = function (ev) {
      const targets = ev.detail && ev.detail.targets
      if (targets && targets.length) insertTargets(targets)
    }
    window.addEventListener('ef-ai-add-to-chat', onAddToChat)
    ui.collect(root, function () { window.removeEventListener('ef-ai-add-to-chat', onAddToChat) })

    const editorWrap = ui.h('div', 'ef-ai-chat-input-wrap')
    const editor = ui.richPromptInput({
      value: draft,
      placeholder: 'Message current agent...',
      disabled: controlDisabled,
      onSubmit: sendClick,
    })
    editor.classList.add('ef-ai-chat-input')
    editorWrap.appendChild(editor)
    composer.appendChild(editorWrap)

    const actions = ui.h('div', 'ef-ai-chat-actions')
    const leftActions = ui.h('div', 'ef-ai-chat-actions-left')
    const rightActions = ui.h('div', 'ef-ai-chat-actions-right')
    const add = ui.iconButton({
      icon: 'plus',
      title: 'Add context',
      kind: 'ghost',
      disabled: controlDisabled,
      onClick: function (ev) { openResourceMenu(ev.currentTarget, insertResources) },
    })
    const permissionText = EF.derived(function () { return permissionLabel(permissionMode()) })
    ui.collect(root, permissionText.dispose)
    const permission = ui.button({
      text: permissionText,
      icon: ui.icon({ name: 'alert-circle', size: 'sm' }),
      kind: 'ghost',
      size: 'sm',
      disabled: controlDisabled,
      onClick: function (ev) { openPermissionMenu(ev.currentTarget, permissionMode) },
    })
    const modelSlot = ui.h('div', 'ef-ai-model-control')
    const modeSlot = ui.h('div', 'ef-ai-mode-control')
    const sendTitle = EF.derived(function () { return busy() ? 'Stop' : 'Send' })
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
    rightActions.appendChild(modelSlot)
    rightActions.appendChild(modeSlot)
    rightActions.appendChild(send)
    actions.appendChild(leftActions)
    actions.appendChild(rightActions)
    composer.appendChild(actions)
    root.appendChild(composer)

    ui.collect(root, EF.effect(function () {
      const opts = connectionOptions()
      const preferred = defaultConnection()
      if (opts.length && !connection.peek()) connection.set(preferred || opts[0].value)
    }))

    ui.collect(root, EF.effect(function () {
      const opts = groupedModelOptions()
      const selected = EF.signal(modelValue(connection(), model()))
      disposeTree(modelSlot.firstChild)
      modelSlot.appendChild(ui.select({
        value: selected,
        options: opts,
        placeholder: 'Model',
        variant: 'minimal',
        autoWidth: true,
        disabled: controlDisabled,
        onChange: function (v) {
          const parsed = parseModelValue(v)
          connection.set(parsed.connection)
          model.set(parsed.model)
          updateCurrentAgent({ connection: parsed.connection, model: parsed.model, stream: !!connectionConfig(parsed.connection).stream })
        },
      }))
      let found = false
      const current = selected.peek()
      for (let i = 0; i < opts.length; i++) found = found || opts[i].value === current
      if (!found) {
        const first = opts.find(function (it) { return it.value })
        if (first) {
          const parsed = parseModelValue(first.value)
          connection.set(parsed.connection)
          model.set(parsed.model)
          updateCurrentAgent({ connection: parsed.connection, model: parsed.model, stream: !!connectionConfig(parsed.connection).stream })
        }
      }
    }))

    ui.collect(root, EF.effect(function () {
      const a = activeAgent()
      if (!a) {
        connection.set(defaultConnection())
        model.set(defaultModel(connection.peek()))
        return
      }
      connection.set(a.connection || defaultConnection())
      model.set(a.model || defaultModel(a.connection || defaultConnection()))
      mode.set(a.mode || 'chat')
      permissionMode.set(a.permissionMode || 'full')
    }))

    ui.collect(root, EF.effect(function () {
      disposeTree(modeSlot.firstChild)
      modeSlot.appendChild(ui.select({
        value: mode,
        options: MODE_OPTIONS,
        placeholder: 'Mode',
        variant: 'minimal',
        autoWidth: true,
        disabled: controlDisabled,
        onChange: function (v) {
          mode.set(v)
          updateCurrentAgent({ mode: v })
        },
      }))
    }))

    return root

    function insertResources(list) {
      if (!list || !list.length) return
      if (editor.__efRichPromptInsertRefs) editor.__efRichPromptInsertRefs(list)
      if (editor.__efRichPromptFocus) editor.__efRichPromptFocus()
    }

    function insertTargets(targets) {
      const stored = []
      for (let i = 0; i < (targets || []).length; i++) {
        const res = EF.ai.addTarget ? EF.ai.addTarget(targets[i]) : null
        if (res) stored.push(res)
      }
      insertResources(stored)
    }

    function sendClick() {
      const agent = activeAgent()
      if (!agent) return
      if (busy()) {
        EF.ai.stopAgent(agent.id)
        return
      }
      const currentDraft = EF.ai.richPrompt.normalize(draft.peek())
      if (EF.ai.richPrompt.isEmpty(currentDraft)) return
      const refs = EF.ai.richPrompt.refs(currentDraft)
      const content = EF.ai.richPrompt.content(currentDraft)
      EF.ai.updateAgent(agent.id, {
        connection: connection.peek(),
        model: model.peek() || defaultModel(connection.peek()),
        mode: mode.peek(),
        permissionMode: permissionMode.peek(),
        stream: !!connectionConfig(connection.peek()).stream,
      })
      const meta = {
        connection: connection.peek(),
        model: model.peek() || defaultModel(connection.peek()),
        mode: mode.peek(),
        permissionMode: permissionMode.peek(),
        resourceRefs: refs,
        renderedText: content.renderedText,
      }
      EF.ai.sendMessage(agent.id, { content: content, contextRefs: refs, meta: meta }, 'user')
      draft.set(EF.ai.richPrompt.empty())
    }
  }

  EF.registerComponent('ai-chatinput', {
    defaults: function () { return { title: 'AI Send', icon: 'message-circle', props: { mode: 'chat' } } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
