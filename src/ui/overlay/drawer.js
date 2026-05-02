// EF.ui.drawer — slide-in side panel.
//
// opts: { side?: 'right'|'left'|'top'|'bottom', title?, content, onClose? }
//
// Like modal, drawer is modal-class (focus trap + ARIA dialog). The open/
// close animation is driven by a CSS class, and unmount is deferred by
// --ef-dur-slow (read via ui.readNum) so the slide-out tween plays before
// the DOM detaches.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  let _idSeq = 0

  ui.drawer = function (opts) {
    const o = opts || {}
    const side = o.side || 'right'
    const back = ui.h('div', 'ef-ui-drawer-backdrop')
    const panel = ui.h('div', 'ef-ui-drawer ef-ui-drawer-' + side)

    let titleId = null
    if (o.title) {
      titleId = 'ef-drawer-title-' + (++_idSeq)
      const head = ui.h('div', 'ef-ui-drawer-head')
      const titleEl = ui.h('span', 'ef-ui-drawer-title', { text: o.title })
      titleEl.id = titleId
      head.appendChild(titleEl)
      const x = ui.h('button', 'ef-ui-modal-close',
        { type: 'button', text: '×', 'aria-label': 'Close drawer' })
      x.addEventListener('click', function () { overlay.close() })
      head.appendChild(x)
      panel.appendChild(head)
    }

    const body = ui.h('div', 'ef-ui-drawer-body')
    if (o.content) {
      body.appendChild(o.content)
      ui.collect(panel, function () { ui.dispose(o.content) })
    }
    panel.appendChild(body)
    back.appendChild(panel)

    const unmount = ui.portal(back)
    requestAnimationFrame(function () { panel.classList.add('ef-ui-drawer-open') })

    const overlay = ui._overlay.open(panel, {
      modal:          true,
      outsideTarget:  back,
      role:           'dialog',
      ariaLabelledBy: titleId || undefined,
      ariaLabel:      titleId ? undefined : (o.ariaLabel || 'Drawer'),
      onDismiss: function () {
        panel.classList.remove('ef-ui-drawer-open')
        // Slide-out transition uses --ef-dur-slow; unmount after it finishes.
        setTimeout(function () { ui.dispose(panel); unmount(); o.onClose && o.onClose() },
          ui.readNum('--ef-dur-slow', 240))
      },
    })

    return { el: panel, close: overlay.close }
  }
})(window.EF = window.EF || {})
