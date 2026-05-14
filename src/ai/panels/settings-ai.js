// AI settings sections for AEditor.
;(function (aeditor) {
  'use strict'

  if (!aeditor.settings) return

  const ui = aeditor.ui

  aeditor.settings.registerSection('ai', {
    title: 'AI',
    icon: 'user',
    description: 'Connections, auth methods, models, and local bridge settings.',
    order: 20,
  })

  aeditor.settings.registerSchema('ai', [
    {
      key: 'ai.defaultConnection',
      label: 'Default Connection',
      type: 'select',
      default: 'mock',
      options: connectionSelectOptions,
      description: 'Connection used by newly created agents.',
      order: 10,
    },
  ])

  aeditor.effect(function () {
    if (!aeditor.ai || !aeditor.ai.setActiveConnection) return
    aeditor.ai.setActiveConnection(aeditor.settings.get('ai.defaultConnection') || 'mock')
  })

  aeditor.settings.registerPage('ai', {
    section: 'ai',
    title: 'Connections',
    icon: 'link',
    order: 0,
    replacesSchema: true,
    searchText: aiSearchText,
    factory: renderAiSettings,
  })

  function renderAiSettings() {
    const root = ui.view({ scroll: 'auto', className: 'aeditor-settings-page aeditor-settings-ai-page' })
    const options = connectionOptions()
    const initial = aeditor.settings.get('ai.defaultConnection') || (options[0] && options[0].id) || 'mock'
    const selected = aeditor.signal(initial)

    root.appendChild(pageHead(
      'AI Connections',
      'Choose a provider, configure auth, and set the model used by new agents.'
    ))

    const bar = ui.h('div', 'aeditor-settings-ai-toolbar')
    bar.appendChild(settingSelect({
      key: 'ai.defaultConnection',
      label: 'Default connection',
      desc: 'New agents start here. Existing agents keep their own connection.',
      options: connectionSelectOptions,
      compact: true,
      onChange: function (value) { selected.set(value) },
    }))
    bar.appendChild(ui.button({
      text: 'Add Connection',
      icon: 'plus',
      size: 'sm',
      onClick: function () { addCustomConnection(root) },
    }))
    root.appendChild(bar)

    const shell = ui.h('div', 'aeditor-settings-connection-shell')
    const list = ui.h('div', 'aeditor-settings-connection-list')
    const detail = ui.h('div', 'aeditor-settings-connection-detail')
    shell.appendChild(list)
    shell.appendChild(detail)
    root.appendChild(shell)

    renderConnectionList(list, selected)
    renderConnectionDetail(detail, selected)
    ui.collect(root, aeditor.effect(function () {
      selected()
      renderConnectionDetail(detail, selected)
      updateConnectionListActive(list, selected.peek())
    }))

    return root
  }

  function connectionOptions() {
    if (aeditor.ai && aeditor.ai.connectionOptions) return aeditor.ai.connectionOptions()
    return [{ id: 'mock', label: 'Mock', provider: 'mock', authType: 'none', transportType: 'mock' }]
  }

  function connectionSelectOptions() {
    return connectionOptions().map(function (item) {
      return { value: item.id, label: item.label || item.id }
    })
  }

  function pageHead(title, desc) {
    const head = ui.h('div', 'aeditor-settings-page-head')
    head.appendChild(ui.h('div', 'aeditor-settings-page-title', { text: title }))
    head.appendChild(ui.h('div', 'aeditor-settings-page-desc', { text: desc }))
    return head
  }

  function clear(el) {
    while (el.firstChild) {
      if (ui.dispose) ui.dispose(el.firstChild)
      el.removeChild(el.firstChild)
    }
  }

  function renderConnectionList(host, selected) {
    clear(host)
    const options = connectionOptions()
    const current = selected.peek()
    if (!findConnectionMeta(current, options) && options[0]) selected.set(options[0].id)
    const active = selected.peek()
    for (let i = 0; i < options.length; i++) {
      host.appendChild(connectionListItem(options[i], active, function (id) {
        selected.set(id)
      }))
    }
  }

  function updateConnectionListActive(host, activeId) {
    const items = host.querySelectorAll('.aeditor-settings-connection-item')
    for (let i = 0; i < items.length; i++) {
      items[i].toggleAttribute('data-active', items[i].getAttribute('data-connection-id') === activeId)
    }
  }

  function connectionListItem(meta, activeId, onSelect) {
    const item = ui.h('button', 'aeditor-settings-connection-item', { type: 'button' })
    item.setAttribute('data-connection-id', meta.id)
    if (meta.id === activeId) item.setAttribute('data-active', 'true')
    item.appendChild(ui.h('span', 'aeditor-settings-connection-item-title', { text: meta.label || meta.id }))
    item.appendChild(ui.h('span', 'aeditor-settings-connection-item-meta', {
      text: [meta.provider || meta.id, meta.authType || 'none'].join(' / '),
    }))
    item.appendChild(ui.h('span', 'aeditor-settings-connection-item-status', { text: connectionStateText(meta.id) }))
    item.addEventListener('click', function () { onSelect(meta.id) })
    return item
  }

  function renderConnectionDetail(host, selected) {
    clear(host)
    const meta = findConnectionMeta(selected.peek(), connectionOptions())
    if (!meta) {
      host.appendChild(statusNote('No AI connection is registered.'))
      return
    }

    const connection = aeditor.ai && aeditor.ai.getConnection ? aeditor.ai.getConnection(meta.id) : null
    const card = ui.h('section', 'aeditor-settings-connection-card')
    const head = ui.h('div', 'aeditor-settings-connection-head')
    const copy = ui.h('div', 'aeditor-settings-connection-copy')
    copy.appendChild(ui.h('div', 'aeditor-settings-connection-title', { text: meta.label || meta.id }))
    copy.appendChild(ui.h('div', 'aeditor-settings-connection-subtitle', {
      text: connectionSummary(meta),
    }))
    head.appendChild(copy)

    const actions = ui.h('div', 'aeditor-settings-connection-actions')
    actions.appendChild(ui.h('span', 'aeditor-settings-provider-status', { text: connectionStateText(meta.id) }))
    if (aeditor.settings.get('ai.defaultConnection') !== meta.id) {
      actions.appendChild(ui.button({
        text: 'Use Default',
        size: 'sm',
        kind: 'primary',
        onClick: function () {
          activateConnection(meta.id)
          selected.set(meta.id)
        },
      }))
    }
    head.appendChild(actions)
    card.appendChild(head)

    const fields = ui.h('div', 'aeditor-settings-connection-fields')
    const status = ui.h('span', 'aeditor-settings-provider-status')
    if (meta.authType === 'subscriptionBridge') fields.appendChild(settingAuth(meta.id, status, meta.authType))
    const settings = connectionSettingsFor(meta.id, meta.label || meta.id, connection)
    for (let i = 0; i < settings.length; i++) {
      const field = settings[i]
      if (field.kind === 'model') field.action = modelLoadAction(meta.id, card, status)
      fields.appendChild(field.kind === 'switch'
        ? settingSwitch(field)
        : (field.kind === 'model' ? settingModel(field) : settingInput(field)))
    }
    card.appendChild(fields)
    host.appendChild(card)

    host.appendChild(statusNote(helpTextFor(meta)))
  }

  function findConnectionMeta(id, options) {
    for (let i = 0; i < options.length; i++) if (options[i].id === id) return options[i]
    return null
  }

  function connectionSummary(meta) {
    const parts = []
    parts.push(meta.provider || meta.id)
    if (meta.transportType) parts.push(meta.transportType)
    if (meta.authType) parts.push(meta.authType)
    return parts.join(' / ')
  }

  function connectionStateText(id) {
    const config = aeditor.ai && aeditor.ai.getConnectionConfig ? aeditor.ai.getConnectionConfig(id) : {}
    const connection = aeditor.ai && aeditor.ai.getConnection ? aeditor.ai.getConnection(id) : null
    const authType = connection && connection.auth && connection.auth.type || 'none'
    if (aeditor.settings.get('ai.defaultConnection') === id) return 'Default'
    if (authType === 'apiKey') return config.apiKey ? 'Configured' : 'Needs key'
    if (authType === 'subscriptionBridge' || authType === 'localBridge') return authStatusText(id)
    return 'Ready'
  }

  function helpTextFor(meta) {
    if (meta.authType === 'subscriptionBridge') {
      return 'Subscription connections use the Local Bridge for browser login. Keep the bridge running while using ChatGPT/Codex or Claude Code auth.'
    }
    if (meta.authType === 'apiKey') {
      return 'API keys are stored in local AEditor settings. For team or production use, prefer a trusted proxy or host-managed secret store.'
    }
    if (meta.provider === 'ollama') return 'Ollama uses the OpenAI-compatible local endpoint. Keep Ollama running before loading models.'
    return 'This connection is available without extra browser-side credentials.'
  }

  function modelLoadAction(connectionId, card, status) {
    const wrap = ui.h('div', 'aeditor-settings-model-action')
    wrap.appendChild(ui.iconButton({
      icon: 'refresh',
      title: 'Load models',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { loadModels(connectionId, card, status) },
    }))
    wrap.appendChild(status)
    return wrap
  }

  function connectionSettingsFor(id, label, connection) {
    const defaults = (connection && connection.configDefaults) || {}
    const out = []
    Object.keys(defaults).forEach(function (key) {
      out.push({
        kind: key === 'stream' ? 'switch' : (key === 'defaultModel' ? 'model' : 'input'),
        connectionId: id,
        key: aeditor.ai.connectionConfigKey(id, key),
        label: compactLabel(id, label, keyLabel(key)),
        type: key === 'apiKey' ? 'password' : 'text',
        placeholder: placeholderFor(key),
        defaultValue: defaults[key],
        desc: keyDesc(key, label),
      })
    })
    return out
  }

  function keyLabel(key) {
    if (key === 'baseUrl') return 'Base URL'
    if (key === 'apiKey') return 'API Key'
    if (key === 'defaultModel') return 'Default Model'
    if (key === 'stream') return 'Stream'
    if (key === 'responsePrefix') return 'Response Prefix'
    return key
  }

  function keyDesc(key, label) {
    if (key === 'baseUrl') return 'HTTP base URL for the ' + label + ' transport.'
    if (key === 'apiKey') return 'API key used by this connection.'
    if (key === 'defaultModel') return 'Fallback model when the model list has not been loaded.'
    if (key === 'stream') return 'Request streaming responses when the transport supports them.'
    if (key === 'responsePrefix') return 'Prefix used by the mock connection.'
    return ''
  }

  function compactLabel(id, providerLabel, label) {
    return String(label || '')
      .replace(/^OpenAI Compatible\s+/i, '')
      .replace(/^Anthropic Compatible\s+/i, '')
      .replace(/^Local Bridge\s+/i, '')
      .replace(/^Mock\s+/i, '')
      .replace(new RegExp('^' + String(providerLabel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '')
      .replace(new RegExp('^' + String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '')
  }

  function placeholderFor(key) {
    if (key === 'apiKey') return 'Stored locally'
    if (key === 'baseUrl') return 'https://...'
    if (key === 'defaultModel') return 'Model id'
    return ''
  }

  function settingInput(spec) {
    const current = aeditor.settings.get(spec.key)
    const value = aeditor.signal(current !== undefined ? current : (spec.defaultValue != null ? spec.defaultValue : ''))
    const row = settingRow(spec.label, spec.desc)
    const control = ui.h('div', 'aeditor-settings-field-control')
    control.appendChild(ui.input({
      value: value,
      type: spec.type || 'text',
      placeholder: spec.placeholder || '',
      onChange: function (v) {
        value.set(v)
        aeditor.settings.set(spec.key, v)
        if (spec.key.indexOf('.apiKey') >= 0 && v && spec.connectionId) activateConnection(spec.connectionId)
      },
    }))
    row.appendChild(control)
    return row
  }

  function settingModel(spec) {
    const current = aeditor.settings.get(spec.key)
    const value = aeditor.signal(current !== undefined ? current : (spec.defaultValue != null ? spec.defaultValue : ''))
    const options = aeditor.signal(modelOptionsFor(spec.connectionId, value.peek()))
    const row = settingRow(spec.label, spec.desc)
    const control = ui.h('div', 'aeditor-settings-field-control aeditor-settings-model-control')
    control.appendChild(ui.combobox({
      value: value,
      options: options,
      placeholder: spec.placeholder || 'Load models or enter model id',
      onChange: function (v) {
        value.set(v)
        aeditor.settings.set(spec.key, v)
        if (spec.connectionId) syncActiveAgentModel(spec.connectionId, v)
      },
    }))
    if (spec.action) control.appendChild(spec.action)
    row.appendChild(control)
    if (aeditor.ai && aeditor.ai.models) {
      ui.collect(row, aeditor.effect(function () {
        options.set(modelOptionsFor(spec.connectionId, value()))
      }))
    }
    return row
  }

  function modelOptionsFor(connectionId, current) {
    const map = aeditor.ai && aeditor.ai.models ? aeditor.ai.models() : {}
    const list = map && map[connectionId] ? map[connectionId] : []
    const hints = aeditor.ai && aeditor.ai.modelHints ? aeditor.ai.modelHints(connectionId) : []
    const out = []
    let found = !current
    for (let h = 0; h < hints.length; h++) {
      if (hints[h] === current) found = true
      out.push({ value: hints[h], label: hints[h] })
    }
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      const value = item.value || item.id || item.name || item.model
      if (value === current) found = true
      if (containsOption(out, value)) continue
      out.push({ value: value, label: item.label || item.name || value })
    }
    if (current && !found) out.unshift({ value: current, label: current })
    return out
  }

  function containsOption(options, value) {
    for (let i = 0; i < options.length; i++) if (options[i].value === value) return true
    return false
  }

  function settingSelect(spec) {
    const value = aeditor.signal(aeditor.settings.get(spec.key) || '')
    const row = settingRow(spec.label, spec.desc)
    if (spec.compact) row.classList.add('aeditor-settings-field-compact')
    const control = ui.h('div', 'aeditor-settings-field-control')
    control.appendChild(ui.select({
      value: value,
      options: spec.options(),
      onChange: function (v) {
        value.set(v)
        aeditor.settings.set(spec.key, v)
        if (spec.key === 'ai.defaultConnection') activateConnection(v)
        if (spec.onChange) spec.onChange(v)
      },
    }))
    row.appendChild(control)
    return row
  }

  function settingSwitch(spec) {
    const current = aeditor.settings.get(spec.key)
    const value = aeditor.signal(current !== undefined ? !!current : !!spec.defaultValue)
    const row = settingRow(spec.label, spec.desc)
    const control = ui.h('div', 'aeditor-settings-field-control')
    control.appendChild(ui.switch({
      value: value,
      onChange: function (v) {
        value.set(v)
        aeditor.settings.set(spec.key, v)
      },
    }))
    row.appendChild(control)
    return row
  }

  function settingAuth(connectionId, status, authType) {
    const row = settingRow(
      'Auth',
      authType === 'subscriptionBridge'
        ? 'Uses Local Bridge to open the provider login page and store account auth outside this browser page.'
        : 'Connects to a trusted Local Bridge running on this machine.'
    )
    const actions = ui.h('div', 'aeditor-settings-auth-actions')
    const loginBtn = ui.button({
      text: 'Login with Browser',
      size: 'sm',
      kind: 'primary',
      onClick: function () { loginConnection(connectionId, status, loginBtn, logoutBtn) },
    })
    const logoutBtn = ui.button({
      text: 'Logout',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { logoutConnection(connectionId, status, loginBtn, logoutBtn) },
    })
    const refreshBtn = ui.iconButton({
      icon: 'refresh',
      title: 'Refresh auth status',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint) },
    })
    const bridgeHint = ui.h('span', 'aeditor-settings-auth-hint')
    actions.appendChild(loginBtn)
    actions.appendChild(refreshBtn)
    actions.appendChild(logoutBtn)
    actions.appendChild(bridgeHint)
    actions.appendChild(status)
    row.appendChild(actions)
    setAuthState(connectionId, status, loginBtn, logoutBtn, null, bridgeHint)
    refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint)
    return row
  }

  function settingRow(label, desc) {
    const row = ui.h('div', 'aeditor-settings-field')
    const copy = ui.h('div', 'aeditor-settings-field-copy')
    copy.appendChild(ui.h('span', 'aeditor-settings-field-label', { text: label }))
    if (desc) copy.appendChild(ui.h('span', 'aeditor-settings-field-desc', { text: desc }))
    row.appendChild(copy)
    return row
  }

  function statusNote(text) {
    return ui.h('div', 'aeditor-settings-note', { text: text })
  }

  function loadModels(connectionId, card, status) {
    if (!aeditor.ai || !aeditor.ai.refreshModels) return
    card.classList.add('aeditor-settings-provider-loading')
    if (status) status.textContent = 'Loading...'
    aeditor.ai.refreshModels(connectionId).then(function (models) {
      card.classList.remove('aeditor-settings-provider-loading')
      card.classList.add('aeditor-settings-provider-ok')
      if (status) status.textContent = models && models.length ? String(models.length) + ' models' : 'No models returned'
      activateConnection(connectionId)
      setTimeout(function () { card.classList.remove('aeditor-settings-provider-ok') }, 900)
    }, function (err) {
      card.classList.remove('aeditor-settings-provider-loading')
      if (status) status.textContent = 'Load failed'
      if (aeditor.reportError) aeditor.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function loginConnection(connectionId, status, loginBtn, logoutBtn) {
    if (!aeditor.ai || !aeditor.ai.loginConnection) return
    if (loginBtn && loginBtn.disabled) return
    let popup = null
    try {
      if (window.open) popup = window.open('about:blank', '_blank')
      if (popup && popup.document) {
        popup.document.title = 'AI Login'
        popup.document.body.style.font = '14px system-ui, sans-serif'
        popup.document.body.style.padding = '24px'
        popup.document.body.textContent = 'Connecting to local AI bridge...'
      }
    } catch (_) {}
    if (status) status.textContent = 'Signing in...'
    if (loginBtn) loginBtn.disabled = true
    aeditor.ai.loginConnection(connectionId, { popup: popup }).then(function (next) {
      setAuthState(connectionId, status, loginBtn, logoutBtn, next)
      activateConnection(connectionId)
    }, function (err) {
      const message = loginErrorMessage(err)
      if (popup && popup.document) {
        popup.document.title = 'AI Login Failed'
        popup.document.body.style.font = '14px system-ui, sans-serif'
        popup.document.body.style.padding = '24px'
        popup.document.body.style.lineHeight = '1.5'
        popup.document.body.textContent = message
      }
      if (status) status.textContent = message
      if (loginBtn) {
        loginBtn.style.display = ''
        loginBtn.disabled = false
      }
      if (logoutBtn) logoutBtn.style.display = 'none'
      if (aeditor.reportError) aeditor.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function logoutConnection(connectionId, status, loginBtn, logoutBtn) {
    if (!aeditor.ai || !aeditor.ai.logoutConnection) return
    if (status) status.textContent = 'Signing out...'
    aeditor.ai.logoutConnection(connectionId).then(function (next) {
      setAuthState(connectionId, status, loginBtn, logoutBtn, next || { state: 'signed_out' })
    }, function (err) {
      if (status) status.textContent = 'Logout failed'
      if (aeditor.reportError) aeditor.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint) {
    if (!aeditor.ai || !aeditor.ai.refreshAuthStatus) return
    if (loginBtn) loginBtn.disabled = true
    if (status) status.textContent = 'Checking...'
    aeditor.ai.refreshAuthStatus(connectionId).then(function (next) {
      setAuthState(connectionId, status, loginBtn, logoutBtn, next, bridgeHint)
    }, function (err) {
      if (status) status.textContent = bridgeUnavailableText(err)
      if (bridgeHint) bridgeHint.textContent = authFixHint(err)
      if (loginBtn) {
        loginBtn.style.display = ''
        loginBtn.disabled = true
        loginBtn.title = authFixHint(err)
      }
      if (logoutBtn) logoutBtn.style.display = 'none'
    })
  }

  function authStatusText(connectionId) {
    const status = aeditor.ai && aeditor.ai.authStatus ? aeditor.ai.authStatus(connectionId) : null
    return status && status.state ? status.state : 'Not signed in'
  }

  function authResultText(result, fallback) {
    if (!result) return fallback
    const parts = []
    if (result.state) parts.push(result.state)
    if (result.userCode) parts.push('code ' + result.userCode)
    if (result.verificationUrl || result.loginUrl || result.url) parts.push('browser opened')
    return parts.length ? parts.join(' / ') : fallback
  }

  function loginErrorMessage(err) {
    const raw = err && err.message ? err.message : String(err || 'Unknown error')
    if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
      return 'Local AI bridge is not reachable. Start it with `npm run bridge`, then try Login with Browser again.'
    }
    if (/Codex app-server exited|spawn codex ENOENT|Unknown bridge connection/i.test(raw)) {
      return 'Codex CLI is not available. Install it with `npm i -g @openai/codex@latest`, restart the bridge, then try again.'
    }
    return 'Login failed: ' + raw
  }

  function bridgeUnavailableText(err) {
    const raw = err && err.message ? err.message : String(err || '')
    if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return 'Bridge offline'
    if (/Codex app-server exited|spawn codex ENOENT/i.test(raw)) return 'Codex CLI unavailable'
    return 'Bridge error'
  }

  function authFixHint(err) {
    const raw = err && err.message ? err.message : String(err || '')
    if (/Codex app-server exited|spawn codex ENOENT/i.test(raw)) return 'Install: npm i -g @openai/codex@latest'
    return 'Start: npm run bridge'
  }

  function setAuthState(connectionId, status, loginBtn, logoutBtn, next, bridgeHint) {
    const result = next || (aeditor.ai && aeditor.ai.authStatus ? aeditor.ai.authStatus(connectionId) : null)
    const state = result && result.state
    if (status) status.textContent = authResultText(result, state || 'Not signed in')
    const signedIn = state === 'signed_in'
    if (bridgeHint) bridgeHint.textContent = ''
    if (loginBtn) {
      loginBtn.style.display = signedIn ? 'none' : ''
      loginBtn.disabled = false
      loginBtn.title = ''
    }
    if (logoutBtn) logoutBtn.style.display = signedIn ? '' : 'none'
  }

  function activateConnection(connectionId) {
    if (!connectionId || !aeditor.ai) return
    aeditor.settings.set('ai.defaultConnection', connectionId)
    if (aeditor.ai.setActiveConnection) aeditor.ai.setActiveConnection(connectionId)
    const agent = aeditor.ai.getActiveAgent ? aeditor.ai.getActiveAgent() : null
    if (!agent || !aeditor.ai.updateAgent) return
    if (agent.connection && agent.connection !== 'mock' && agent.connection !== connectionId) return
    const config = aeditor.ai.getConnectionConfig ? aeditor.ai.getConnectionConfig(connectionId) : {}
    const opts = modelOptionsFor(connectionId, config.defaultModel || agent.model)
    const nextModel = config.defaultModel || (opts.length ? opts[0].value : '')
    aeditor.ai.updateAgent(agent.id, {
      connection: connectionId,
      model: nextModel,
      stream: !!config.stream,
    })
  }

  function syncActiveAgentModel(connectionId, modelId) {
    if (!connectionId || !modelId || !aeditor.ai || !aeditor.ai.getActiveAgent || !aeditor.ai.updateAgent) return
    const agent = aeditor.ai.getActiveAgent()
    if (!agent || agent.connection !== connectionId) return
    aeditor.ai.updateAgent(agent.id, { model: modelId })
  }

  function addCustomConnection(root) {
    if (!aeditor.ai || !aeditor.ai.createCustomConnection) return
    ui.prompt({
      title: 'Add AI Connection',
      message: 'Connection name',
      placeholder: 'My Provider',
      okLabel: 'Next',
    }).then(function (name) {
      if (name == null) return
      ui.prompt({
        title: 'Add AI Connection',
        message: 'OpenAI-compatible Base URL',
        placeholder: 'https://api.example.com/v1',
        okLabel: 'Add',
      }).then(function (baseUrl) {
        if (baseUrl == null) return
        const c = aeditor.ai.createCustomConnection({ label: name || 'Custom OpenAI', baseUrl: baseUrl })
        activateConnection(c.id)
        if (ui.toast) ui.toast({ kind: 'success', message: 'Connection added' })
        refreshSettingsPage(root)
      })
    })
  }

  function refreshSettingsPage(root) {
    const parent = root.parentNode
    if (!parent) return
    const next = renderAiSettings()
    parent.replaceChild(next, root)
  }

  function aiSearchText() {
    const parts = ['AI connection provider api key auth login sign in model base url custom provider local bridge ChatGPT Codex Claude Code OpenAI Anthropic DeepSeek Ollama OpenRouter Groq Mistral xAI']
    const options = connectionOptions()
    for (let i = 0; i < options.length; i++) {
      const id = options[i].id
      const conn = aeditor.ai && aeditor.ai.getConnection && aeditor.ai.getConnection(id)
      const config = conn && conn.configDefaults || {}
      parts.push([id, options[i].label, options[i].provider, options[i].authType, options[i].transportType, Object.keys(config).join(' '), Object.keys(config).map(function (k) { return config[k] }).join(' ')].join(' '))
    }
    return parts.join(' ')
  }
})(window.aeditor = window.aeditor || {})
