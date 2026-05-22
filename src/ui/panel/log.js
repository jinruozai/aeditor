// Log panel component - compact editor log with filtering, search, and details.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui

  const LEVEL_OPTS = [
    { value: 'all',   label: 'All' },
    { value: 'error', label: 'Error' },
    { value: 'warn',  label: 'Warn' },
    { value: 'info',  label: 'Info' },
    { value: 'debug', label: 'Debug' },
  ]

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'aiditor-ui-errlog')
    const levelSig = aiditor.signal(((propsSig.peek() || {}).level) || 'all')
    const querySig = aiditor.signal('')
    const expanded = new Set()

    const bar = ui.h('div', 'aiditor-ui-errlog-bar')
    bar.appendChild(ui.select({ value: levelSig, options: LEVEL_OPTS }))
    bar.appendChild(ui.searchInput({ value: querySig, placeholder: 'Search logs...' }))
    bar.appendChild(ui.h('div', 'aiditor-ui-errlog-spacer'))

    const copyBtn = ui.button({ text: 'Copy', size: 'sm' })
    copyBtn.addEventListener('click', function () {
      const visible = filteredEntries()
      ui.copyText(visible.map(formatEntryLong).join('\n\n')).then(function () {
        ui.toast({ kind: 'success', message: 'Copied ' + visible.length + ' log entries' })
      })
    })
    bar.appendChild(copyBtn)

    const clearBtn = ui.button({ text: 'Clear', size: 'sm' })
    clearBtn.addEventListener('click', function () {
      const visible = new Set(filteredEntries().map(function (e) { return e.id }))
      if (!visible.size) return
      aiditor.log.update(function (list) { return list.filter(function (e) { return !visible.has(e.id) }) })
    })
    bar.appendChild(clearBtn)
    root.appendChild(bar)

    const body = ui.view({ className: 'aiditor-ui-errlog-body' })
    root.appendChild(body)

    function filteredEntries() {
      const list = aiditor.log()
      const level = levelSig()
      const query = String(querySig() || '').trim().toLowerCase()
      return list.filter(function (entry) {
        if (level !== 'all' && entry.level !== level) return false
        if (!query) return true
        return searchable(entry).toLowerCase().indexOf(query) >= 0
      })
    }

    function render() {
      const list = aiditor.log()
      const visible = filteredEntries()
      clearBody(body)
      if (!visible.length) {
        body.appendChild(ui.h('div', 'aiditor-ui-errlog-empty', { text: list.length ? 'No matching log entries' : 'No log entries' }))
        return
      }
      for (let i = visible.length - 1; i >= 0; i--) {
        body.appendChild(buildRow(visible[i], expanded, render))
      }
    }

    ctx.onCleanup(aiditor.effect(render))
    return root
  }

  function clearBody(el) {
    while (el.firstChild) ui.dispose(el.firstChild)
  }

  function buildRow(entry, expanded, rerender) {
    const row = ui.h('div', 'aiditor-ui-errlog-row aiditor-ui-errlog-row-' + entry.level)
    if (expanded.has(entry.id)) row.classList.add('aiditor-ui-errlog-row-open')

    const main = ui.h('button', 'aiditor-ui-errlog-main', { type: 'button' })
    main.addEventListener('click', function () {
      if (expanded.has(entry.id)) expanded.delete(entry.id)
      else expanded.add(entry.id)
      rerender()
    })
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-caret', { text: expanded.has(entry.id) ? '▾' : '▸' }))
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-level aiditor-ui-errlog-level-' + entry.level, { text: entry.level }))
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-time', { text: formatTime(entry.time) }))
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-source', { text: shortSource(entry.source) }))
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-msg', { text: entry.message }))
    row.appendChild(main)

    const dismiss = ui.iconButton({ icon: 'x', title: 'Dismiss', size: 'sm', kind: 'ghost' })
    dismiss.classList.add('aiditor-ui-errlog-dismiss')
    dismiss.addEventListener('click', function (ev) {
      ev.stopPropagation()
      aiditor.log.dismiss(entry.id)
    })
    row.appendChild(dismiss)

    if (expanded.has(entry.id)) {
      const details = ui.h('div', 'aiditor-ui-errlog-details')
      details.appendChild(detailLine('source', formatSource(entry.source)))
      details.appendChild(detailLine('time', new Date(entry.time).toLocaleString()))
      if (entry.stack) details.appendChild(ui.h('pre', 'aiditor-ui-errlog-stack', { text: entry.stack }))
      row.appendChild(details)
    }
    return row
  }

  function detailLine(label, value) {
    const el = ui.h('div', 'aiditor-ui-errlog-detail')
    el.appendChild(ui.h('span', 'aiditor-ui-errlog-detail-label', { text: label }))
    el.appendChild(ui.h('span', 'aiditor-ui-errlog-detail-value', { text: value }))
    return el
  }

  function searchable(entry) {
    return [
      entry.level,
      entry.message,
      entry.stack || '',
      formatSource(entry.source),
    ].join('\n')
  }

  function formatEntryLong(entry) {
    const head = '[' + String(entry.level || 'info').toUpperCase() + '] ' +
      formatTime(entry.time) + ' ' + formatSource(entry.source)
    return head + '\n' + entry.message + (entry.stack ? '\n' + entry.stack : '')
  }

  function formatTime(ms) {
    const d = new Date(ms || Date.now())
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  }

  function pad(n) { return n < 10 ? '0' + n : String(n) }

  function shortSource(s) {
    if (!s) return 'unknown'
    return s.component || s.scope || s.topic || s.panelId || 'unknown'
  }

  function formatSource(s) {
    if (!s) return 'unknown'
    const parts = [s.scope || 'unknown']
    if (s.component) parts.push('component=' + s.component)
    if (s.dockId) parts.push('dock=' + s.dockId)
    if (s.panelId) parts.push('panel=' + s.panelId)
    if (s.topic) parts.push('topic=' + s.topic)
    return parts.join(' · ')
  }

  aiditor.registerComponent('log', {
    label:    'Log',
    icon:     'list',
    category: 'panel',
    defaults: function () { return { title: 'Log', icon: 'list', props: { level: 'all' } } },
    factory:  factory,
  })
})(window.aiditor = window.aiditor || {})
