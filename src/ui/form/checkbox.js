// aeditor.ui.checkbox — boolean toggle with label.
//
// opts: { value: bool|signal, onChange?, label?: string|signal, disabled?: bool|signal }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.checkbox = function (opts) {
    const o = opts || {}
    const sig      = ui.asSig(o.value    != null ? o.value    : false)
    const label    = ui.asSig(o.label    != null ? o.label    : '')
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.checkbox')

    const el = ui.h('label', 'aeditor-ui-check')
    const box = ui.h('input', 'aeditor-ui-check-box', { type: 'checkbox' })
    const mark = ui.h('span', 'aeditor-ui-check-mark')
    const lab = ui.h('span', 'aeditor-ui-check-label')
    el.appendChild(box); el.appendChild(mark); el.appendChild(lab)

    ui.bindText(lab, label)
    ui.bind(el, label, function (v) { lab.style.display = (v == null || v === '') ? 'none' : '' })
    ui.bind(el, sig, function (v) { box.checked = !!v })
    ui.bindAttr(box, disabled, 'disabled')
    box.addEventListener('change', function () { doWrite(box.checked) })
    return el
  }
})(window.aeditor = window.aeditor || {})
