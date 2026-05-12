// Theme settings contribution for AEditor.
;(function (aeditor) {
  'use strict'

  if (!aeditor.settings) return

  aeditor.settings.registerSection('theme', {
    title: 'Theme',
    icon: 'palette',
    description: 'AEditor appearance and visual density.',
    order: 10,
  })

  aeditor.settings.registerSchema('theme', [
    {
      key: 'theme.mode',
      label: 'Mode',
      type: 'select',
      default: 'dark',
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'harbor', label: 'Harbor' },
        { value: 'light', label: 'Light' },
      ],
      description: 'Active AEditor theme.',
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

  aeditor.settings.registerPage('theme-editor', {
    section: 'theme',
    title: 'Appearance',
    icon: 'sliders',
    order: 0,
    replacesSchema: true,
    factory: renderThemeSettings,
  })

  aeditor.effect(function () {
    const mode = aeditor.settings.get('theme.mode')
    if (aeditor.theme && aeditor.theme.set) aeditor.theme.set(mode || 'dark')
    const density = aeditor.settings.get('theme.density')
    if (aeditor.theme && aeditor.theme.setDensity) aeditor.theme.setDensity(density || 'default')
  })

  const THEME_STORAGE_KEY = 'aeditor-theme-overrides-v3'
  const THEME_MODE_KEY = 'aeditor-theme-mode'
  const THEME_DENSITY_KEY = 'aeditor-theme-density'
  const THEME_TABS = [
    { value: 'palette', label: 'Palette' },
    { value: 'spacing', label: 'Spacing' },
    { value: 'sizing', label: 'Sizing' },
    { value: 'radius', label: 'Radius' },
    { value: 'typography', label: 'Typography' },
    { value: 'motion', label: 'Motion' },
  ]
  const PALETTE = [
    ['--aeditor-surface-canvas', 'Surface / Canvas'],
    ['--aeditor-surface-lower', 'Surface / Lower'],
    ['--aeditor-surface-frame', 'Surface / Frame'],
    ['--aeditor-surface-panel', 'Surface / Panel'],
    ['--aeditor-surface-field', 'Surface / Field'],
    ['--aeditor-surface-hover', 'Surface / Hover'],
    ['--aeditor-surface-active', 'Surface / Active'],
    ['--aeditor-surface-raised', 'Surface / Raised'],
    ['--aeditor-text-primary', 'Text / Primary'],
    ['--aeditor-text-body', 'Text / Body'],
    ['--aeditor-text-label', 'Text / Label'],
    ['--aeditor-text-muted', 'Text / Muted'],
    ['--aeditor-text-disabled', 'Text / Disabled'],
    ['--aeditor-stroke-subtle', 'Stroke / Subtle'],
    ['--aeditor-stroke-strong', 'Stroke / Strong'],
    ['--aeditor-stroke-field', 'Stroke / Field'],
    ['--aeditor-stroke-hover', 'Stroke / Hover'],
    ['--aeditor-brand', 'Brand / Accent'],
    ['--aeditor-brand-hover', 'Brand / Hover'],
    ['--aeditor-brand-contrast', 'Brand / Contrast'],
    ['--aeditor-state-success', 'State / Success'],
    ['--aeditor-state-warning', 'State / Warning'],
    ['--aeditor-state-danger', 'State / Danger'],
    ['--aeditor-state-info', 'State / Info'],
  ]
  const SPACING = [
    ['--aeditor-space-1', 'Tight gap', 0, 32],
    ['--aeditor-space-2', 'Control gap', 0, 32],
    ['--aeditor-space-3', 'Row gap', 0, 64],
    ['--aeditor-space-4', 'Panel padding', 0, 64],
    ['--aeditor-space-5', 'Section gap', 0, 96],
    ['--aeditor-space-6', 'Large gap', 0, 128],
  ]
  const SIZING = [
    ['--aeditor-size-h-xs', 'Control height xs', 12, 40],
    ['--aeditor-size-h-sm', 'Control height sm', 14, 44],
    ['--aeditor-size-h-md', 'Control height md', 16, 48],
    ['--aeditor-size-h-lg', 'Control height lg', 18, 56],
    ['--aeditor-toolbar-h', 'Toolbar height', 16, 60],
    ['--aeditor-tab-h', 'Tab height', 16, 60],
  ]
  const RADIUS = [
    ['--aeditor-r-1', 'Tiny radius', 0, 24],
    ['--aeditor-r-2', 'Control radius', 0, 24],
    ['--aeditor-r-3', 'Panel radius', 0, 24],
    ['--aeditor-r-4', 'Floating radius', 0, 24],
  ]
  const TYPO_PX = [
    ['--aeditor-fs-xs', 'Font size xs', 8, 24],
    ['--aeditor-fs-sm', 'Font size sm', 8, 24],
    ['--aeditor-fs-md', 'Font size md', 8, 28],
    ['--aeditor-fs-lg', 'Font size lg', 8, 32],
    ['--aeditor-fs-xl', 'Font size xl', 8, 36],
  ]
  const MOTION_MS = [
    ['--aeditor-dur-fast', 'Fast', 0, 1000],
    ['--aeditor-dur-med', 'Med', 0, 1000],
    ['--aeditor-dur-slow', 'Slow', 0, 1000],
  ]

  function renderThemeSettings() {
    const ui = aeditor.ui
    const root = ui.view({ scroll: 'hidden', className: 'aeditor-settings-page aeditor-settings-theme-page' })
    root.appendChild(pageHead('Theme', 'AEditor appearance and visual density.'))

    const bar = ui.h('div', 'aeditor-settings-theme-bar')
    const tabSig = aeditor.signal('palette')
    const modeSig = aeditor.signal(aeditor.settings.get('theme.mode') || localStorage.getItem(THEME_MODE_KEY) || 'dark')
    const densitySig = aeditor.signal(aeditor.settings.get('theme.density') || localStorage.getItem(THEME_DENSITY_KEY) || 'default')
    const tabs = ui.segmented({ value: tabSig, options: THEME_TABS })
    tabs.classList.add('aeditor-settings-theme-tabs')
    const mode = ui.select({
      value: modeSig,
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'harbor', label: 'Harbor' },
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
      size: 'sm',
      onClick: function () {
        clearThemeOverrides()
        refreshAll()
        if (ui.toast) ui.toast({ kind: 'success', message: 'Theme reset' })
      },
    })
    const exportBtn = ui.button({
      text: 'Export',
      size: 'sm',
      onClick: function () {
        const text = aeditor.theme && aeditor.theme.exportCss ? aeditor.theme.exportCss() : ''
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
    const host = ui.h('div', 'aeditor-settings-theme-host')
    const scroll = ui.view({ children: host, className: 'aeditor-settings-theme-scroll' })
    root.appendChild(scroll)

    function track(sig, name, parse, format) {
      allSigs.push({ sig: sig, name: name, parse: parse, format: format })
    }
    function bindWriter(sig, name, format) {
      ui.collect(root, aeditor.effect(function () {
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
    ui.collect(root, aeditor.effect(function () {
      const value = modeSig()
      aeditor.settings.set('theme.mode', value)
      localStorage.setItem(THEME_MODE_KEY, value)
      if (aeditor.theme && aeditor.theme.set) aeditor.theme.set(value)
      if (!didMountMode) {
        didMountMode = true
        return
      }
      clearThemeOverrides()
      refreshAll()
    }))

    ui.collect(root, aeditor.effect(function () {
      const value = densitySig()
      aeditor.settings.set('theme.density', value)
      localStorage.setItem(THEME_DENSITY_KEY, value)
      if (aeditor.theme && aeditor.theme.setDensity) aeditor.theme.setDensity(value)
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

    ui.collect(root, aeditor.effect(function () {
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
    const wrap = aeditor.ui.h('div', 'aeditor-settings-theme-pane aeditor-settings-theme-palette')
    for (let i = 0; i < PALETTE.length; i++) {
      const name = PALETTE[i][0]
      const sig = aeditor.signal(readThemeToken(name) || '#000000')
      track(sig, name, null, null)
      bindWriter(sig, name, null)
      wrap.appendChild(aeditor.ui.propRow({ label: PALETTE[i][1], control: aeditor.ui.colorInput({ value: sig }) }))
    }
    return wrap
  }

  function buildPxRows(catalog, track, bindWriter, unit) {
    const wrap = aeditor.ui.h('div', 'aeditor-settings-theme-pane')
    const format = function (v) { return v + unit }
    for (let i = 0; i < catalog.length; i++) {
      const row = catalog[i]
      const sig = aeditor.signal(pxNum(readThemeToken(row[0])))
      track(sig, row[0], pxNum, format)
      bindWriter(sig, row[0], format)
      wrap.appendChild(aeditor.ui.propRow({
        label: row[1],
        control: aeditor.ui.numberInput({ value: sig, min: row[2], max: row[3], step: unit === 'ms' ? 10 : 1, suffix: unit }),
      }))
    }
    return wrap
  }

  function buildTypography(track, bindWriter) {
    const wrap = aeditor.ui.h('div', 'aeditor-settings-theme-pane')
    const uiFont = aeditor.signal(readThemeToken('--aeditor-font-ui'))
    track(uiFont, '--aeditor-font-ui', null, null)
    bindWriter(uiFont, '--aeditor-font-ui', null)
    wrap.appendChild(aeditor.ui.propRow({ label: 'UI font', control: aeditor.ui.input({ value: uiFont }) }))
    const monoFont = aeditor.signal(readThemeToken('--aeditor-font-mono'))
    track(monoFont, '--aeditor-font-mono', null, null)
    bindWriter(monoFont, '--aeditor-font-mono', null)
    wrap.appendChild(aeditor.ui.propRow({ label: 'Mono font', control: aeditor.ui.input({ value: monoFont }) }))
    const sizes = buildPxRows(TYPO_PX, track, bindWriter, 'px')
    while (sizes.firstChild) wrap.appendChild(sizes.firstChild)
    return wrap
  }

  function pageHead(title, desc) {
    const head = aeditor.ui.h('div', 'aeditor-settings-page-head')
    head.appendChild(aeditor.ui.h('div', 'aeditor-settings-page-title', { text: title }))
    head.appendChild(aeditor.ui.h('div', 'aeditor-settings-page-desc', { text: desc }))
    return head
  }

})(window.aeditor = window.aeditor || {})
