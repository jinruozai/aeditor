// aiditor.ui.switch — toggle switch (functionally identical to checkbox, different look).
//
// opts: { value: bool|signal, onChange?, label?: string|signal, disabled?: bool|signal }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui['switch'] = function (opts) {
    const o = opts || {}
    const sig      = ui.asSig(o.value    != null ? o.value    : false)
    const label    = ui.asSig(o.label    != null ? o.label    : '')
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.switch')

    const el = ui.h('label', 'aiditor-ui-switch')
    const box = ui.h('input', 'aiditor-ui-switch-box', { type: 'checkbox' })
    const track = ui.h('span', 'aiditor-ui-switch-track')
    const knob  = ui.h('span', 'aiditor-ui-switch-knob')
    const lab = ui.h('span', 'aiditor-ui-switch-label')
    track.appendChild(knob)
    el.appendChild(box); el.appendChild(track); el.appendChild(lab)

    ui.bindText(lab, label)
    ui.bind(el, label, function (v) { lab.style.display = (v == null || v === '') ? 'none' : '' })
    ui.bind(el, sig, function (v) {
      box.checked = !!v
      el.classList.toggle('aiditor-ui-switch-on', !!v)
    })
    ui.bindAttr(box, disabled, 'disabled')
    box.addEventListener('change', function () { doWrite(box.checked) })
    return el
  }
})(window.aiditor = window.aiditor || {})
