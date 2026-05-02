// EF.ui.popover — floating anchored panel.
//
// Thin shell over ui._overlay. Owns: portal mounting, anchor placement,
// inline content host. Delegates: dismissal, focus, ARIA, z-index.
//
// opts: { anchor, content, side?, align?, role?, onDismiss? }
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.popover = function (opts) {
    const o = opts || {}
    const el = ui.h('div', 'ef-ui-popover')
    if (o.content) {
      el.appendChild(o.content)
      ui.collect(el, function () { ui.dispose(o.content) })
    }

    const unmount = ui.portal(el)
    ui.place(o.anchor, el, { side: o.side || 'bottom', align: o.align || 'start' })

    const overlay = ui._overlay.open(el, {
      anchor:   o.anchor,
      role:     o.role || 'dialog',
      onDismiss: function () {
        ui.dispose(el)
        unmount()
        o.onDismiss && o.onDismiss()
      },
    })

    return { el: el, close: overlay.close }
  }
})(window.EF = window.EF || {})
