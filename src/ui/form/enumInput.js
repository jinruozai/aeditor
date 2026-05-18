// aiditor.ui.enumInput — bitmask flags editor (toggle multiple flags from a set).
//
// opts:
//   value    : signal<number>        bitmask
//   onChange?: (v) => void
//   options  : [{ value: number, label: string }]
//   disabled?: bool|signal
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.enumInput = function (opts) {
    const o = opts || {}
    const sig      = ui.asSig(o.value    != null ? o.value    : 0)
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.enumInput')
    const el = ui.h('div', 'aiditor-ui-enum')
    const items = o.options || []
    const btns = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const b = ui.h('button', 'aiditor-ui-enum-btn', { type: 'button', text: it.label, title: '0x' + it.value.toString(16) })
      b.addEventListener('click', function () {
        if (disabled.peek()) return
        const cur = sig.peek()
        doWrite((cur & it.value) ? (cur & ~it.value) : (cur | it.value))
      })
      ui.bindAttr(b, disabled, 'disabled')
      btns.push({ b: b, val: it.value })
      el.appendChild(b)
    }
    ui.bind(el, sig, function (v) {
      for (let i = 0; i < btns.length; i++) btns[i].b.classList.toggle('aiditor-ui-enum-on', !!(v & btns[i].val))
    })
    return el
  }
})(window.aiditor = window.aiditor || {})
