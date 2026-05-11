// aeditor.ui.breadcrumbs — path crumbs with click handlers.
//
// opts: { items: [{ label, onClick? }] | signal<...> , separator? }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.breadcrumbs = function (opts) {
    const o = opts || {}
    const items = ui.asSig(o.items != null ? o.items : [])
    const sep = o.separator || '›'
    const el = ui.h('nav', 'aeditor-ui-crumbs')
    function rebuild(arr) {
      el.replaceChildren()
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i]
        const isLast = i === arr.length - 1
        const node = it.onClick ? ui.h('button', 'aeditor-ui-crumbs-link', { type: 'button', text: it.label }) : ui.h('span', 'aeditor-ui-crumbs-static', { text: it.label })
        if (it.onClick) node.addEventListener('click', it.onClick)
        if (isLast) node.classList.add('aeditor-ui-crumbs-last')
        el.appendChild(node)
        if (!isLast) el.appendChild(ui.h('span', 'aeditor-ui-crumbs-sep', { text: sep }))
      }
    }
    ui.bind(el, items, rebuild)
    return el
  }
})(window.aeditor = window.aeditor || {})
