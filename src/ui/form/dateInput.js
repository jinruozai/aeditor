// aeditor.ui.dateInput — date entry via the browser's native date picker.
//
// opts: {
//   value: string | signal<string>   ISO 'YYYY-MM-DD' (empty = unset)
//   onChange?: (v) => void
//   min?: string | signal<string>    ISO lower bound
//   max?: string | signal<string>    ISO upper bound
//   disabled?: bool | signal<bool>
// }
//
// The component is intentionally thin: we rely on the native `<input type=date>`
// rather than re-implementing a calendar. The wrapper `.aeditor-ui-field` gives it
// the same visual frame as ui.input, so dates and strings sit flush in forms.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.dateInput = function (opts) {
    const o = opts || {}
    const sig      = ui.asSig(o.value    != null ? o.value    : '')
    const minS     = ui.asSig(o.min      != null ? o.min      : '')
    const maxS     = ui.asSig(o.max      != null ? o.max      : '')
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.dateInput')

    const wrap = ui.h('div', 'aeditor-ui-field')
    const el = ui.h('input', 'aeditor-ui-input aeditor-ui-date-input', { type: 'date' })
    wrap.appendChild(el)

    ui.bind(wrap, sig, function (v) {
      if (document.activeElement !== el) el.value = v == null ? '' : String(v)
    })
    ui.bind(wrap, minS,     function (v) { v ? el.setAttribute('min', v) : el.removeAttribute('min') })
    ui.bind(wrap, maxS,     function (v) { v ? el.setAttribute('max', v) : el.removeAttribute('max') })
    ui.bind(wrap, disabled, function (v) {
      el.disabled = !!v
      wrap.classList.toggle('aeditor-ui-field-disabled', !!v)
    })

    el.addEventListener('change', function () { doWrite(el.value) })
    el.addEventListener('input',  function () { doWrite(el.value) })
    return wrap
  }
})(window.aeditor = window.aeditor || {})
