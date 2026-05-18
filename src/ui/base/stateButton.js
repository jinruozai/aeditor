// aiditor.ui.stateButton - button whose display follows a small state set.
//
// opts:
//   value     : signal<any> | any
//   states    : [{ value, icon, text?, title?, ariaLabel?, kind?, pressed? }, ...]
//   off/on    : shorthand for boolean states when `states` is omitted
//   next?     : (current, states, event) => any
//   onChange? : (next, current, event) => void
//   size/kind/disabled: button defaults
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.stateButton = function (opts) {
    const o = opts || {}
    const value = ui.asSig(o.value != null ? o.value : false)
    const states = normalizeStates(o)
    const hasText = states.some(function (s) { return s.text != null || s.label != null })
    const write = ui.writer(value, o.onChange && function (next) {
      o.onChange(next, value.peek(), currentEvent)
    }, 'ui.stateButton')
    let currentEvent = null

    const initial = stateFor(value.peek(), states)
    const iconSig = aiditor.signal(read(initial.icon) || '')
    const textSig = aiditor.signal(stateText(initial))
    const titleSig = aiditor.signal(read(initial.title) || stateText(initial))
    const ariaSig = aiditor.signal(read(initial.ariaLabel) || read(initial.title) || stateText(initial))
    const sizeSig = ui.asSig(o.size || 'md')
    const kindSig = aiditor.signal(read(initial.kind) || read(o.kind) || 'ghost')
    const disabledSig = ui.asSig(o.disabled != null ? o.disabled : false)

    const btn = ui.h('button', hasText ? 'aiditor-ui-btn aiditor-ui-state-btn' : 'aiditor-ui-icon-btn aiditor-ui-state-btn', { type: 'button' })
    const iconEl = ui.icon({ name: iconSig, size: sizeSig })
    const textEl = ui.h('span', 'aiditor-ui-btn-text')
    btn.appendChild(iconEl)
    if (hasText) btn.appendChild(textEl)

    if (hasText) ui.bindClass(btn, sizeSig, 'aiditor-ui-btn-')
    else ui.bindClass(btn, sizeSig, 'aiditor-ui-icon-btn-')
    ui.bindClass(btn, kindSig, 'aiditor-ui-btn-')
    ui.bindAttr(btn, disabledSig, 'disabled')
    ui.bind(btn, iconSig, function (v) {
      btn.classList.toggle('aiditor-ui-state-btn-icon-empty', !v)
    })
    ui.bind(btn, titleSig, function (v) {
      const s = v == null ? '' : String(v)
      if (s) btn.setAttribute('title', s)
      else btn.removeAttribute('title')
    })
    ui.bind(btn, ariaSig, function (v) {
      const s = v == null ? '' : String(v)
      if (s) btn.setAttribute('aria-label', s)
      else btn.removeAttribute('aria-label')
    })
    if (hasText) ui.bind(btn, textSig, function (v) {
      const s = v == null ? '' : String(v)
      textEl.textContent = s
      btn.classList.toggle('aiditor-ui-btn-text-empty', s === '')
    })

    btn.addEventListener('click', function (ev) {
      if (btn.disabled) return
      const current = value.peek()
      const next = typeof o.next === 'function' ? o.next(current, states, ev) : nextValue(current, states)
      currentEvent = ev
      write(next)
      currentEvent = null
    })

    ui.collect(btn, aiditor.effect(function () {
      const v = value()
      const state = stateFor(v, states)
      const text = stateText(state)
      const title = read(state.title) || text
      iconSig.set(read(state.icon) || '')
      textSig.set(text)
      titleSig.set(title)
      ariaSig.set(read(state.ariaLabel) || title)
      kindSig.set(read(state.kind) || read(o.kind) || 'ghost')
      btn.dataset.state = String(state.value)
      const pressed = state.pressed != null ? !!read(state.pressed) : state.value === true
      btn.classList.toggle('aiditor-ui-state-btn-on', pressed)
      if (typeof state.value === 'boolean') btn.setAttribute('aria-pressed', String(pressed))
      else btn.removeAttribute('aria-pressed')
    }))

    return btn
  }

  function normalizeStates(o) {
    if (Array.isArray(o.states) && o.states.length) return o.states
    return [
      Object.assign({ value: false }, o.off || {}),
      Object.assign({ value: true }, o.on || {}),
    ]
  }

  function stateFor(value, states) {
    for (let i = 0; i < states.length; i++) if (states[i].value === value) return states[i]
    return states[0]
  }

  function nextValue(value, states) {
    let idx = 0
    for (let i = 0; i < states.length; i++) if (states[i].value === value) { idx = i; break }
    return states[(idx + 1) % states.length].value
  }

  function stateText(state) {
    return read(state.text) || read(state.label) || ''
  }

  function read(value) {
    return ui.isSignal && ui.isSignal(value) ? value() : value
  }
})(window.aiditor = window.aiditor || {})
