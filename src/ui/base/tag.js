// aeditor.ui.tag — label chip with optional close button.
//
// aeditor.ui.tag({ text?: string|signal, color?: string|signal, onClose? })
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.tag = function (opts) {
    const o = opts || {}
    const text  = ui.asSig(o.text  != null ? o.text  : '')
    const color = ui.asSig(o.color != null ? o.color : '')
    const el = ui.h('span', 'aeditor-ui-tag')
    const sp = ui.h('span', 'aeditor-ui-tag-text')
    el.appendChild(sp)
    ui.bindText(sp, text)
    ui.bind(el, color, function (v) {
      if (v) el.style.setProperty('--aeditor-tag-color', v)
      else el.style.removeProperty('--aeditor-tag-color')
    })
    if (o.onClose) {
      const x = ui.h('button', 'aeditor-ui-tag-close', { type: 'button', text: '×' })
      x.addEventListener('click', function (e) { e.stopPropagation(); o.onClose(e) })
      el.appendChild(x)
    }
    return el
  }
})(window.aeditor = window.aeditor || {})
