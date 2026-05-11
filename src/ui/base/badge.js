// aeditor.ui.badge — small numeric / dot indicator.
//
// aeditor.ui.badge({
//   text?: string|signal,
//   kind?: 'default'|'success'|'warn'|'error'|'info' | signal,
//   dot?:  boolean|signal,
// })
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.badge = function (opts) {
    const o = opts || {}
    const text = ui.asSig(o.text != null ? o.text : '')
    const kind = ui.asSig(o.kind != null ? o.kind : 'default')
    const dot  = ui.asSig(o.dot  != null ? o.dot  : false)
    const el = ui.h('span', 'aeditor-ui-badge')
    ui.bindClass(el, kind, 'aeditor-ui-badge-')
    ui.bind(el, dot, function (v) { el.classList.toggle('aeditor-ui-badge-dot', !!v) })
    ui.bind(el, text, function (v) {
      // Dot-style badges show no text even if text is provided.
      el.textContent = dot.peek() ? '' : (v == null ? '' : String(v))
    })
    return el
  }
})(window.aeditor = window.aeditor || {})
