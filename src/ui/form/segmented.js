// aiditor.ui.segmented — segmented button group (single selection).
//
// opts: {
//   value: signal<any>, onChange?,
//   options: [{ value, label, icon? }],
//   disabled?: bool|signal,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.segmented = function (opts) {
    const o = opts || {}
    const sig      = ui.asSig(o.value)
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.segmented')
    const el = ui.h('div', 'aiditor-ui-seg')
    ui.bind(el, disabled, function (v) { el.classList.toggle('aiditor-ui-seg-disabled', !!v) })

    const btns = []
    const items = o.options || []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const b = ui.h('button', 'aiditor-ui-seg-btn', { type: 'button' })
      if (it.icon) b.appendChild(ui.icon({ glyph: it.icon }))
      if (it.label != null) {
        const sp = ui.h('span', null, { text: it.label })
        b.appendChild(sp)
      }
      b.addEventListener('click', function () { if (!disabled.peek()) doWrite(it.value) })
      ui.bindAttr(b, disabled, 'disabled')
      btns.push({ b: b, val: it.value })
      el.appendChild(b)
    }
    ui.bind(el, sig, function (v) {
      for (let i = 0; i < btns.length; i++) btns[i].b.classList.toggle('aiditor-ui-seg-active', btns[i].val === v)
    })
    return el
  }
})(window.aiditor = window.aiditor || {})
