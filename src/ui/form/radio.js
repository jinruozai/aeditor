// aiditor.ui.radio — radio group bound to a signal.
//
// opts: {
//   value: signal<any>, onChange?,
//   options: [{ value, label }],
//   orientation?: 'horizontal'|'vertical'|signal,
//   disabled?: bool|signal,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.radio = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value)
    const orientation = ui.asSig(o.orientation != null ? o.orientation : 'horizontal')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.radio')
    const el = ui.h('div', 'aiditor-ui-radio-group')
    ui.bindClass(el, orientation, 'aiditor-ui-radio-')
    const name = 'r' + Math.random().toString(36).slice(2)

    const inputs = []
    const items = o.options || []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const lab = ui.h('label', 'aiditor-ui-radio')
      const inp = ui.h('input', 'aiditor-ui-radio-box', { type: 'radio', name: name })
      const dot = ui.h('span', 'aiditor-ui-radio-dot')
      const txt = ui.h('span', 'aiditor-ui-radio-label', { text: it.label != null ? it.label : String(it.value) })
      lab.appendChild(inp); lab.appendChild(dot); lab.appendChild(txt)
      inp.addEventListener('change', function () { if (inp.checked) doWrite(it.value) })
      ui.bindAttr(inp, disabled, 'disabled')
      inputs.push({ inp: inp, val: it.value })
      el.appendChild(lab)
    }
    ui.bind(el, sig, function (v) {
      for (let i = 0; i < inputs.length; i++) inputs[i].inp.checked = inputs[i].val === v
    })
    return el
  }
})(window.aiditor = window.aiditor || {})
