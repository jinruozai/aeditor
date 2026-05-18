// aiditor.ui.spinner — indeterminate loading indicator (CSS-only).
//
// aiditor.ui.spinner({ size?: 'sm'|'md'|'lg' | signal })
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.spinner = function (opts) {
    const o = opts || {}
    const size = ui.asSig(o.size != null ? o.size : 'md')
    const el = ui.h('span', 'aiditor-ui-spinner')
    ui.bindClass(el, size, 'aiditor-ui-spinner-')
    return el
  }
})(window.aiditor = window.aiditor || {})
