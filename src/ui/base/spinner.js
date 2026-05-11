// aeditor.ui.spinner — indeterminate loading indicator (CSS-only).
//
// aeditor.ui.spinner({ size?: 'sm'|'md'|'lg' | signal })
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.spinner = function (opts) {
    const o = opts || {}
    const size = ui.asSig(o.size != null ? o.size : 'md')
    const el = ui.h('span', 'aeditor-ui-spinner')
    ui.bindClass(el, size, 'aeditor-ui-spinner-')
    return el
  }
})(window.aeditor = window.aeditor || {})
