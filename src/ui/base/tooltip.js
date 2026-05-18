// aiditor.ui.tooltip — attach a hover tooltip to any element.
//
// aiditor.ui.tooltip(target, { text: string|signal, side?: 'top'|'bottom'|'left'|'right', delay?: 400 })
//
// `side` and `delay` are identity-time config and stay plain. `text` is
// signal-aware so callers can update tooltip copy reactively.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.tooltip = function (target, opts) {
    const o = opts || {}
    const text  = ui.asSig(o.text != null ? o.text : '')
    const side  = o.side || 'top'
    const delay = o.delay != null ? o.delay : 400
    let timer = null
    let tip = null
    let unregister = null

    function show() {
      if (tip) return
      tip = ui.h('div', 'aiditor-ui-tooltip')
      ui.bindText(tip, text)
      ui.portal(tip)
      ui.place(target, tip, { side: side, align: 'center', gap: 6 })
      unregister = ui.registerScopedOverlay(target, hide)
    }
    function hide() {
      if (timer) { clearTimeout(timer); timer = null }
      if (unregister) { unregister(); unregister = null }
      if (tip) {
        ui.dispose(tip)
        tip = null
      }
    }
    function onEnter() { timer = setTimeout(show, delay) }
    target.addEventListener('pointerenter', onEnter)
    target.addEventListener('pointerleave', hide)
    target.addEventListener('pointerdown', hide)
    ui.collect(target, function () {
      target.removeEventListener('pointerenter', onEnter)
      target.removeEventListener('pointerleave', hide)
      target.removeEventListener('pointerdown', hide)
      hide()
    })
    return target
  }
})(window.aiditor = window.aiditor || {})
