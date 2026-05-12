// aeditor.ui.section — collapsible labeled section header + body.
//
// opts: {
//   title?: string|signal,
//   meta?: string|signal,
//   collapsed?: bool|signal, onToggle?,
//   leading?: HTMLElement|string,
//   trailing?: HTMLElement|string,
//   className?: string,
//   bodyClassName?: string,
//   children?: HTMLElement[] | HTMLElement,
// }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.section = function (opts) {
    const o = opts || {}
    const sig   = ui.asSig(o.collapsed != null ? o.collapsed : false)
    const title = ui.asSig(o.title     != null ? o.title     : '')
    const meta  = ui.asSig(o.meta      != null ? o.meta      : '')
    const doWrite = ui.writer(sig, o.onToggle, 'ui.section')
    const el = ui.h('section', 'aeditor-ui-section')
    if (o.className) el.classList.add.apply(el.classList, String(o.className).split(/\s+/).filter(Boolean))
    const head = ui.h('button', 'aeditor-ui-section-head', { type: 'button' })
    const arrow = ui.icon({ name: 'chevron-down', size: 'sm' })
    arrow.classList.add('aeditor-ui-section-arrow')
    const titleEl = ui.h('span', 'aeditor-ui-section-title')
    const metaEl = ui.h('span', 'aeditor-ui-section-meta')
    ui.bindText(titleEl, title)
    ui.bindText(metaEl, meta)
    if (o.leading != null) head.appendChild(slot(o.leading, 'leading'))
    head.appendChild(arrow); head.appendChild(titleEl); head.appendChild(metaEl)
    if (o.trailing != null) head.appendChild(slot(o.trailing, 'trailing'))
    const body = ui.h('div', 'aeditor-ui-section-body')
    if (o.bodyClassName) body.classList.add.apply(body.classList, String(o.bodyClassName).split(/\s+/).filter(Boolean))
    el.appendChild(head); el.appendChild(body)
    head.addEventListener('click', function () { doWrite(!sig.peek()) })
    ui.bind(el, sig, function (v) {
      el.classList.toggle('aeditor-ui-section-collapsed', !!v)
      arrow.style.transform = v ? 'rotate(-90deg)' : ''
    })
    if (o.children) {
      const list = Array.isArray(o.children) ? o.children : [o.children]
      for (let i = 0; i < list.length; i++) body.appendChild(list[i])
    }
    el.body = body
    return el
  }

  function slot(content, name) {
    const el = ui.h('span', 'aeditor-ui-section-' + name)
    if (content instanceof HTMLElement) el.appendChild(content)
    else el.textContent = String(content)
    return el
  }
})(window.aeditor = window.aeditor || {})
