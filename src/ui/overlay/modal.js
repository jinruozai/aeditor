// aeditor.ui.modal — centered modal dialog with backdrop.
//
// opts: { title, content: HTMLElement, footer?: HTMLElement, onClose? }
//
// The backdrop is an explicit dismissal target (click outside the box but
// inside the backdrop = close). ESC and focus trap come from _overlay.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  let _idSeq = 0

  ui.modal = function (opts) {
    const o = opts || {}
    const back = ui.h('div', 'aeditor-ui-modal-backdrop')
    const box  = ui.h('div', 'aeditor-ui-modal')

    let titleId = null
    if (o.title) {
      titleId = 'aeditor-modal-title-' + (++_idSeq)
      const head = ui.h('div', 'aeditor-ui-modal-head')
      const titleEl = ui.h('span', 'aeditor-ui-modal-title', { text: o.title })
      titleEl.id = titleId
      head.appendChild(titleEl)
      const x = ui.h('button', 'aeditor-ui-modal-close',
        { type: 'button', text: '×', 'aria-label': 'Close dialog' })
      x.addEventListener('click', function () { overlay.close() })
      head.appendChild(x)
      box.appendChild(head)
    }

    const body = ui.h('div', 'aeditor-ui-modal-body')
    if (o.content) {
      body.appendChild(o.content)
      ui.collect(box, function () { ui.dispose(o.content) })
    }
    box.appendChild(body)
    if (o.footer) {
      const foot = ui.h('div', 'aeditor-ui-modal-foot')
      foot.appendChild(o.footer)
      ui.collect(box, function () { ui.dispose(o.footer) })
      box.appendChild(foot)
    }
    back.appendChild(box)
    const unmount = ui.portal(back)

    const overlay = ui._overlay.open(box, {
      modal:          true,
      outsideTarget:  back,   // click on backdrop (outside box) → close
      role:           'dialog',
      ariaLabelledBy: titleId || undefined,
      ariaLabel:      titleId ? undefined : (o.ariaLabel || 'Dialog'),
      onDismiss: function () {
        ui.dispose(box)
        unmount()
        o.onClose && o.onClose()
      },
    })

    return { el: box, close: overlay.close }
  }
})(window.aeditor = window.aeditor || {})
