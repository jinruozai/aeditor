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
    const selected = new Set()
    let anchorId = null

    const bar = ui.h('div', 'aiditor-ui-errlog-bar')
    bar.appendChild(ui.select({ value: levelSig, options: LEVEL_OPTS }))
    bar.appendChild(ui.searchInput({ value: querySig, placeholder: 'Search logs...' }))
    bar.appendChild(ui.h('div', 'aiditor-ui-errlog-spacer'))

    const copyBtn = ui.button({ text: 'Copy', size: 'sm' })
    copyBtn.addEventListener('click', function () {
      const target = targetEntries(displayEntries())
      ui.copyText(target.map(formatEntryLong).join('\n\n')).then(function () {
        ui.toast({ kind: 'success', message: 'Copied ' + target.length + ' log entries' })
      })
    })
    bar.appendChild(copyBtn)

    const clearBtn = ui.button({ text: 'Clear', size: 'sm' })
    clearBtn.addEventListener('click', function () {
      const target = new Set(targetEntries(displayEntries()).map(function (e) { return e.id }))
      if (!target.size) return
      selected.clear()
      anchorId = null
      aiditor.log.update(function (list) { return list.filter(function (e) { return !target.has(e.id) }) })
    })
    bar.appendChild(clearBtn)
    root.appendChild(bar)

    const body = ui.view({ className: 'aiditor-ui-errlog-body' })
    body.setAttribute('role', 'listbox')
    body.setAttribute('aria-multiselectable', 'true')
    body.addEventListener('click', function (ev) {
      if (ev.target !== body) return
      selected.clear()
      anchorId = null
      render()
    })
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

    function displayEntries() {
      return filteredEntries().slice().reverse()
    }

    function targetEntries(visible) {
      const picked = visible.filter(function (entry) { return selected.has(entry.id) })
      return picked.length ? picked : visible
    }

    function render() {
      const list = aiditor.log()
      const visible = displayEntries()
      syncSelection(visible)
      clearBody(body)
      if (!visible.length) {
        body.appendChild(ui.h('div', 'aiditor-ui-errlog-empty', { text: list.length ? 'No matching log entries' : 'No log entries' }))
        return
      }
      for (let i = 0; i < visible.length; i++) {
        body.appendChild(buildRow(visible[i], visible, expanded, selected, selectEntry, render))
      }
    }

    function syncSelection(visible) {
      const ids = new Set(visible.map(function (entry) { return entry.id }))
      selected.forEach(function (id) {
        if (!ids.has(id)) selected.delete(id)
      })
      if (anchorId && !ids.has(anchorId)) anchorId = null
    }

    function selectEntry(entry, visible, ev) {
      if (ev.shiftKey && anchorId) {
        selectRange(anchorId, entry.id, visible, ev.metaKey || ev.ctrlKey)
      } else if (ev.metaKey || ev.ctrlKey) {
        if (selected.has(entry.id)) selected.delete(entry.id)
        else selected.add(entry.id)
      } else {
        selected.clear()
        selected.add(entry.id)
      }
      anchorId = entry.id
      render()
    }

    function selectRange(fromId, toId, visible, additive) {
      const from = visible.findIndex(function (entry) { return entry.id === fromId })
      const to = visible.findIndex(function (entry) { return entry.id === toId })
      if (from < 0 || to < 0) return
      if (!additive) selected.clear()
      const start = Math.min(from, to)
      const end = Math.max(from, to)
      for (let i = start; i <= end; i++) selected.add(visible[i].id)
    }

    ctx.onCleanup(aiditor.effect(render))
    return root
  }

  function clearBody(el) {
    while (el.firstChild) ui.dispose(el.firstChild)
  }

  function buildRow(entry, visible, expanded, selected, selectEntry, rerender) {
    const row = ui.h('div', 'aiditor-ui-errlog-row aiditor-ui-errlog-row-' + entry.level)
    if (expanded.has(entry.id)) row.classList.add('aiditor-ui-errlog-row-open')
    if (selected.has(entry.id)) row.classList.add('aiditor-ui-errlog-row-selected')
    row.tabIndex = 0
    row.setAttribute('role', 'option')
    row.setAttribute('aria-selected', selected.has(entry.id) ? 'true' : 'false')
    row.addEventListener('mousedown', function (ev) {
      if (ev.shiftKey) ev.preventDefault()
    })
    row.addEventListener('click', function (ev) { selectEntry(entry, visible, ev) })
    row.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      ev.preventDefault()
      selectEntry(entry, visible, ev)
    })

    const main = ui.h('div', 'aiditor-ui-errlog-main')
    const level = ui.h('button', 'aiditor-ui-errlog-level aiditor-ui-errlog-level-' + entry.level, {
      type: 'button',
      'aria-label': expanded.has(entry.id) ? 'Collapse log entry' : 'Expand log entry',
      text: entry.level,
    })
    level.addEventListener('click', function (ev) {
      ev.stopPropagation()
      if (expanded.has(entry.id)) expanded.delete(entry.id)
      else expanded.add(entry.id)
      rerender()
    })
    main.appendChild(level)
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-msg', { text: entry.message }))
    main.appendChild(ui.h('span', 'aiditor-ui-errlog-meta', {
      text: shortSource(entry.source) + ' · ' + formatTime(entry.time),
    }))
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
