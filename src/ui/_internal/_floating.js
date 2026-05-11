// UI library — floating element positioning.
//
// Anchored placement for popovers, menus, tooltips, comboboxes. Given an
// anchor element + a floating element + a side preference, computes a
// viewport-clamped (left, top) and applies it. No flip animation, just a
// simple "place at preferred side, fall back to opposite if it overflows".
//
// Floating elements MUST already be in the portal layer (so we measure them
// as fixed-positioned, no parent layout influence).
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  // place(anchor, floating, opts)
  //   opts.side    : 'top' | 'bottom' | 'left' | 'right'   (default 'bottom')
  //   opts.align   : 'start' | 'center' | 'end'             (default 'start')
  //   opts.gap     : px between anchor and floating         (default 4)
  //   opts.padding : viewport edge padding                  (default 8)
  ui.place = function (anchor, floating, opts) {
    const o = opts || {}
    const side    = o.side    || 'bottom'
    const align   = o.align   || 'start'
    const gap     = o.gap     != null ? o.gap : 4
    const pad     = o.padding != null ? o.padding : 8

    // Make sure floating is laid out before we measure (display + position fixed).
    floating.style.position = 'fixed'
    floating.style.left = '0px'
    floating.style.top  = '0px'
    floating.style.visibility = 'hidden'
    floating.style.display = 'block'

    const a = anchor.getBoundingClientRect()
    const f = floating.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    function place(s) {
      let left = 0, top = 0
      if (s === 'bottom' || s === 'top') {
        if (align === 'start')  left = a.left
        if (align === 'center') left = a.left + (a.width  - f.width)  / 2
        if (align === 'end')    left = a.right - f.width
        top = s === 'bottom' ? a.bottom + gap : a.top - f.height - gap
      } else {
        if (align === 'start')  top = a.top
        if (align === 'center') top = a.top  + (a.height - f.height) / 2
        if (align === 'end')    top = a.bottom - f.height
        left = s === 'right' ? a.right + gap : a.left - f.width - gap
      }
      return { left: left, top: top }
    }

    function fits(s, p) {
      if (s === 'bottom') return p.top + f.height <= vh - pad
      if (s === 'top')    return p.top >= pad
      if (s === 'right')  return p.left + f.width <= vw - pad
      if (s === 'left')   return p.left >= pad
      return true
    }

    let p = place(side)
    if (!fits(side, p)) {
      const opposite = { top:'bottom', bottom:'top', left:'right', right:'left' }[side]
      const p2 = place(opposite)
      if (fits(opposite, p2)) p = p2
    }
    // Final viewport clamp.
    p.left = Math.max(pad, Math.min(p.left, vw - f.width  - pad))
    p.top  = Math.max(pad, Math.min(p.top,  vh - f.height - pad))

    floating.style.left = p.left + 'px'
    floating.style.top  = p.top  + 'px'
    floating.style.visibility = ''
  }
})(window.aeditor = window.aeditor || {})
