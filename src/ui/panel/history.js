// History panel component - generic timeline browser for aiditor.history.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'aiditor-history-panel')
    const errorSig = aiditor.signal(null)

    const bar = ui.h('div', 'aiditor-history-toolbar')
    const undoBtn = ui.iconButton({ icon: 'undo', title: 'Undo', size: 'sm' })
    const redoBtn = ui.iconButton({ icon: 'redo', title: 'Redo', size: 'sm' })
    const status = ui.h('div', 'aiditor-history-status')
    bar.appendChild(undoBtn)
    bar.appendChild(redoBtn)
    bar.appendChild(status)
    root.appendChild(bar)

    const errorBox = ui.h('div', 'aiditor-history-error')
    root.appendChild(errorBox)

    const body = ui.view({ className: 'aiditor-history-body' })
    root.appendChild(body)

    undoBtn.addEventListener('click', function () {
      const history = resolveHistory(propsSig.peek())
      if (history) runJump(history, 'undo', null, propsSig, errorSig)
    })
    redoBtn.addEventListener('click', function () {
      const history = resolveHistory(propsSig.peek())
      if (history) runJump(history, 'redo', null, propsSig, errorSig)
    })

    function render() {
      const props = propsSig()
      const history = resolveHistory(props)
      const savedIndex = resolveSavedIndex(props)
      const err = errorSig()
      ui.disposeChildren(body)

      if (!history) {
        status.textContent = 'No history'
        undoBtn.disabled = true
        redoBtn.disabled = true
        errorBox.hidden = !err
        errorBox.textContent = err || ''
        body.appendChild(ui.h('div', 'aiditor-history-empty', { text: 'No history bound' }))
        return
      }

      const entries = history.entries()
      const index = history.index()
      const applying = !!history.applying()
      undoBtn.disabled = applying || !history.canUndo()
      redoBtn.disabled = applying || !history.canRedo()
      status.textContent = statusText(entries, index, savedIndex, applying)
      errorBox.hidden = !err
      errorBox.textContent = err || ''

      if (!entries.length) {
        body.appendChild(ui.h('div', 'aiditor-history-empty', { text: 'No history entries' }))
        return
      }

      for (let i = entries.length - 1; i >= 0; i--) {
        body.appendChild(row(entries[i], i, index, savedIndex, applying, propsSig, errorSig))
      }
    }

    ctx.onCleanup(aiditor.effect(render))
    return root
  }

  function resolveHistory(props) {
    props = props || {}
    const binding = aiditor.history.binding(props.historyId || 'default')
    return binding && binding.history || null
  }

  function resolveBinding(props) {
    props = props || {}
    return aiditor.history.binding(props.historyId || 'default')
  }

  function resolveSavedIndex(props) {
    props = props || {}
    let value = props.savedIndex
    const binding = resolveBinding(props)
    if (value == null && binding) value = binding.savedIndex
    if (typeof value === 'function' && binding && value === binding.savedIndex) value = value()
    return value == null ? null : Number(value)
  }

  function resolveHook(props, name) {
    props = props || {}
    const binding = resolveBinding(props)
    return binding && binding[name] || null
  }

  function row(entry, index, currentIndex, savedIndex, applying, propsSig, errorSig) {
    const cls = [
      'aiditor-history-row',
      index === currentIndex ? 'aiditor-history-row-current' : '',
      index === savedIndex ? 'aiditor-history-row-saved' : '',
    ].filter(Boolean).join(' ')
    const button = ui.h('button', cls, { type: 'button' })
    button.disabled = applying || index === currentIndex
    button.addEventListener('click', function () {
      const history = resolveHistory(propsSig.peek())
      if (history) runJump(history, 'jump', index, propsSig, errorSig)
    })

    const marker = ui.h('span', 'aiditor-history-marker')
    if (index === currentIndex) marker.textContent = 'current'
    else if (index === savedIndex) marker.textContent = 'saved'
    button.appendChild(marker)

    const main = ui.h('span', 'aiditor-history-main')
    main.appendChild(ui.h('span', 'aiditor-history-label', { text: entry.label || 'Change' }))
    main.appendChild(ui.h('span', 'aiditor-history-meta', { text: metaText(entry) }))
    button.appendChild(main)
    return button
  }

  function runJump(history, action, index, propsSig, errorSig) {
    const props = propsSig.peek()
    errorSig.set(null)
    let task
    if (action === 'undo') task = history.undo()
    else if (action === 'redo') task = history.redo()
    else task = history.jump(index)
    Promise.resolve(task).catch(function (err) {
      const hook = resolveHook(props, 'onError')
      if (hook) aiditor.safeCall({ scope: 'history-panel' }, function () { hook(err, { action: action, index: index, history: history }) })
      errorSig.set(errorMessage(err))
    })
  }

  function statusText(entries, index, savedIndex, applying) {
    const total = entries.length
    const current = index < 0 ? 0 : index + 1
    const saved = savedIndex == null ? 'saved marker off' : (index === savedIndex ? 'saved' : 'modified')
    return (applying ? 'Applying · ' : '') + current + ' / ' + total + ' · ' + saved
  }

  function metaText(entry) {
    const time = entry && entry.time ? new Date(entry.time) : null
    const parts = []
    if (time) parts.push(pad(time.getHours()) + ':' + pad(time.getMinutes()) + ':' + pad(time.getSeconds()))
    if (entry && entry.meta && entry.meta.source) parts.push(String(entry.meta.source))
    return parts.join(' · ')
  }

  function errorMessage(err) {
    if (!err) return 'History operation failed'
    return err.message || String(err)
  }

  function pad(n) { return n < 10 ? '0' + n : String(n) }

  aiditor.registerComponent('history', {
    label:    'History',
    icon:     'history',
    category: 'panel',
    defaults: function () { return { title: 'History', icon: 'history', props: { historyId: 'default' } } },
    factory:  factory,
  })
})(window.aiditor = window.aiditor || {})
