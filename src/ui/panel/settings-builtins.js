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
  ])

  EF.settings.registerPage('theme-editor', {
    section: 'theme',
    title: 'Theme',
    icon: 'palette',
    order: 0,
    replacesSchema: true,
    factory: renderThemeSettings,
  })

  EF.effect(function () {
    const mode = EF.settings.get('theme.mode')
    if (EF.theme && EF.theme.set) EF.theme.set(mode || 'dark')
  })

  EF.settings.registerSection('ai', {
    title: 'AI',
    icon: 'user',
    description: 'Providers, models, access mode, and local bridge settings.',
    order: 20,
  })

  EF.settings.registerSchema('ai', [
    {
      key: 'ai.defaultProvider',
      label: 'Default Provider',
      type: 'select',
      default: 'mock',
      options: function () {
        if (EF.ai && EF.ai.providerOptions) {
          return EF.ai.providerOptions().map(function (item) {
            return { value: item.id, label: item.label || item.id }
          })
        }
        const list = EF.ai && EF.ai.listProviders ? EF.ai.listProviders() : ['mock']
        return list.map(function (id) { return { value: id, label: id } })
      },
      description: 'Provider used by newly created agents.',
      order: 10,
    },
  ])

  EF.effect(function () {
    if (!EF.ai || !EF.ai.setDefaultProvider) return
    EF.ai.setDefaultProvider(EF.settings.get('ai.defaultProvider') || 'mock')
  })

  EF.settings.registerPage('ai', {
    section: 'ai',
    title: 'AI',
    icon: 'user',
    order: 0,
    replacesSchema: true,
    factory: renderAiSettings,
  })

  function renderAiSettings() {
    const root = EF.ui.h('div', 'ef-settings-page ef-settings-ai-page')
    root.appendChild(pageHead(
      'AI',
      'Configure AI providers, local credentials, model defaults, and connection behavior.'
    ))

    const overview = EF.ui.h('div', 'ef-settings-ai-overview')
    overview.appendChild(settingSelect({
      key: 'ai.defaultProvider',
      label: 'Default provider',
      desc: 'New agents start with this provider. Existing agents keep their own provider.',
      options: function () {
        if (EF.ai && EF.ai.providerOptions) {
          return EF.ai.providerOptions().map(function (item) {
            return { value: item.id, label: item.label || item.id }
          })
        }
        return [{ value: 'mock', label: 'Mock' }]
      },
    }))
    overview.appendChild(statusNote(
      'Provider channels are registered by the framework or plugins. Browser API keys are for personal/local use; shared deployments should route through Local Bridge.'
    ))
    root.appendChild(overview)

    const block = EF.ui.h('section', 'ef-settings-provider-block')
    const blockHead = EF.ui.h('div', 'ef-settings-provider-block-head')
    blockHead.appendChild(EF.ui.h('div', 'ef-settings-provider-block-title', { text: 'Connections' }))
    blockHead.appendChild(EF.ui.h('div', 'ef-settings-provider-block-desc', { text: 'Use the Custom OpenAI Compatible channel for private endpoints. Framework plugins can register additional providers without replacing this page.' }))
    block.appendChild(blockHead)
    const list = EF.ui.h('div', 'ef-settings-provider-list')
    const providers = EF.ai && EF.ai.providerOptions ? EF.ai.providerOptions() : [{ id: 'mock', label: 'Mock' }]
    for (let i = 0; i < providers.length; i++) list.appendChild(providerRow(providers[i]))
    block.appendChild(list)
    root.appendChild(block)
    return root
  }

  const THEME_STORAGE_KEY = 'ef-theme-overrides-v2'
  const THEME_MODE_KEY = 'ef-theme-mode'
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
        navigator.clipboard && navigator.clipboard.writeText(text)
        if (ui.toast) ui.toast({ kind: 'info', title: 'CSS copied', message: text })
      },
    })
    bar.appendChild(tabs)
    bar.appendChild(mode)
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

  function providerRow(meta) {
    const provider = EF.ai && EF.ai.getProvider ? EF.ai.getProvider(meta.id) : null
    const settings = providerSettingsFor(meta.id, meta.label || meta.id, provider)
    const card = EF.ui.h('section', 'ef-settings-provider-row')
    const head = EF.ui.h('div', 'ef-settings-provider-head')
    const title = EF.ui.h('div', 'ef-settings-provider-title')
    title.appendChild(EF.ui.h('span', null, { text: meta.label || meta.id }))
    head.appendChild(title)
    const status = EF.ui.h('div', 'ef-settings-provider-status')
    card.appendChild(head)
    const fields = EF.ui.h('div', 'ef-settings-provider-fields')
    for (let i = 0; i < settings.length; i++) {
      const field = settings[i]
      if (field.kind === 'model' && provider && provider.models) {
        field.action = modelLoadAction(meta.id, card, status)
      }
      fields.appendChild(field.kind === 'switch'
        ? settingSwitch(field)
        : (field.kind === 'model' ? settingModel(field) : settingInput(field)))
    }
    card.appendChild(fields)
    return card
  }

  function modelLoadAction(providerId, card, status) {
    const wrap = EF.ui.h('div', 'ef-settings-model-action')
    wrap.appendChild(EF.ui.iconButton({
      icon: 'refresh',
      title: 'Load models',
      size: 'sm',
      kind: 'ghost',
      onClick: function () { loadModels(providerId, card, status) },
    }))
    wrap.appendChild(status)
    return wrap
  }

  function providerSettingsFor(id, label, provider) {
    const settings = (provider && provider.settings) || []
    const out = []
    for (let i = 0; i < settings.length; i++) {
      const item = settings[i]
      out.push({
        kind: item.type === 'bool' ? 'switch' : (item.key.indexOf('.defaultModel') >= 0 ? 'model' : 'input'),
        providerId: id,
        key: item.key,
        label: compactLabel(id, label, item.label || item.key),
        type: item.type === 'password' ? 'password' : 'text',
        placeholder: placeholderFor(item.key),
        desc: item.description,
      })
    }
    return out
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
    const value = EF.signal(EF.settings.get(spec.key) || '')
    const row = settingRow(spec.label, spec.desc)
    row.appendChild(EF.ui.input({
      value: value,
      type: spec.type || 'text',
      placeholder: spec.placeholder || '',
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
        if (spec.key.indexOf('.apiKey') >= 0 && v && spec.providerId) activateProvider(spec.providerId)
      },
    }))
    return row
  }

  function settingModel(spec) {
    const value = EF.signal(EF.settings.get(spec.key) || '')
    const options = EF.signal(modelOptionsFor(spec.providerId, value.peek()))
    const row = settingRow(spec.label, spec.desc)
    const control = EF.ui.h('div', 'ef-settings-field-control ef-settings-model-control')
    control.appendChild(EF.ui.combobox({
      value: value,
      options: options,
      placeholder: spec.placeholder || 'Load models or enter model id',
      onChange: function (v) {
        value.set(v)
        EF.settings.set(spec.key, v)
        if (spec.providerId) syncActiveAgentModel(spec.providerId, v)
      },
    }))
    if (spec.action) control.appendChild(spec.action)
    row.appendChild(control)
    if (EF.ai && EF.ai.models) {
      EF.ui.collect(row, EF.effect(function () {
        options.set(modelOptionsFor(spec.providerId, value()))
      }))
    }
    return row
  }

  function modelOptionsFor(providerId, current) {
    const map = EF.ai && EF.ai.models ? EF.ai.models() : {}
    const list = map && map[providerId] ? map[providerId] : []
    const hints = EF.ai && EF.ai.modelHints ? EF.ai.modelHints(providerId) : []
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
        if (spec.key === 'ai.defaultProvider') activateProvider(v)
      },
    }))
    return row
  }

  function settingSwitch(spec) {
    const value = EF.signal(!!EF.settings.get(spec.key))
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

  function loadModels(providerId, card, status) {
    if (!EF.ai || !EF.ai.refreshModels) return
    card.classList.add('ef-settings-provider-loading')
    if (status) status.textContent = 'Loading...'
    EF.ai.refreshModels(providerId).then(function (models) {
      card.classList.remove('ef-settings-provider-loading')
      card.classList.add('ef-settings-provider-ok')
      if (status) status.textContent = models && models.length ? String(models.length) + ' models' : 'No models returned'
      activateProvider(providerId)
      setTimeout(function () { card.classList.remove('ef-settings-provider-ok') }, 900)
    }, function (err) {
      card.classList.remove('ef-settings-provider-loading')
      if (status) status.textContent = 'Load failed'
      if (EF.reportError) EF.reportError({ scope: 'settings', provider: providerId }, err)
    })
  }

  function activateProvider(providerId) {
    if (!providerId || !EF.ai) return
    EF.settings.set('ai.defaultProvider', providerId)
    if (EF.ai.setDefaultProvider) EF.ai.setDefaultProvider(providerId)
    const agent = EF.ai.getActiveAgent ? EF.ai.getActiveAgent() : null
    if (!agent || !EF.ai.updateAgent) return
    if (agent.provider && agent.provider !== 'mock' && agent.provider !== providerId) return
    const config = EF.ai.getProviderConfig ? EF.ai.getProviderConfig(providerId) : {}
    const opts = modelOptionsFor(providerId, config.defaultModel || agent.model)
    const nextModel = config.defaultModel || (opts.length ? opts[0].value : '')
    EF.ai.updateAgent(agent.id, {
      provider: providerId,
      model: nextModel,
      stream: !!config.stream,
    })
  }

  function syncActiveAgentModel(providerId, modelId) {
    if (!providerId || !modelId || !EF.ai || !EF.ai.getActiveAgent || !EF.ai.updateAgent) return
    const agent = EF.ai.getActiveAgent()
    if (!agent || agent.provider !== providerId) return
    EF.ai.updateAgent(agent.id, { model: modelId })
  }
})(window.EF = window.EF || {})
