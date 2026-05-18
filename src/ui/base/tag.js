// aiditor.ui.tag — label chip with optional close button.
//
// aiditor.ui.tag({ text?: string|signal, color?: string|signal, onClose? })
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.tag = function (opts) {
    const o = opts || {}
    const text  = ui.asSig(o.text  != null ? o.text  : '')
    const color = ui.asSig(o.color != null ? o.color : '')
    const el = ui.h('span', 'aiditor-ui-tag')
    const sp = ui.h('span', 'aiditor-ui-tag-text')
    el.appendChild(sp)
    ui.bindText(sp, text)
    ui.bind(el, color, function (v) {
      if (v) el.style.setProperty('--aiditor-tag-color', v)
      else el.style.removeProperty('--aiditor-tag-color')
    })
    if (o.onClose) {
      const x = ui.h('button', 'aiditor-ui-tag-close', { type: 'button', text: '×' })
      x.addEventListener('click', function (e) { e.stopPropagation(); o.onClose(e) })
      el.appendChild(x)
    }
    return el
  }
})(window.aiditor = window.aiditor || {})
