// Built-in settings sections for EditorFrame.
;(function (EF) {
  'use strict'

  if (!EF.settings) return

  EF.settings.registerSection('theme', {
    title: 'Theme',
    icon: 'palette',
    description: 'EditorFrame appearance and visual density.',
    order: 10,
  })

  EF.settings.registerSchema('theme', [
    {
      key: 'theme.mode',
      label: 'Mode',
      type: 'select',
      default: 'dark',
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'light', label: 'Light' },
      ],
      description: 'Active EditorFrame theme.',
      order: 10,
    },
    {
      key: 'theme.density',
      label: 'Density',
      type: 'select',
      default: 'default',
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'default', label: 'Default' },
        { value: 'comfortable', label: 'Comfortable' },
      ],
      description: 'Typography density and default UI text scale.',
      order: 20,
    },
  ])

  EF.settings.registerPage('theme-editor', {
    section: 'theme',
    title: 'Appearance',
    icon: 'sliders',
    order: 0,
    replacesSchema: true,
    factory: renderThemeSettings,
  })

  EF.effect(function () {
    const mode = EF.settings.get('theme.mode')
    if (EF.theme && EF.theme.set) EF.theme.set(mode || 'dark')
    const density = EF.settings.get('theme.density')
    if (EF.theme && EF.theme.setDensity) EF.theme.setDensity(density || 'default')
  })

  EF.settings.registerSection('ai', {
    title: 'AI',
    icon: 'user',
    description: 'Connections, auth methods, models, and local bridge settings.',
    order: 20,
  })

  EF.settings.registerSchema('ai', [
    {
      key: 'ai.defaultConnection',
      label: 'Default Connection',
      type: 'select',
      default: 'mock',
      options: function () {
        if (EF.ai && EF.ai.connectionOptions) {
          return EF.ai.connectionOptions().map(function (item) {
            return { value: item.id, label: item.label || item.id }
          })
        }
        const list = EF.ai && EF.ai.listConnections ? EF.ai.listConnections() : ['mock']
        return list.map(function (id) { return { value: id, label: id } })
      },
      description: 'Connection used by newly created agents.',
      order: 10,
    },
  ])

  EF.effect(function () {
    if (!EF.ai || !EF.ai.setActiveConnection) return
    EF.ai.setActiveConnection(EF.settings.get('ai.defaultConnection') || 'mock')
  })

  EF.settings.registerPage('ai', {
    section: 'ai',
    title: 'Connections',
    icon: 'link',
    order: 0,
    replacesSchema: true,
    searchText: aiSearchText,
    factory: renderAiSettings,
  })

  function renderAiSettings() {
    const root = EF.ui.h('div', 'ef-settings-page ef-settings-ai-page')
    root.appendChild(pageHead(
      'AI',
      'Configure AI connections, auth methods, model defaults, and local bridge behavior.'
    ))

    const overview = EF.ui.h('div', 'ef-settings-ai-overview')
    overview.appendChild(settingSelect({
      key: 'ai.defaultConnection',
      label: 'Default connection',
      desc: 'New agents start with this connection. Existing agents keep their own connection.',
      options: function () {
        if (EF.ai && EF.ai.connectionOptions) {
          return EF.ai.connectionOptions().map(function (item) {
            return { value: item.id, label: item.label || item.id }
          })
        }
        return [{ value: 'mock', label: 'Mock' }]
      },
    }))
    overview.appendChild(statusNote(
      'Connections combine provider metadata, auth method, transport, and model defaults. Subscription auth such as ChatGPT/Codex or Claude Code should route through a Local Bridge.'
    ))
    root.appendChild(overview)

    const block = EF.ui.h('section', 'ef-settings-provider-block')
    const blockHead = EF.ui.h('div', 'ef-settings-provider-block-head')
    blockHead.appendChild(EF.ui.h('div', 'ef-settings-provider-block-title', { text: 'Connections' }))
    blockHead.appendChild(EF.ui.h('div', 'ef-settings-provider-block-desc', { text: 'Use Custom OpenAI Compatible for private endpoints. Framework plugins can register connections without replacing this page.' }))
    blockHead.appendChild(EF.ui.button({
      text: 'Add Connection',
      icon: 'plus',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { addCustomConnection(root) },
    }))
    block.appendChild(blockHead)
    const list = EF.ui.h('div', 'ef-settings-provider-list')
    const connections = EF.ai && EF.ai.connectionOptions ? EF.ai.connectionOptions() : [{ id: 'mock', label: 'Mock' }]
    for (let i = 0; i < connections.length; i++) list.appendChild(connectionRow(connections[i]))
    block.appendChild(list)
    root.appendChild(block)
    return root
  }

  const THEME_STORAGE_KEY = 'ef-theme-overrides-v2'
  const THEME_MODE_KEY = 'ef-theme-mode'
  const THEME_DENSITY_KEY = 'ef-theme-density'
  const THEME_TABS = [
    { value: 'palette', label: 'Palette' },
    { value: 'spacing', label: 'Spacing' },
    { value: 'sizing', label: 'Sizing' },
    { value: 'radius', label: 'Radius' },
    { value: 'typography', label: 'Typography' },
    { value: 'motion', label: 'Motion' },
  ]
  const PALETTE = [
    ['--ef-surface-canvas', 'Surface / Canvas'],
    ['--ef-surface-lower', 'Surface / Lower'],
    ['--ef-surface-frame', 'Surface / Frame'],
    ['--ef-surface-panel', 'Surface / Panel'],
    ['--ef-surface-field', 'Surface / Field'],
    ['--ef-surface-hover', 'Surface / Hover'],
    ['--ef-surface-active', 'Surface / Active'],
    ['--ef-surface-raised', 'Surface / Raised'],
    ['--ef-text-primary', 'Text / Primary'],
    ['--ef-text-body', 'Text / Body'],
    ['--ef-text-label', 'Text / Label'],
    ['--ef-text-muted', 'Text / Muted'],
    ['--ef-text-disabled', 'Text / Disabled'],
    ['--ef-stroke-subtle', 'Stroke / Subtle'],
    ['--ef-stroke-strong', 'Stroke / Strong'],
    ['--ef-stroke-field', 'Stroke / Field'],
    ['--ef-stroke-hover', 'Stroke / Hover'],
    ['--ef-brand', 'Brand / Accent'],
    ['--ef-brand-hover', 'Brand / Hover'],
    ['--ef-brand-contrast', 'Brand / Contrast'],
    ['--ef-state-success', 'State / Success'],
    ['--ef-state-warning', 'State / Warning'],
    ['--ef-state-danger', 'State / Danger'],
    ['--ef-state-info', 'State / Info'],
  ]
  const SPACING = [
    ['--ef-space-1', 'Tight gap', 0, 32],
    ['--ef-space-2', 'Control gap', 0, 32],
    ['--ef-space-3', 'Row gap', 0, 64],
    ['--ef-space-4', 'Panel padding', 0, 64],
    ['--ef-space-5', 'Section gap', 0, 96],
    ['--ef-space-6', 'Large gap', 0, 128],
  ]
  const SIZING = [
    ['--ef-size-h-xs', 'Control height xs', 12, 40],
    ['--ef-size-h-sm', 'Control height sm', 14, 44],
    ['--ef-size-h-md', 'Control height md', 16, 48],
    ['--ef-size-h-lg', 'Control height lg', 18, 56],
    ['--ef-toolbar-h', 'Toolbar height', 16, 60],
    ['--ef-tab-h', 'Tab height', 16, 60],
  ]
  const RADIUS = [
    ['--ef-r-1', 'Tiny radius', 0, 24],
    ['--ef-r-2', 'Control radius', 0, 24],
    ['--ef-r-3', 'Panel radius', 0, 24],
    ['--ef-r-4', 'Floating radius', 0, 24],
  ]
  const TYPO_PX = [
    ['--ef-fs-xs', 'Font size xs', 8, 24],
    ['--ef-fs-sm', 'Font size sm', 8, 24],
    ['--ef-fs-md', 'Font size md', 8, 28],
    ['--ef-fs-lg', 'Font size lg', 8, 32],
    ['--ef-fs-xl', 'Font size xl', 8, 36],
  ]
  const MOTION_MS = [
    ['--ef-dur-fast', 'Fast', 0, 1000],
    ['--ef-dur-med', 'Med', 0, 1000],
    ['--ef-dur-slow', 'Slow', 0, 1000],
  ]

  function renderThemeSettings() {
    const ui = EF.ui
    const root = ui.h('div', 'ef-settings-page ef-settings-theme-page')
    root.appendChild(pageHead('Theme', 'EditorFrame appearance and visual density.'))

    const bar = ui.h('div', 'ef-settings-theme-bar')
    const tabSig = EF.signal('palette')
    const modeSig = EF.signal(EF.settings.get('theme.mode') || localStorage.getItem(THEME_MODE_KEY) || 'dark')
    const densitySig = EF.signal(EF.settings.get('theme.density') || localStorage.getItem(THEME_DENSITY_KEY) || 'default')
    const tabs = ui.segmented({ value: tabSig, options: THEME_TABS })
    tabs.classList.add('ef-settings-theme-tabs')
    const mode = ui.select({
      value: modeSig,
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'light', label: 'Light' },
      ],
      variant: 'minimal',
      autoWidth: true,
    })
    const density = ui.select({
      value: densitySig,
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'default', label: 'Default' },
        { value: 'comfortable', label: 'Comfortable' },
      ],
      variant: 'minimal',
      autoWidth: true,
    })
    const reset = ui.button({
      text: 'Reset',
      kind: 'ghost',
      size: 'sm',
      onClick: function () {
        clearThemeOverrides()
        refreshAll()
        if (ui.toast) ui.toast({ kind: 'success', message: 'Theme reset' })
      },
    })
    const exportBtn = ui.button({
      text: 'Export',
      kind: 'ghost',
      size: 'sm',
      onClick: function () {
        const text = EF.theme && EF.theme.exportCss ? EF.theme.exportCss() : ''
        ui.copyText(text)
        if (ui.toast) ui.toast({ kind: 'info', title: 'CSS copied', message: text })
      },
    })
    bar.appendChild(tabs)
    bar.appendChild(mode)
    bar.appendChild(density)
    bar.appendChild(reset)
    bar.appendChild(exportBtn)
    root.appendChild(bar)

    const allSigs = []
    const host = ui.h('div', 'ef-settings-theme-host')
    const scroll = ui.scrollArea({ children: host })
    scroll.classList.add('ef-settings-theme-scroll')
    root.appendChild(scroll)

    function track(sig, name, parse, format) {
      allSigs.push({ sig: sig, name: name, parse: parse, format: format })
    }
    function bindWriter(sig, name, format) {
      ui.collect(root, EF.effect(function () {
        const literal = format ? format(sig()) : sig()
        const effective = readThemeToken(name)
        if (effective === literal) return
        writeThemeToken(name, literal)
      }))
    }
    function refreshAll() {
      for (let i = 0; i < allSigs.length; i++) document.documentElement.style.removeProperty(allSigs[i].name)
      for (let i = 0; i < allSigs.length; i++) {
        const it = allSigs[i]
        const v = readThemeToken(it.name)
        const next = it.parse ? it.parse(v) : v
        if (it.sig.peek() !== next) it.sig.set(next)
      }
    }

    let didMountMode = false
    ui.collect(root, EF.effect(function () {
      const value = modeSig()
      EF.settings.set('theme.mode', value)
      localStorage.setItem(THEME_MODE_KEY, value)
      if (EF.theme && EF.theme.set) EF.theme.set(value)
      if (!didMountMode) {
        didMountMode = true
        return
      }
      clearThemeOverrides()
      refreshAll()
    }))

    ui.collect(root, EF.effect(function () {
      const value = densitySig()
      EF.settings.set('theme.density', value)
      localStorage.setItem(THEME_DENSITY_KEY, value)
      if (EF.theme && EF.theme.setDensity) EF.theme.setDensity(value)
    }))

    const panes = {}
    function pane(key) {
      if (panes[key]) return panes[key]
      if (key === 'palette') panes[key] = buildPalette(track, bindWriter)
      else if (key === 'spacing') panes[key] = buildPxRows(SPACING, track, bindWriter, 'px')
      else if (key === 'sizing') panes[key] = buildPxRows(SIZING, track, bindWriter, 'px')
      else if (key === 'radius') panes[key] = buildPxRows(RADIUS, track, bindWriter, 'px')
      else if (key === 'typography') panes[key] = buildTypography(track, bindWriter)
      else panes[key] = buildPxRows(MOTION_MS, track, bindWriter, 'ms')
      return panes[key]
    }

    ui.collect(root, EF.effect(function () {
      while (host.firstChild) host.removeChild(host.firstChild)
      host.appendChild(pane(tabSig()))
    }))
    return root
  }

  function readThemeToken(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  }

  function readThemeOverrides() {
    try { return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}') } catch (_) { return {} }
  }

  function writeThemeToken(name, value) {
    document.documentElement.style.setProperty(name, value)
    const overrides = readThemeOverrides()
    overrides[name] = value
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(overrides))
  }

  function clearThemeOverrides() {
    const overrides = readThemeOverrides()
    for (const key in overrides) document.documentElement.style.removeProperty(key)
    localStorage.removeItem(THEME_STORAGE_KEY)
  }

  function pxNum(s) {
    const m = /^(-?[\d.]+)/.exec(s || '')
    return m ? Number(m[1]) : 0
  }

  function buildPalette(track, bindWriter) {
    const wrap = EF.ui.h('div', 'ef-settings-theme-pane ef-settings-theme-palette')
    for (let i = 0; i < PALETTE.length; i++) {
      const name = PALETTE[i][0]
      const sig = EF.signal(readThemeToken(name) || '#000000')
      track(sig, name, null, null)
      bindWriter(sig, name, null)
      wrap.appendChild(EF.ui.propRow({ label: PALETTE[i][1], control: EF.ui.colorInput({ value: sig }) }))
    }
    return wrap
  }

  function buildPxRows(catalog, track, bindWriter, unit) {
    const wrap = EF.ui.h('div', 'ef-settings-theme-pane')
    const format = function (v) { return v + unit }
    for (let i = 0; i < catalog.length; i++) {
      const row = catalog[i]
      const sig = EF.signal(pxNum(readThemeToken(row[0])))
      track(sig, row[0], pxNum, format)
      bindWriter(sig, row[0], format)
      wrap.appendChild(EF.ui.propRow({
        label: row[1],
        control: EF.ui.numberInput({ value: sig, min: row[2], max: row[3], step: unit === 'ms' ? 10 : 1, suffix: unit }),
      }))
    }
    return wrap
  }

  function buildTypography(track, bindWriter) {
    const wrap = EF.ui.h('div', 'ef-settings-theme-pane')
    const uiFont = EF.signal(readThemeToken('--ef-font-ui'))
    track(uiFont, '--ef-font-ui', null, null)
    bindWriter(uiFont, '--ef-font-ui', null)
    wrap.appendChild(EF.ui.propRow({ label: 'UI font', control: EF.ui.input({ value: uiFont }) }))
    const monoFont = EF.signal(readThemeToken('--ef-font-mono'))
    track(monoFont, '--ef-font-mono', null, null)
    bindWriter(monoFont, '--ef-font-mono', null)
    wrap.appendChild(EF.ui.propRow({ label: 'Mono font', control: EF.ui.input({ value: monoFont }) }))
    const sizes = buildPxRows(TYPO_PX, track, bindWriter, 'px')
    while (sizes.firstChild) wrap.appendChild(sizes.firstChild)
    return wrap
  }

  function pageHead(title, desc) {
    const head = EF.ui.h('div', 'ef-settings-page-head')
    head.appendChild(EF.ui.h('div', 'ef-settings-page-title', { text: title }))
    head.appendChild(EF.ui.h('div', 'ef-settings-page-desc', { text: desc }))
    return head
  }

  function connectionRow(meta) {
    const connection = EF.ai && EF.ai.getConnection ? EF.ai.getConnection(meta.id) : null
    const settings = connectionSettingsFor(meta.id, meta.label || meta.id, connection)
    const card = EF.ui.h('section', 'ef-settings-provider-row')
    const head = EF.ui.h('div', 'ef-settings-provider-head')
    const title = EF.ui.h('div', 'ef-settings-provider-title')
    title.appendChild(EF.ui.h('span', null, { text: meta.label || meta.id }))
    head.appendChild(title)
    const status = EF.ui.h('div', 'ef-settings-provider-status')
    card.appendChild(head)
    const fields = EF.ui.h('div', 'ef-settings-provider-fields')
    if (meta.authType === 'subscriptionBridge') {
      fields.appendChild(settingAuth(meta.id, status, meta.authType))
    }
    for (let i = 0; i < settings.length; i++) {
      const field = settings[i]
      if (field.kind === 'model') {
        field.action = modelLoadAction(meta.id, card, status)
      }
      fields.appendChild(field.kind === 'switch'
        ? settingSwitch(field)
        : (field.kind === 'model' ? settingModel(field) : settingInput(field)))
    }
    card.appendChild(fields)
    return card
  }

  function modelLoadAction(connectionId, card, status) {
    const wrap = EF.ui.h('div', 'ef-settings-model-action')
    wrap.appendChild(EF.ui.iconButton({
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
        key: EF.ai.connectionConfigKey(id, key),
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
    if (key === 'apiKey') return 'API key used by this connection. Browser keys are for personal/local use.'
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
    if (key.indexOf('.apiKey') >= 0) return 'Stored locally'
    if (key.indexOf('.baseUrl') >= 0) return 'https://...'
    if (key.indexOf('.defaultModel') >= 0) return 'Model id'
    return ''
  }

  function settingInput(spec) {
    const current = EF.settings.get(spec.key)
    const value = EF.signal(current !== undefined ? current : (spec.defaultValue != null ? spec.defaultValue : ''))
    const row = settingRow(spec.label, spec.desc)
    row.appendChild(EF.ui.input({
      value: value,
      type: spec.type || 'text',
      placeholder: spec.placeholder || '',
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
        if (spec.key.indexOf('.apiKey') >= 0 && v && spec.connectionId) activateConnection(spec.connectionId)
      },
    }))
    return row
  }

  function settingModel(spec) {
    const current = EF.settings.get(spec.key)
    const value = EF.signal(current !== undefined ? current : (spec.defaultValue != null ? spec.defaultValue : ''))
    const options = EF.signal(modelOptionsFor(spec.connectionId, value.peek()))
    const row = settingRow(spec.label, spec.desc)
    const control = EF.ui.h('div', 'ef-settings-field-control ef-settings-model-control')
    control.appendChild(EF.ui.combobox({
      value: value,
      options: options,
      placeholder: spec.placeholder || 'Load models or enter model id',
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
        if (spec.connectionId) syncActiveAgentModel(spec.connectionId, v)
      },
    }))
    if (spec.action) control.appendChild(spec.action)
    row.appendChild(control)
    if (EF.ai && EF.ai.models) {
      EF.ui.collect(row, EF.effect(function () {
        options.set(modelOptionsFor(spec.connectionId, value()))
      }))
    }
    return row
  }

  function modelOptionsFor(connectionId, current) {
    const map = EF.ai && EF.ai.models ? EF.ai.models() : {}
    const list = map && map[connectionId] ? map[connectionId] : []
    const hints = EF.ai && EF.ai.modelHints ? EF.ai.modelHints(connectionId) : []
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
    const value = EF.signal(EF.settings.get(spec.key) || '')
    const row = settingRow(spec.label, spec.desc)
    row.appendChild(EF.ui.select({
      value: value,
      options: spec.options(),
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
        if (spec.key === 'ai.defaultConnection') activateConnection(v)
      },
    }))
    return row
  }

  function settingSwitch(spec) {
    const current = EF.settings.get(spec.key)
    const value = EF.signal(current !== undefined ? !!current : !!spec.defaultValue)
    const row = settingRow(spec.label, spec.desc)
    row.appendChild(EF.ui.switch({
      value: value,
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
      },
    }))
    return row
  }

  function settingAuth(connectionId, status, authType) {
    const row = settingRow(
      'Auth',
      authType === 'subscriptionBridge'
        ? 'Uses Local Bridge to open the provider login page and store account auth outside this browser page.'
        : 'Connects to a trusted Local Bridge running on this machine.'
    )
    const actions = EF.ui.h('div', 'ef-settings-auth-actions')
    const loginBtn = EF.ui.button({
      text: 'Login with Browser',
      size: 'sm',
      kind: 'primary',
      onClick: function () { loginConnection(connectionId, status, loginBtn, logoutBtn) },
    })
    const logoutBtn = EF.ui.button({
      text: 'Logout',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { logoutConnection(connectionId, status, loginBtn, logoutBtn) },
    })
    const refreshBtn = EF.ui.iconButton({
      icon: 'refresh',
      title: 'Refresh auth status',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint) },
    })
    const bridgeHint = EF.ui.h('span', 'ef-settings-auth-hint')
    actions.appendChild(loginBtn)
    actions.appendChild(refreshBtn)
    actions.appendChild(logoutBtn)
    actions.appendChild(bridgeHint)
    setAuthState(connectionId, status, loginBtn, logoutBtn, null, bridgeHint)
    actions.appendChild(status)
    row.appendChild(actions)
    refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint)
    return row
  }

  function settingRow(label, desc) {
    const row = EF.ui.h('div', 'ef-settings-field')
    const copy = EF.ui.h('div', 'ef-settings-field-copy')
    copy.appendChild(EF.ui.h('span', 'ef-settings-field-label', { text: label }))
    if (desc) copy.appendChild(EF.ui.h('span', 'ef-settings-field-desc', { text: desc }))
    row.appendChild(copy)
    return row
  }

  function statusNote(text) {
    return EF.ui.h('div', 'ef-settings-note', { text: text })
  }

  function loadModels(connectionId, card, status) {
    if (!EF.ai || !EF.ai.refreshModels) return
    card.classList.add('ef-settings-provider-loading')
    if (status) status.textContent = 'Loading...'
    EF.ai.refreshModels(connectionId).then(function (models) {
      card.classList.remove('ef-settings-provider-loading')
      card.classList.add('ef-settings-provider-ok')
      if (status) status.textContent = models && models.length ? String(models.length) + ' models' : 'No models returned'
      activateConnection(connectionId)
      setTimeout(function () { card.classList.remove('ef-settings-provider-ok') }, 900)
    }, function (err) {
      card.classList.remove('ef-settings-provider-loading')
      if (status) status.textContent = 'Load failed'
      if (EF.reportError) EF.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function loginConnection(connectionId, status, loginBtn, logoutBtn) {
    if (!EF.ai || !EF.ai.loginConnection) return
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
    EF.ai.loginConnection(connectionId, { popup: popup }).then(function (next) {
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
      if (EF.reportError) EF.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function logoutConnection(connectionId, status, loginBtn, logoutBtn) {
    if (!EF.ai || !EF.ai.logoutConnection) return
    if (status) status.textContent = 'Signing out...'
    EF.ai.logoutConnection(connectionId).then(function (next) {
      setAuthState(connectionId, status, loginBtn, logoutBtn, next || { state: 'signed_out' })
    }, function (err) {
      if (status) status.textContent = 'Logout failed'
      if (EF.reportError) EF.reportError({ scope: 'settings', connection: connectionId }, err)
    })
  }

  function refreshAuthStatus(connectionId, status, loginBtn, logoutBtn, bridgeHint) {
    if (!EF.ai || !EF.ai.refreshAuthStatus) return
    if (loginBtn) loginBtn.disabled = true
    if (status) status.textContent = 'Checking...'
    EF.ai.refreshAuthStatus(connectionId).then(function (next) {
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
    const status = EF.ai && EF.ai.authStatus ? EF.ai.authStatus(connectionId) : null
    return status && status.state ? status.state : 'Not signed in'
  }

  function authResultText(result, fallback) {
    if (!result) return fallback
    const parts = []
    if (result.state) parts.push(result.state)
    if (result.userCode) parts.push('code ' + result.userCode)
    if (result.verificationUrl || result.loginUrl || result.url) parts.push('browser opened')
    return parts.length ? parts.join(' · ') : fallback
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
    const result = next || (EF.ai && EF.ai.authStatus ? EF.ai.authStatus(connectionId) : null)
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
    if (!connectionId || !EF.ai) return
    EF.settings.set('ai.defaultConnection', connectionId)
    if (EF.ai.setActiveConnection) EF.ai.setActiveConnection(connectionId)
    const agent = EF.ai.getActiveAgent ? EF.ai.getActiveAgent() : null
    if (!agent || !EF.ai.updateAgent) return
    if (agent.connection && agent.connection !== 'mock' && agent.connection !== connectionId) return
    const config = EF.ai.getConnectionConfig ? EF.ai.getConnectionConfig(connectionId) : {}
    const opts = modelOptionsFor(connectionId, config.defaultModel || agent.model)
    const nextModel = config.defaultModel || (opts.length ? opts[0].value : '')
    EF.ai.updateAgent(agent.id, {
      connection: connectionId,
      model: nextModel,
      stream: !!config.stream,
    })
  }

  function syncActiveAgentModel(connectionId, modelId) {
    if (!connectionId || !modelId || !EF.ai || !EF.ai.getActiveAgent || !EF.ai.updateAgent) return
    const agent = EF.ai.getActiveAgent()
    if (!agent || agent.connection !== connectionId) return
    EF.ai.updateAgent(agent.id, { model: modelId })
  }

  function addCustomConnection(root) {
    if (!EF.ai || !EF.ai.createCustomConnection) return
    const ui = EF.ui
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
        const c = EF.ai.createCustomConnection({ label: name || 'Custom OpenAI', baseUrl: baseUrl })
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
    if (EF.ai && EF.ai.connectionOptions) {
      const options = EF.ai.connectionOptions()
      for (let i = 0; i < options.length; i++) {
        const id = options[i].id
        const conn = EF.ai.getConnection && EF.ai.getConnection(id)
        const config = conn && conn.configDefaults || {}
        parts.push([id, options[i].label, options[i].provider, options[i].authType, options[i].transportType, Object.keys(config).join(' '), Object.keys(config).map(function (k) { return config[k] }).join(' ')].join(' '))
      }
    }
    return parts.join(' ')
  }
})(window.EF = window.EF || {})
