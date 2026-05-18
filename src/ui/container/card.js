// aiditor.ui.card — bordered container with optional title bar.
//
// opts: {
//   title?: string|signal,
//   children?: HTMLElement[] | HTMLElement,
//   padded?: boolean,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.card = function (opts) {
    const o = opts || {}
    const el = ui.h('div', 'aiditor-ui-card' + (o.padded === false ? '' : ' aiditor-ui-card-padded'))
    if (o.title != null) {
      const title = ui.asSig(o.title)
      const head = ui.h('div', 'aiditor-ui-card-head')
      ui.bindText(head, title)
      el.appendChild(head)
    }
    const body = ui.h('div', 'aiditor-ui-card-body')
    el.appendChild(body)
    if (o.children) {
      const list = Array.isArray(o.children) ? o.children : [o.children]
      for (let i = 0; i < list.length; i++) body.appendChild(list[i])
    }
    el.body = body
    return el
  }
})(window.aiditor = window.aiditor || {})
