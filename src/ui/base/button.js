// aiditor.ui.button — text button with optional icon.
//
// opts:
//   text     : string | signal<string>
//   icon     : string | signal<string> | HTMLElement
//   kind     : 'default' | 'primary' | 'ghost' | 'danger' | signal  (default)
//   size     : 'sm' | 'md' | 'lg' | signal                          (md)
//   disabled : boolean | signal<boolean>
//   onClick  : (e) => void
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.button = function (opts) {
    const o = opts || {}
    const text     = ui.asSig(o.text     != null ? o.text     : '')
    const kind     = ui.asSig(o.kind     != null ? o.kind     : 'default')
    const size     = ui.asSig(o.size     != null ? o.size     : 'md')
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)

    const el = ui.h('button', 'aiditor-ui-btn', { type: 'button' })
    ui.bindClass(el, kind, 'aiditor-ui-btn-')
    ui.bindClass(el, size, 'aiditor-ui-btn-')
    ui.bindAttr(el, disabled, 'disabled')

    // Optional icon slot. Static HTMLElement goes in as-is; a signal or
    // string drives a managed ui.icon child whose glyph/size track the signals.
    let iconEl = null
    if (o.icon instanceof HTMLElement) {
      iconEl = o.icon
      el.appendChild(iconEl)
    } else if (o.icon != null) {
      iconEl = ui.icon({ glyph: o.icon, size: size })
      el.appendChild(iconEl)
    }

    // Text span — always present, hidden when empty so the icon can center.
    const sp = ui.h('span', 'aiditor-ui-btn-text')
    el.appendChild(sp)
    ui.bind(el, text, function (v) {
      const s = v == null ? '' : String(v)
      sp.textContent = s
      el.classList.toggle('aiditor-ui-btn-text-empty', s === '')
    })

    if (o.onClick) el.addEventListener('click', function (e) { if (!el.disabled) o.onClick(e) })
    return el
  }
})(window.aiditor = window.aiditor || {})
