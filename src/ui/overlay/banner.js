// aiditor.ui.banner — inline status banner (info / success / warn / error).
//
// Use this when the message is part of page flow (above a form, inside a
// panel). For modal acknowledgements use ui.alert; for transient toasts use
// ui.toast.
//
// opts: {
//   kind?: 'info'|'success'|'warn'|'error' | signal,
//   title?: string|signal,
//   message?: string|signal,
//   onClose?,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.banner = function (opts) {
    const o = opts || {}
    const kind    = ui.asSig(o.kind    != null ? o.kind    : 'info')
    const title   = ui.asSig(o.title   != null ? o.title   : '')
    const message = ui.asSig(o.message != null ? o.message : '')
    const el = ui.h('div', 'aiditor-ui-banner')
    ui.bindClass(el, kind, 'aiditor-ui-banner-')
    ui.bind(el, kind, function (v) {
      const assertive = v === 'error' || v === 'warn'
      el.setAttribute('role',       assertive ? 'alert'     : 'status')
      el.setAttribute('aria-live',  assertive ? 'assertive' : 'polite')
    })

    const iconEl = ui.h('span', 'aiditor-ui-banner-icon', { 'aria-hidden': 'true' })
    el.appendChild(iconEl)

    const inner = ui.h('div', 'aiditor-ui-banner-body')
    const titleEl = ui.h('div', 'aiditor-ui-banner-title')
    ui.bindText(titleEl, title)
    ui.bind(el, title, function (v) { titleEl.style.display = (v == null || v === '') ? 'none' : '' })
    inner.appendChild(titleEl)
    const msgEl = ui.h('div', 'aiditor-ui-banner-msg')
    ui.bindText(msgEl, message)
    inner.appendChild(msgEl)
    el.appendChild(inner)

    if (o.onClose) {
      const x = ui.h('button', 'aiditor-ui-banner-close',
        { type: 'button', text: '×', 'aria-label': 'Dismiss' })
      x.addEventListener('click', o.onClose)
      el.appendChild(x)
    }
    return el
  }
})(window.aiditor = window.aiditor || {})
