// aiditor.shortcuts — generic keyboard shortcut registry.
//
// The framework owns only the input-routing mechanism: matching keys,
// scoping, priority, cleanup, and editable/overlay guards. It does not bind
// application actions by default.
;(function (aiditor) {
  'use strict'

  const entries = []
  let bound = false

  function normKey(key) { return String(key || '').toLowerCase() }

  function isEditableTarget(el) {
    return !!(el && el.closest && el.closest(
      'input,textarea,select,[contenteditable="true"],.aiditor-ui-menu,.aiditor-ui-modal'
    ))
  }

  function eventScope(ev) {
    let el = ev.target
    while (el && el !== document) {
      if (el.dataset && el.dataset.efShortcutScope) return el.dataset.efShortcutScope
      el = el.parentElement
    }
    return ''
  }

  function match(spec, ev) {
    if (normKey(spec.key) !== normKey(ev.key)) return false
    if (!!spec.ctrl !== !!(ev.ctrlKey || ev.metaKey)) return false
    if (!!spec.shift !== !!ev.shiftKey) return false
    if (!!spec.alt !== !!ev.altKey) return false
    if (spec.scope && spec.scope !== eventScope(ev)) return false
    return !spec.when || spec.when(ev) !== false
  }

  function onKeydown(ev) {
    if (isEditableTarget(ev.target)) return
    const ordered = entries.slice().sort(function (a, b) {
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.seq - a.seq
    })
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i]
      if (!match(item.spec, ev)) continue
      ev.preventDefault()
      item.spec.run(ev)
      return
    }
  }

  function bind() {
    if (bound) return
    bound = true
    document.addEventListener('keydown', onKeydown, true)
  }

  let seq = 0
  function register(spec, owner) {
    bind()
    const item = { spec: spec || {}, priority: Number(spec && spec.priority) || 0, seq: ++seq }
    entries.push(item)
    const off = function () {
      const at = entries.indexOf(item)
      if (at >= 0) entries.splice(at, 1)
    }
    if (owner && aiditor.ui && aiditor.ui.collect) aiditor.ui.collect(owner, off)
    return off
  }

  function scope(el, name) {
    if (el && el.dataset) el.dataset.efShortcutScope = name || ''
    return el
  }

  aiditor.shortcuts = {
    register: register,
    scope: scope,
    isEditableTarget: isEditableTarget,
  }
})(window.aiditor = window.aiditor || {})
