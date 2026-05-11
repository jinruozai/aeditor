// aeditor.ui.textarea — multi-line text bound to a signal.
//
// opts: {
//   value: string|signal, onChange?,
//   placeholder?: string|signal, rows?: number,
//   disabled?: boolean|signal, mono?: boolean|signal,
// }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.textarea = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : '')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const mono        = ui.asSig(o.mono        != null ? o.mono        : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.textarea')

    const el = ui.h('textarea', 'aeditor-ui-textarea', { rows: String(o.rows || 4) })
    ui.bindAttr(el, placeholder, 'placeholder')
    ui.bindAttr(el, disabled,    'disabled')
    ui.bind(el, mono, function (v) { el.classList.toggle('aeditor-ui-textarea-mono', !!v) })
    ui.bind(el, sig, function (v) {
      if (document.activeElement !== el) el.value = v == null ? '' : String(v)
    })
    el.addEventListener('input', function () { doWrite(el.value) })
    return el
  }
})(window.aeditor = window.aeditor || {})
