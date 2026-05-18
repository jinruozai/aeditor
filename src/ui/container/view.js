// aiditor.ui.view - themed editor view surface.
//
// opts: {
//   children?,
//   maxHeight?,
//   scroll?: 'auto' | 'both' | 'x' | 'y' | 'hidden' | 'none' | signal,
//   padded? | padding?: boolean | signal,
//   className?
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  function appendChildren(el, children) {
    if (!children) return
    const list = Array.isArray(children) ? children : [children]
    for (let i = 0; i < list.length; i++) el.appendChild(list[i])
  }

  ui.view = function (opts) {
    const o = opts || {}
    const scrollSig = ui.asSig(o.scroll || (o.both ? 'both' : 'auto'))
    const paddedSig = ui.asSig(o.padded || o.padding || false)
    let cls = 'aiditor-ui-view'
    if (o.className) cls += ' ' + o.className

    const el = ui.h('div', cls)
    if (o.maxHeight != null) el.style.maxHeight = (typeof o.maxHeight === 'number' ? o.maxHeight + 'px' : o.maxHeight)
    ui.bind(el, scrollSig, function (value) {
      const mode = value === 'x' || value === 'y' || value === 'both' || value === 'hidden' || value === 'none'
        ? value
        : 'auto'
      el.classList.remove(
        'aiditor-ui-view-scroll-auto',
        'aiditor-ui-view-scroll-both',
        'aiditor-ui-view-scroll-x',
        'aiditor-ui-view-scroll-y',
        'aiditor-ui-view-scroll-hidden',
        'aiditor-ui-view-scroll-none',
        'aiditor-ui-scrollarea',
        'aiditor-ui-scrollarea-both'
      )
      el.classList.add('aiditor-ui-view-scroll-' + mode)
      if (mode !== 'none' && mode !== 'hidden') el.classList.add('aiditor-ui-scrollarea')
      if (mode === 'both') el.classList.add('aiditor-ui-scrollarea-both')
    })
    ui.bind(el, paddedSig, function (value) {
      el.classList.toggle('aiditor-ui-view-padded', !!value)
    })
    appendChildren(el, o.children)
    return el
  }
})(window.aiditor = window.aiditor || {})
