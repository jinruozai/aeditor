// aiditor.ui.breadcrumbs — path crumbs with click handlers.
//
// opts: { items: [{ label, onClick? }] | signal<...> , separator? }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.breadcrumbs = function (opts) {
    const o = opts || {}
    const items = ui.asSig(o.items != null ? o.items : [])
    const sep = o.separator || '›'
    const el = ui.h('nav', 'aiditor-ui-crumbs')
    function rebuild(arr) {
      el.replaceChildren()
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i]
        const isLast = i === arr.length - 1
        const node = it.onClick ? ui.h('button', 'aiditor-ui-crumbs-link', { type: 'button', text: it.label }) : ui.h('span', 'aiditor-ui-crumbs-static', { text: it.label })
        if (it.onClick) node.addEventListener('click', it.onClick)
        if (isLast) node.classList.add('aiditor-ui-crumbs-last')
        el.appendChild(node)
        if (!isLast) el.appendChild(ui.h('span', 'aiditor-ui-crumbs-sep', { text: sep }))
      }
    }
    ui.bind(el, items, rebuild)
    return el
  }
})(window.aiditor = window.aiditor || {})
