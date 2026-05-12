// demo component: theme-config
//
// A panel that lets the user live-edit the aeditor theme tokens. Writes
// to documentElement.style.setProperty so the change reflects everywhere
// instantly. State persists to localStorage under a versioned override key.
//
// Tabs: Palette / Spacing / Sizing / Radius / Typography / Motion. Each row
// is built from the actual UI library, so this panel doubles as a real-world
// usage sample.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui

  const STORAGE_KEY = 'aeditor-theme-overrides-v3'
  const THEME_KEY   = 'aeditor-theme-mode'

  // ── token catalog ─────────────────────────────────────────────────
  // [name, label, type, opts?]   type: color | px | num | text
  const PALETTE = [
    ['--aeditor-surface-canvas', 'Surface / Canvas'],
    ['--aeditor-surface-lower',  'Surface / Lower'],
    ['--aeditor-surface-frame',  'Surface / Frame'],
    ['--aeditor-surface-panel',  'Surface / Panel'],
    ['--aeditor-surface-field',  'Surface / Field'],
    ['--aeditor-surface-hover',  'Surface / Hover'],
    ['--aeditor-surface-active', 'Surface / Active'],
    ['--aeditor-surface-raised', 'Surface / Raised'],
    ['--aeditor-text-primary',   'Text / Primary'],
    ['--aeditor-text-body',      'Text / Body'],
    ['--aeditor-text-label',     'Text / Label'],
    ['--aeditor-text-muted',     'Text / Muted'],
    ['--aeditor-text-disabled',  'Text / Disabled'],
    ['--aeditor-stroke-subtle',  'Stroke / Subtle'],
    ['--aeditor-stroke-strong',  'Stroke / Strong'],
    ['--aeditor-stroke-field',   'Stroke / Field'],
    ['--aeditor-stroke-hover',   'Stroke / Hover'],
    ['--aeditor-brand',          'Brand / Accent'],
    ['--aeditor-brand-hover',    'Brand / Hover'],
    ['--aeditor-brand-contrast', 'Brand / Contrast'],
    ['--aeditor-state-success',  'State / Success'],
    ['--aeditor-state-warning',  'State / Warning'],
    ['--aeditor-state-danger',   'State / Danger'],
    ['--aeditor-state-info',     'State / Info'],
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
    ['--aeditor-toolbar-h', 'Toolbar height',    16, 60],
    ['--aeditor-tab-h',     'Tab height',        16, 60],
  ]
  const RADIUS = [
    ['--aeditor-r-1', 'Tiny radius', 0, 24],
    ['--aeditor-r-2', 'Control radius', 0, 24],
    ['--aeditor-r-3', 'Panel radius', 0, 24],
    ['--aeditor-r-4', 'Floating radius', 0, 24],
  ]
  const TYPO_PX = [
    ['--aeditor-fs-xs', 'Font size xs',  8, 24],
    ['--aeditor-fs-sm', 'Font size sm',  8, 24],
    ['--aeditor-fs-md', 'Font size md',  8, 28],
    ['--aeditor-fs-lg', 'Font size lg',  8, 32],
    ['--aeditor-fs-xl', 'Font size xl',  8, 36],
  ]
  const MOTION_MS = [
    ['--aeditor-dur-fast', 'Fast', 0, 1000],
    ['--aeditor-dur-med',  'Med',  0, 1000],
    ['--aeditor-dur-slow', 'Slow', 0, 1000],
  ]

  // ── helpers ───────────────────────────────────────────────────────

  function readToken(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  }
  function writeToken(name, val) {
    document.documentElement.style.setProperty(name, val)
    persist(name, val)
  }
  function clearOverride(name) {
    document.documentElement.style.removeProperty(name)
    const o = readPersisted()
    delete o[name]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o))
  }
  function readPersisted() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch (_) { return {} }
  }
  function persist(name, val) {
    const o = readPersisted()
    o[name] = val
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o))
  }
  function applyPersisted() {
    const o = readPersisted()
    for (const k in o) document.documentElement.style.setProperty(k, o[k])
  }
  // 'dark' is the implicit default (no attribute); any other mode sets
  // data-aeditor-theme=<mode> for the theme.css rule to key off.
  function applyThemeMode(mode) {
    aeditor.theme.set(mode)
    localStorage.setItem(THEME_KEY, mode)
  }
  function pxNum(s) {
    const m = /^(-?[\d.]+)/.exec(s || '')
    return m ? Number(m[1]) : 0
  }

  // Apply persisted overrides + theme mode immediately on script load (before
  // any panel mounts) so the demo opens in whatever mode the user last picked.
  ;(function () {
    const mode = localStorage.getItem(THEME_KEY)
    if (mode) applyThemeMode(mode)
    applyPersisted()
  })()

  // ── component ────────────────────────────────────────────────────────
  aeditor.registerComponent('theme-config', {
    category: 'panel',
    label: 'Theme',
    icon: 'palette',
    defaults: function () { return { title: 'Theme', icon: '🎨' } },
    factory: function (propsSig, ctx) { const props = propsSig.peek() || {};
      const root = ui.h('div', 'demo-theme')

      // Signal map so refreshAll can re-pull from CSS after Reset/Mode change.
      // Hoisted to the top of create() because ui.bind() fires its callback
      // synchronously on first call — anything it touches must already exist.
      //
      // IMPORTANT: the write-effect below is guarded by an "inline cascade
      // match" check. Without that, every aeditor.effect runs synchronously on
      // creation and writes the current cascade value back as an inline
      // style on :root — locking Layer 1 primitives so that switching to
      // light mode later has no visual effect (inline specificity beats
      // [data-aeditor-theme="light"]). The guard means: only writeToken when
      // the signal's desired literal differs from what the cascade already
      // resolves to, so initial mount is a no-op and only user edits pollute
      // inline styles.
      const allSigs = []
      function track(sig, name, parse, format) {
        allSigs.push({ sig: sig, name: name, parse: parse, format: format })
      }
      function bindWriter(sig, name, format) {
        const stop = aeditor.effect(function () {
          const v = sig()
          const literal = format ? format(v) : v
          // getPropertyValue on documentElement.style returns the INLINE value
          // only ('' if not set). getComputedStyle returns the EFFECTIVE value
          // (inline ?? cascade). We compare against effective: if the effective
          // already matches, writing would be a no-op at best and pollution at
          // worst — skip it.
          const effective = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
          if (effective === literal) return
          writeToken(name, literal)
        })
        ctx.onCleanup(stop)
      }
      function bindThemeTarget(row, name) {
        if (aeditor.ai && aeditor.ai.attach && Demo.aiTargets) {
          aeditor.ai.attach(row.querySelector('.aeditor-ui-prop-label'), function () { return Demo.aiTargets.themeToken(name) }, { contextMenu: true })
        }
      }
      function registerThemeToken(name, label, category, sig, format, parse, extra) {
        if (!Demo.aiTargets) return
        Demo.aiTargets.registerThemeToken(Object.assign({
          name: name,
          label: label,
          category: category,
          signal: sig,
          format: format,
          parse: parse,
        }, extra || {}))
      }
      function refreshAll() {
        // Remove every tracked inline override first so getComputedStyle
        // resolves from the cascade (reflecting the current theme mode).
        // Then set each signal to the cascade value; bindWriter's guard
        // skips the write because effective === literal.
        for (let i = 0; i < allSigs.length; i++) {
          document.documentElement.style.removeProperty(allSigs[i].name)
        }
        for (let i = 0; i < allSigs.length; i++) {
          const it = allSigs[i]
          const v = readToken(it.name)
          const next = it.parse ? it.parse(v) : v
          if (it.sig.peek() !== next) it.sig.set(next)
        }
      }

      // Header stays compact in the left dock: theme mode + reset/export only.
      // Category tabs are placed in a footer at the bottom of the panel.
      const head = ui.h('div', 'demo-theme-head')
      const tabSig = aeditor.signal('palette')
      const tabBar = ui.segmented({
        value: tabSig,
        options: [
          { value: 'palette',    label: 'Palette' },
          { value: 'spacing',    label: 'Spacing' },
          { value: 'sizing',     label: 'Sizing' },
          { value: 'radius',     label: 'Radius' },
          { value: 'typography', label: 'Typography' },
          { value: 'motion',     label: 'Motion' },
        ],
      })
      tabBar.classList.add('demo-theme-tabbar')

      const modeSig = aeditor.signal(localStorage.getItem(THEME_KEY) || 'dark')
      if (Demo.aiTargets) Demo.aiTargets.registerThemeMode(modeSig)
      const modeSel = ui.select({
        value: modeSig,
        options: [
          { value: 'dark',    label: 'Dark' },
          { value: 'dracula', label: 'Dracula' },
          { value: 'harbor',  label: 'Harbor' },
          { value: 'light',   label: 'Light' },
        ],
      })
      // On mode flip we wipe persisted token overrides too. Rationale:
      // customizations are stored as inline styles with Dark-mode-derived
      // values; carrying them across to Light makes the UI look broken
      // (e.g. a user-tweaked "deep gray 02" bleeds into a light background).
      // For a demo this is the sane default — the user re-customizes in the
      // new mode if they want to. (Reset button reuses the same pipeline.)
      function clearAllOverrides() {
        const o = readPersisted()
        for (const k in o) document.documentElement.style.removeProperty(k)
        localStorage.removeItem(STORAGE_KEY)
      }
      ui.bind(modeSel, modeSig, function (v) {
        applyThemeMode(v)
        clearAllOverrides()
        refreshAll()
      })

      const resetBtn = ui.button({
        text: 'Reset', kind: 'ghost', size: 'sm',
        onClick: function () {
          clearAllOverrides()
          ui.toast({ kind: 'success', message: 'Theme reset' })
          refreshAll()
        },
      })
      const exportBtn = ui.button({
        text: 'Export', kind: 'ghost', size: 'sm',
        onClick: function () {
          const text = aeditor.theme.exportCss()
          navigator.clipboard && navigator.clipboard.writeText(text)
          ui.toast({ kind: 'info', title: 'CSS copied', message: text })
        },
      })

      head.appendChild(modeSel)
      head.appendChild(resetBtn)
      head.appendChild(exportBtn)
      root.appendChild(head)

      // ── builders for each category ─────────────────────────────
      const pxFormat = function (v) { return v + 'px' }
      const msFormat = function (v) { return v + 'ms' }

      function buildPalette() {
        const wrap = ui.h('div', 'demo-theme-pane')
        for (let i = 0; i < PALETTE.length; i++) {
          const name = PALETTE[i][0], label = PALETTE[i][1]
          const sig = aeditor.signal(readToken(name) || '#000000')
          track(sig, name, null, null)
          bindWriter(sig, name, null)
          registerThemeToken(name, label, 'palette', sig, null, null, { unit: 'color' })
          const row = ui.propRow({ label: label, control: ui.colorInput({ value: sig }) })
          bindThemeTarget(row, name)
          wrap.appendChild(row)
        }
        return wrap
      }
      function buildPxRows(catalog) {
        const wrap = ui.h('div', 'demo-theme-pane')
        for (let i = 0; i < catalog.length; i++) {
          const row = catalog[i]
          const name = row[0], label = row[1], min = row[2], max = row[3]
          const sig = aeditor.signal(pxNum(readToken(name)))
          track(sig, name, pxNum, pxFormat)
          bindWriter(sig, name, pxFormat)
          registerThemeToken(name, label, 'px', sig, pxFormat, pxNum, { unit: 'px', min: min, max: max })
          const prop = ui.propRow({ label: label, control: ui.numberInput({ value: sig, min: min, max: max, step: 1, suffix: 'px' }) })
          bindThemeTarget(prop, name)
          wrap.appendChild(prop)
        }
        return wrap
      }
      function buildMotion() {
        const wrap = ui.h('div', 'demo-theme-pane')
        for (let i = 0; i < MOTION_MS.length; i++) {
          const r = MOTION_MS[i]
          const name = r[0], label = r[1], min = r[2], max = r[3]
          const sig = aeditor.signal(pxNum(readToken(name)))
          track(sig, name, pxNum, msFormat)
          bindWriter(sig, name, msFormat)
          registerThemeToken(name, label, 'motion', sig, msFormat, pxNum, { unit: 'ms', min: min, max: max })
          const prop = ui.propRow({ label: label, control: ui.numberInput({ value: sig, min: min, max: max, step: 10, suffix: 'ms' }) })
          bindThemeTarget(prop, name)
          wrap.appendChild(prop)
        }
        return wrap
      }
      function buildTypography() {
        const wrap = ui.h('div', 'demo-theme-pane')
        // Font stacks are free-text inputs.
        const uiFontSig = aeditor.signal(readToken('--aeditor-font-ui'))
        track(uiFontSig, '--aeditor-font-ui', null, null)
        bindWriter(uiFontSig, '--aeditor-font-ui', null)
        registerThemeToken('--aeditor-font-ui', 'UI font', 'typography', uiFontSig, null, null, { unit: 'font' })
        const uiFontRow = ui.propRow({ label: 'UI font', control: ui.input({ value: uiFontSig }) })
        bindThemeTarget(uiFontRow, '--aeditor-font-ui')
        wrap.appendChild(uiFontRow)

        const monoFontSig = aeditor.signal(readToken('--aeditor-font-mono'))
        track(monoFontSig, '--aeditor-font-mono', null, null)
        bindWriter(monoFontSig, '--aeditor-font-mono', null)
        registerThemeToken('--aeditor-font-mono', 'Mono font', 'typography', monoFontSig, null, null, { unit: 'font' })
        const monoFontRow = ui.propRow({ label: 'Mono font', control: ui.input({ value: monoFontSig }) })
        bindThemeTarget(monoFontRow, '--aeditor-font-mono')
        wrap.appendChild(monoFontRow)

        // Then the size scale
        const sizes = buildPxRows(TYPO_PX)
        while (sizes.firstChild) wrap.appendChild(sizes.firstChild)
        return wrap
      }

      const panes = {
        palette:    null,
        spacing:    null,
        sizing:     null,
        radius:     null,
        typography: null,
        motion:     null,
      }
      function ensurePane(key) {
        if (panes[key]) return panes[key]
        let el
        if      (key === 'palette')    el = buildPalette()
        else if (key === 'spacing')    el = buildPxRows(SPACING)
        else if (key === 'sizing')     el = buildPxRows(SIZING)
        else if (key === 'radius')     el = buildPxRows(RADIUS)
        else if (key === 'typography') el = buildTypography()
        else if (key === 'motion')     el = buildMotion()
        panes[key] = el
        return el
      }

      const paneHost = ui.view({ className: 'demo-theme-host' })
      root.appendChild(paneHost)

      const foot = ui.h('div', 'demo-theme-foot')
      foot.appendChild(tabBar)
      root.appendChild(foot)

      ui.bind(root, tabSig, function (key) {
        while (paneHost.firstChild) paneHost.removeChild(paneHost.firstChild)
        paneHost.appendChild(ensurePane(key))
      })

      ctx.onCleanup(function () {
        // Detach any built panes (some are not currently mounted).
        for (const k in panes) if (panes[k]) ui.dispose(panes[k])
        ui.dispose(root)
      })

      return root
    },
  })
})(window.aeditor = window.aeditor || {})
