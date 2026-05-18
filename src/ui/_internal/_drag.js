// UI library — pointer drag helper.
//
// Used by sliders, vector inputs (drag-to-scrub on labels), color picker
// canvases, range sliders, etc. Captures the pointer on the target element
// so events keep flowing even if the cursor leaves the element.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  // attachDrag(el, handlers)
  //   handlers.onStart(e, ctx)
  //   handlers.onMove (e, ctx)
  //   handlers.onEnd  (e, ctx)
  //   ctx = { startX, startY, dx, dy, target }
  ui.attachDrag = function (el, handlers) {
    function onDown(e) {
      if (e.button !== 0) return
      e.preventDefault()
      const ctx = { startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, target: el }
      try { el.setPointerCapture(e.pointerId) } catch (_) {}
      handlers.onStart && handlers.onStart(e, ctx)
      function onMove(ev) {
        ctx.dx = ev.clientX - ctx.startX
        ctx.dy = ev.clientY - ctx.startY
        handlers.onMove && handlers.onMove(ev, ctx)
      }
      function onUp(ev) {
        handlers.onEnd && handlers.onEnd(ev, ctx)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        try { el.releasePointerCapture(e.pointerId) } catch (_) {}
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointerdown', onDown)
    return function () { el.removeEventListener('pointerdown', onDown) }
  }
})(window.aiditor = window.aiditor || {})
