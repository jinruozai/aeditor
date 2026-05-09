// demo component: theme-config
//
// A panel that lets the user live-edit the editorframe theme tokens. Writes
// to documentElement.style.setProperty so the change reflects everywhere
// instantly. State persists to localStorage under a versioned override key.
//
// Tabs: Palette / Spacing / Sizing / Radius / Typography / Motion. Each row
// is built from the actual UI library, so this panel doubles as a real-world
// usage sample.
;(function (EF) {
  'use strict'
  const ui = EF.ui

  const STORAGE_KEY = 'ef-theme-overrides-v2'
  const THEME_KEY   = 'ef-theme-mode'

  // ── token catalog ─────────────────────────────────────────────────
  // [name, label, type, opts?]   type: color | px | num | text
  const PALETTE = [
    ['--ef-surface-canvas', 'Surface / Canvas'],
    ['--ef-surface-lower',  'Surface / Lower'],
    ['--ef-surface-frame',  'Surface / Frame'],
    ['--ef-surface-panel',  'Surface / Panel'],
    ['--ef-surface-field',  'Surface / Field'],
    ['--ef-surface-hover',  'Surface / Hover'],
    ['--ef-surface-active', 'Surface / Active'],
    ['--ef-surface-raised', 'Surface / Raised'],
    ['--ef-text-primary',   'Text / Primary'],
    ['--ef-text-body',      'Text / Body'],
    ['--ef-text-label',     'Text / Label'],
    ['--ef-text-muted',     'Text / Muted'],
    ['--ef-text-disabled',  'Text / Disabled'],
    ['--ef-stroke-subtle',  'Stroke / Subtle'],
    ['--ef-stroke-strong',  'Stroke / Strong'],
    ['--ef-stroke-field',   'Stroke / Field'],
    ['--ef-stroke-hover',   'Stroke / Hover'],
    ['--ef-brand',          'Brand / Accent'],
    ['--ef-brand-hover',    'Brand / Hover'],
    ['--ef-brand-contrast', 'Brand / Contrast'],
    ['--ef-state-success',  'State / Success'],
    ['--ef-state-warning',  'State / Warning'],
    ['--ef-state-danger',   'State / Danger'],
    ['--ef-state-info',     'State / Info'],
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
    ['--ef-toolbar-h', 'Toolbar height',    16, 60],
    ['--ef-tab-h',     'Tab height',        16, 60],
  ]
  const RADIUS = [
    ['--ef-r-1', 'Tiny radius', 0, 24],
    ['--ef-r-2', 'Control radius', 0, 24],
    ['--ef-r-3', 'Panel radius', 0, 24],
    ['--ef-r-4', 'Floating radius', 0, 24],
  ]
  const TYPO_PX = [
    ['--ef-fs-xs', 'Font size xs',  8, 24],
    ['--ef-fs-sm', 'Font size sm',  8, 24],
    ['--ef-fs-md', 'Font size md',  8, 28],
    ['--ef-fs-lg', 'Font size lg',  8, 32],
    ['--ef-fs-xl', 'Font size xl',  8, 36],
  ]
  const MOTION_MS = [
    ['--ef-dur-fast', 'Fast', 0, 1000],
    ['--ef-dur-med',  'Med',  0, 1000],
    ['--ef-dur-slow', 'Slow', 0, 1000],
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
  // data-ef-theme=<mode> for the theme.css rule to key off.
  function applyThemeMode(mode) {
    EF.theme.set(mode)
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
  EF.registerComponent('theme-config', {
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
      // match" check. Without that, every EF.effect runs synchronously on
      // creation and writes the current cascade value back as an inline
      // style on :root — locking Layer 1 primitives so that switching to
      // light mode later has no visual effect (inline specificity beats
      // [data-ef-theme="light"]). The guard means: only writeToken when
      // the signal's desired literal differs from what the cascade already
      // resolves to, so initial mount is a no-op and only user edits pollute
      // inline styles.
      const allSigs = []
      function track(sig, name, parse, format) {
        allSigs.push({ sig: sig, name: name, parse: parse, format: format })
      }
      function bindWriter(sig, name, format) {
        const stop = EF.effect(function () {
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

      // Single header row — tab bar on the left, mode/reset/export on the
      // right. Per user feedback: palette/spacing/sizing tabs and the
      // dark/light/reset/export controls must share the same row.
      const head = ui.h('div', 'demo-theme-head')
      const tabSig = EF.signal('palette')
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

      const modeSig = EF.signal(localStorage.getItem(THEME_KEY) || 'dark')
      const modeSel = ui.select({
        value: modeSig,
        options: [
          { value: 'dark',    label: 'Dark' },
          { value: 'dracula', label: 'Dracula' },
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
          const text = EF.theme.exportCss()
          navigator.clipboard && navigator.clipboard.writeText(text)
          ui.toast({ kind: 'info', title: 'CSS copied', message: text })
        },
      })

      head.appendChild(tabBar)
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
          const sig = EF.signal(readToken(name) || '#000000')
          track(sig, name, null, null)
          bindWriter(sig, name, null)
          wrap.appendChild(ui.propRow({ label: label, control: ui.colorInput({ value: sig }) }))
        }
        return wrap
      }
      function buildPxRows(catalog) {
        const wrap = ui.h('div', 'demo-theme-pane')
        for (let i = 0; i < catalog.length; i++) {
          const row = catalog[i]
          const name = row[0], label = row[1], min = row[2], max = row[3]
          const sig = EF.signal(pxNum(readToken(name)))
          track(sig, name, pxNum, pxFormat)
          bindWriter(sig, name, pxFormat)
          wrap.appendChild(ui.propRow({ label: label, control: ui.numberInput({ value: sig, min: min, max: max, step: 1, suffix: 'px' }) }))
        }
        return wrap
      }
      function buildMotion() {
        const wrap = ui.h('div', 'demo-theme-pane')
        for (let i = 0; i < MOTION_MS.length; i++) {
          const r = MOTION_MS[i]
          const name = r[0], label = r[1], min = r[2], max = r[3]
          const sig = EF.signal(pxNum(readToken(name)))
          track(sig, name, pxNum, msFormat)
          bindWriter(sig, name, msFormat)
          wrap.appendChild(ui.propRow({ label: label, control: ui.numberInput({ value: sig, min: min, max: max, step: 10, suffix: 'ms' }) }))
        }
        return wrap
      }
      function buildTypography() {
        const wrap = ui.h('div', 'demo-theme-pane')
        // Font stacks are free-text inputs.
        const uiFontSig = EF.signal(readToken('--ef-font-ui'))
        track(uiFontSig, '--ef-font-ui', null, null)
        bindWriter(uiFontSig, '--ef-font-ui', null)
        wrap.appendChild(ui.propRow({ label: 'UI font', control: ui.input({ value: uiFontSig }) }))

        const monoFontSig = EF.signal(readToken('--ef-font-mono'))
        track(monoFontSig, '--ef-font-mono', null, null)
        bindWriter(monoFontSig, '--ef-font-mono', null)
        wrap.appendChild(ui.propRow({ label: 'Mono font', control: ui.input({ value: monoFontSig }) }))

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

      const paneHost = ui.h('div', 'demo-theme-host')
      const scroll = ui.scrollArea({ children: paneHost })
      root.appendChild(scroll)

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
})(window.EF = window.EF || {})
