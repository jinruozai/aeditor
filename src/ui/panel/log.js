// Log panel component — built entirely from aeditor.ui.* primitives.
//
// Subscribes to aeditor.log and renders one aeditor-ui-card per entry inside a
// aeditor-ui-scrollarea. Newest on top. A segmented
// level filter (All / Error / Warn / Info / Debug) controls the visible
// subset. This is a built-in `registered panel component` (§ 4.7) — users put
// it in any dock and they immediately see every panel error / log call /
// global throw / async rejection routed to one place.
//
// Zero custom DOM, zero custom CSS. Everything comes from the ui library.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui

  const LEVEL_OPTS = [
    { value: 'all',   label: 'All' },
    { value: 'error', label: 'Error' },
    { value: 'warn',  label: 'Warn' },
    { value: 'info',  label: 'Info' },
    { value: 'debug', label: 'Debug' },
  ]

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'aeditor-ui-errlog')

    // Filter bar — dropdown select on the left, spacer, copy + clear on the
    // right. Select (not segmented) keeps the toolbar compact when the log
    // panel is narrow.
    const filter = aeditor.signal(((propsSig.peek() || {}).level) || 'all')
    const bar = ui.h('div', 'aeditor-ui-errlog-bar')
    bar.appendChild(ui.select({ value: filter, options: LEVEL_OPTS }))
    bar.appendChild(ui.h('div', 'aeditor-ui-errlog-spacer'))
    const copyBtn = ui.button({ text: 'Copy', kind: 'ghost', size: 'sm' })
    copyBtn.addEventListener('click', function () {
      const list = aeditor.log()
      const lvl = filter()
      const visible = lvl === 'all' ? list : list.filter(function (e) { return e.level === lvl })
      const text = visible.map(function (e) {
        return '[' + e.level.toUpperCase() + '] ' + formatSource(e.source) + ' — ' + e.message +
          (e.stack ? '\n' + e.stack : '')
      }).join('\n')
      ui.copyText(text).then(function () {
        ui.toast({ kind: 'success', message: 'Copied ' + visible.length + ' log entries' })
      })
    })
    bar.appendChild(copyBtn)
    const clearBtn = ui.button({ text: 'Clear', kind: 'ghost', size: 'sm' })
    clearBtn.addEventListener('click', function () { aeditor.log.clear() })
    bar.appendChild(clearBtn)
    root.appendChild(bar)

    const empty = ui.h('div', 'aeditor-ui-errlog-empty', {
      text: 'No log entries',
    })

    const scroll = ui.scrollArea()
    root.appendChild(scroll)

    ctx.onCleanup(aeditor.effect(function () {
      const list = aeditor.log()
      const lvl = filter()
      const visible = lvl === 'all' ? list : list.filter(function (e) { return e.level === lvl })
      scroll.replaceChildren()
      if (visible.length === 0) {
        scroll.appendChild(empty)
        return
      }
      // Newest first.
      for (let i = visible.length - 1; i >= 0; i--) {
        scroll.appendChild(buildRow(visible[i]))
      }
    }))

    return root
  }

  function buildRow(entry) {
    const row = ui.h('div', 'aeditor-ui-errlog-row aeditor-ui-errlog-row-' + entry.level)
    row.appendChild(ui.h('div', 'aeditor-ui-errlog-msg',  { text: entry.message }))
    // Stack trace lives in the entry data (and console.error fallback) but is
    // not rendered. Level/source/time are represented by filtering, copy, and
    // the color strip; the visible list stays message-first.
    row.title = entry.stack ? entry.message + '\n\n' + entry.stack : entry.message
    return row
  }

  function formatSource(s) {
    if (!s) return 'unknown'
    const parts = [s.scope || 'unknown']
    if (s.component)  parts.push('component=' + s.component)
    if (s.dockId)  parts.push('dock=' + s.dockId)
    if (s.panelId) parts.push('panel=' + s.panelId)
    if (s.topic)   parts.push('topic=' + s.topic)
    return parts.join(' · ')
  }

  aeditor.registerComponent('log', {
    label:    'Log',
    icon:     'list',
    category: 'panel',
    defaults: function () { return { title: 'Log', icon: '📋', props: { level: 'all' } } },
    factory:  factory,
  })
})(window.aeditor = window.aeditor || {})
