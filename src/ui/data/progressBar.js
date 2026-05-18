// aiditor.ui.progressBar — determinate (0..1) or indeterminate progress bar.
// One component, three shape axes — call-site switches between them via
// opts without widening the surface.
//
// opts:
//   value?:         number | signal         0..1 (determinate only)
//   indeterminate?: bool   | signal         overrides value; spinner/stripe
//   label?:         string | signal         linear → centered caption;
//                                           circle → centered text inside ring
//   shape?:  'linear' | 'circle' | signal   default 'linear'
//   size?:   'sm' | 'md' | 'lg'  | signal   default 'md'
//   kind?:   'default' | 'success' | 'warn' | 'error' | signal
//                                           picks the fill color token
//
// The DOM shell is mode-specific so we don't waste nodes: linear uses a
// fill <div>, circle uses an inline <svg> ring. All variants share the
// same `size` / `kind` class scheme (aiditor-ui-progress-{sm|md|lg|success|…})
// so a single block of theme-token CSS covers both.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  const SVG_NS = 'http://www.w3.org/2000/svg'
  const R = 16                      // ring radius — viewBox 0 0 36 36
  const C = 2 * Math.PI * R         // circumference ≈ 100.53

  ui.progressBar = function (opts) {
    const o = opts || {}
    const indeterminate = ui.asSig(o.indeterminate != null ? o.indeterminate : false)
    const shape         = ui.asSig(o.shape != null ? o.shape : 'linear')
    const size          = ui.asSig(o.size  != null ? o.size  : 'md')
    const kind          = ui.asSig(o.kind  != null ? o.kind  : 'default')
    const value         = o.value != null ? ui.asSig(o.value) : null
    const label         = o.label != null ? ui.asSig(o.label) : null

    const root = ui.h('div', 'aiditor-ui-progress')
    ui.bindClass(root, size, 'aiditor-ui-progress-')
    ui.bindClass(root, kind, 'aiditor-ui-progress-kind-')
    ui.bind(root, indeterminate, function (v) {
      root.classList.toggle('aiditor-ui-progress-ind', !!v)
    })

    // Shape is picked once per instance. In practice callers choose at
    // construction; a mid-life shape swap would be surprising, so we
    // resolve it synchronously here rather than rebuilding under effect.
    const isCircle = shape.peek() === 'circle'

    if (isCircle) {
      const svg = document.createElementNS(SVG_NS, 'svg')
      svg.setAttribute('class', 'aiditor-ui-progress-svg')
      svg.setAttribute('viewBox', '0 0 36 36')
      const trackArc = ringPath('aiditor-ui-progress-track-arc')
      const fillArc  = ringPath('aiditor-ui-progress-fill-arc')
      fillArc.setAttribute('stroke-dasharray', C)
      fillArc.setAttribute('stroke-dashoffset', C)  // 0%
      svg.appendChild(trackArc); svg.appendChild(fillArc)
      root.appendChild(svg)
      if (value) {
        ui.bind(root, value, function (v) {
          const p = Math.max(0, Math.min(1, Number(v) || 0))
          fillArc.setAttribute('stroke-dashoffset', String(C * (1 - p)))
        })
      }
      if (label) {
        const lab = ui.h('span', 'aiditor-ui-progress-label')
        ui.bindText(lab, label)
        root.appendChild(lab)
      }
    } else {
      root.classList.add('aiditor-ui-progress-linear')
      const fill = ui.h('div', 'aiditor-ui-progress-fill')
      root.appendChild(fill)
      if (value) {
        ui.bind(root, value, function (v) {
          const p = Math.max(0, Math.min(1, Number(v) || 0))
          fill.style.width = (p * 100) + '%'
        })
      }
      if (label) {
        const lab = ui.h('span', 'aiditor-ui-progress-label')
        ui.bindText(lab, label)
        root.appendChild(lab)
      }
    }

    return root
  }

  // Helper — the ring shape is 2 identical circles (track + fill). The
  // fill's dashoffset is animated to reveal the percentage, and it's
  // rotated -90° so 0% sits at 12 o'clock.
  function ringPath(className) {
    const c = document.createElementNS(SVG_NS, 'circle')
    c.setAttribute('class', className)
    c.setAttribute('cx', '18'); c.setAttribute('cy', '18'); c.setAttribute('r', String(R))
    c.setAttribute('fill', 'none')
    return c
  }
})(window.aiditor = window.aiditor || {})
