// aiditor.ui.scrollArea — styled scroll container (relies on browser scrollbars,
// but applies the framework's scrollbar theming via WebKit pseudo-elements
// and Firefox `scrollbar-color`).
//
// opts: { children?, maxHeight?, both? }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.scrollArea = function (opts) {
    const o = opts || {}
    const el = ui.h('div', 'aiditor-ui-scrollarea' + (o.both ? ' aiditor-ui-scrollarea-both' : ''))
    if (o.maxHeight != null) el.style.maxHeight = (typeof o.maxHeight === 'number' ? o.maxHeight + 'px' : o.maxHeight)
    if (o.children) {
      const list = Array.isArray(o.children) ? o.children : [o.children]
      for (let i = 0; i < list.length; i++) el.appendChild(list[i])
    }
    return el
  }
})(window.aiditor = window.aiditor || {})
