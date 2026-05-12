// aeditor.ui.view - themed editor view surface.
//
// opts: {
//   children?,
//   maxHeight?,
//   scroll?: 'auto' | 'both' | 'x' | 'y' | 'hidden' | 'none' | signal,
//   padded? | padding?: boolean | signal,
//   className?
// }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  function appendChildren(el, children) {
    if (!children) return
    const list = Array.isArray(children) ? children : [children]
    for (let i = 0; i < list.length; i++) el.appendChild(list[i])
  }

  ui.view = function (opts) {
    const o = opts || {}
    const scrollSig = ui.asSig(o.scroll || (o.both ? 'both' : 'auto'))
    const paddedSig = ui.asSig(o.padded || o.padding || false)
    let cls = 'aeditor-ui-view'
    if (o.className) cls += ' ' + o.className

    const el = ui.h('div', cls)
    if (o.maxHeight != null) el.style.maxHeight = (typeof o.maxHeight === 'number' ? o.maxHeight + 'px' : o.maxHeight)
    ui.bind(el, scrollSig, function (value) {
      const mode = value === 'x' || value === 'y' || value === 'both' || value === 'hidden' || value === 'none'
        ? value
        : 'auto'
      el.classList.remove(
        'aeditor-ui-view-scroll-auto',
        'aeditor-ui-view-scroll-both',
        'aeditor-ui-view-scroll-x',
        'aeditor-ui-view-scroll-y',
        'aeditor-ui-view-scroll-hidden',
        'aeditor-ui-view-scroll-none',
        'aeditor-ui-scrollarea',
        'aeditor-ui-scrollarea-both'
      )
      el.classList.add('aeditor-ui-view-scroll-' + mode)
      if (mode !== 'none' && mode !== 'hidden') el.classList.add('aeditor-ui-scrollarea')
      if (mode === 'both') el.classList.add('aeditor-ui-scrollarea-both')
    })
    ui.bind(el, paddedSig, function (value) {
      el.classList.toggle('aeditor-ui-view-padded', !!value)
    })
    appendChildren(el, o.children)
    return el
  }
})(window.aeditor = window.aeditor || {})
