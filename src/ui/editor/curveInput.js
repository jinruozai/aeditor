// aeditor.ui.curveInput — animation/easing curve editor (cubic bezier 4-pt).
//
// Value : signal<[x1, y1, x2, y2]>  (control points in [0,1] like CSS bezier).
//
// Features:
//   • Responsive — canvas fills the component; ResizeObserver keeps DPR crisp.
//   • Drag either handle to shape the curve. Hover highlights the nearest handle.
//   • Grid, guide lines, accent-stroked bezier, filled handles.
//
// Applying named presets is an application concern, not a UI chrome concern —
// callers just write to the signal: `sig.set(aeditor.ui.curvePresets.ease)`. Common
// values are exposed as `aeditor.ui.curvePresets` for convenience.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.curvePresets = {
    linear: [0.00, 0.00, 1.00, 1.00],
    ease:   [0.25, 0.10, 0.25, 1.00],
    in:     [0.42, 0.00, 1.00, 1.00],
    out:    [0.00, 0.00, 0.58, 1.00],
    inOut:  [0.42, 0.00, 0.58, 1.00],
  }

  ui.curveInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value : [0.42, 0, 0.58, 1])
    const doWrite = ui.writer(sig, o.onChange, 'ui.curveInput')

    const el     = ui.h('div', 'aeditor-ui-curve')
    const cvWrap = ui.h('div', 'aeditor-ui-curve-canvas-wrap')
    const cv     = ui.h('canvas', 'aeditor-ui-curve-canvas')
    cvWrap.appendChild(cv)
    el.appendChild(cvWrap)

    const ctx = cv.getContext('2d')
    let cssW = 0, cssH = 0, dpr = 1
    let hoverIdx = -1
    let dragIdx  = -1

    function getCss(name, fallback) {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return v || fallback
    }

    // Geometry ─ maps normalized [0,1] → pixel space with generous padding
    // so the handles sit inside the canvas and never clip at the edges.
    function geom() {
      const PAD = 16
      return {
        PAD: PAD,
        iw: cssW - PAD * 2,
        ih: cssH - PAD * 2,
      }
    }
    function map(g, x, y) { return [g.PAD + x * g.iw, g.PAD + (1 - y) * g.ih] }

    function draw() {
      if (cssW <= 0 || cssH <= 0) return
      const v = sig.peek()
      const g = geom()

      ctx.clearRect(0, 0, cssW, cssH)

      // backdrop
      ctx.fillStyle = getCss('--aeditor-bg-1', '#1a1a1f')
      ctx.fillRect(g.PAD, g.PAD, g.iw, g.ih)

      // grid (quarter lines)
      ctx.strokeStyle = getCss('--aeditor-border', '#2a2a30')
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < 4; i++) {
        const gx = g.PAD + (g.iw * i / 4) + 0.5
        const gy = g.PAD + (g.ih * i / 4) + 0.5
        ctx.moveTo(gx, g.PAD);         ctx.lineTo(gx, g.PAD + g.ih)
        ctx.moveTo(g.PAD, gy);         ctx.lineTo(g.PAD + g.iw, gy)
      }
      ctx.stroke()
      // bounding frame
      ctx.strokeStyle = getCss('--aeditor-border-strong', '#3a3a42')
      ctx.strokeRect(g.PAD + 0.5, g.PAD + 0.5, g.iw, g.ih)

      // diagonal reference (linear curve, dimmed)
      ctx.strokeStyle = getCss('--aeditor-fg-3', '#55555f')
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(g.PAD, g.PAD + g.ih)
      ctx.lineTo(g.PAD + g.iw, g.PAD)
      ctx.stroke()
      ctx.setLineDash([])

      const p0 = map(g, 0, 0)
      const p1 = map(g, v[0], v[1])
      const p2 = map(g, v[2], v[3])
      const p3 = map(g, 1, 1)

      // handle guide lines
      ctx.strokeStyle = getCss('--aeditor-fg-3', '#55555f')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1])
      ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p2[0], p2[1])
      ctx.stroke()

      // bezier curve — glow pass + main stroke
      const accent = getCss('--aeditor-accent', '#7b6ef6')
      ctx.save()
      ctx.shadowColor = accent
      ctx.shadowBlur = 8
      ctx.strokeStyle = accent
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p0[0], p0[1])
      ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1])
      ctx.stroke()
      ctx.restore()

      // endpoint dots
      ctx.fillStyle = getCss('--aeditor-fg-2', '#8a8a95')
      ;[p0, p3].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill()
      })

      // control handles
      ;[p1, p2].forEach(function (p, i) {
        const active = (i === dragIdx) || (i === hoverIdx && dragIdx < 0)
        const r = active ? 7 : 5
        if (active) {
          ctx.save()
          ctx.globalAlpha = 0.22
          ctx.fillStyle = accent
          ctx.beginPath(); ctx.arc(p[0], p[1], r + 5, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = accent
        ctx.strokeStyle = getCss('--aeditor-fg-0', '#f0f0f5')
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      })
    }

    function hit(px, py) {
      const g = geom()
      const v = sig.peek()
      const p1 = map(g, v[0], v[1])
      const p2 = map(g, v[2], v[3])
      const d1 = (px - p1[0]) ** 2 + (py - p1[1]) ** 2
      const d2 = (px - p2[0]) ** 2 + (py - p2[1]) ** 2
      const best = d1 < d2 ? 0 : 1
      const bestD = Math.min(d1, d2)
      return bestD < 324 ? best : -1   // 18² radius around handle
    }

    function resize() {
      const rect = cvWrap.getBoundingClientRect()
      cssW = Math.max(0, Math.round(rect.width))
      cssH = Math.max(0, Math.round(rect.height))
      dpr = window.devicePixelRatio || 1
      cv.width  = Math.round(cssW * dpr)
      cv.height = Math.round(cssH * dpr)
      cv.style.width  = cssW + 'px'
      cv.style.height = cssH + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(cvWrap)
    ui.collect(el, function () { ro.disconnect() })

    // Safety net: ResizeObserver's first callback can be missed when the
    // element is constructed off-DOM and mounted in the same frame — the
    // browser resolves layout, but RO's delivery is scheduled for the
    // next rAF and occasionally lands before the element has a non-zero
    // rect. A one-shot rAF resize guarantees the canvas bitmap is sized
    // from real measurements before any draw. Idempotent with RO.
    requestAnimationFrame(resize)

    ui.bind(el, sig, draw)

    // Unified pointer session: move = hover + drag, down = capture + drag.
    cv.addEventListener('pointermove', function (e) {
      const r = cv.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      if (dragIdx >= 0) {
        const g = geom()
        const x = Math.max(0, Math.min(1, (px - g.PAD) / g.iw))
        const y = Math.max(-0.5, Math.min(1.5, 1 - (py - g.PAD) / g.ih))
        const v = sig.peek().slice()
        v[dragIdx * 2]     = x
        v[dragIdx * 2 + 1] = y
        doWrite(v)
      } else {
        const h = hit(px, py)
        if (h !== hoverIdx) {
          hoverIdx = h
          cv.style.cursor = h >= 0 ? 'grab' : 'crosshair'
          draw()
        }
      }
    })
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      const r = cv.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      const h = hit(px, py)
      // If pressed in empty space, grab the nearest handle anyway (Blender-ish).
      dragIdx = h >= 0 ? h : nearest(px, py)
      hoverIdx = dragIdx
      cv.style.cursor = 'grabbing'
      try { cv.setPointerCapture(e.pointerId) } catch (_) {}
      draw()
    })
    function nearest(px, py) {
      const g = geom()
      const v = sig.peek()
      const p1 = map(g, v[0], v[1])
      const p2 = map(g, v[2], v[3])
      return ((px - p1[0]) ** 2 + (py - p1[1]) ** 2) < ((px - p2[0]) ** 2 + (py - p2[1]) ** 2) ? 0 : 1
    }
    function endDrag(e) {
      if (dragIdx < 0) return
      dragIdx = -1
      cv.style.cursor = hoverIdx >= 0 ? 'grab' : 'crosshair'
      try { cv.releasePointerCapture(e.pointerId) } catch (_) {}
      draw()
    }
    cv.addEventListener('pointerup', endDrag)
    cv.addEventListener('pointercancel', endDrag)
    cv.addEventListener('pointerleave', function () {
      if (dragIdx < 0 && hoverIdx !== -1) {
        hoverIdx = -1
        cv.style.cursor = 'crosshair'
        draw()
      }
    })

    return el
  }
})(window.aeditor = window.aeditor || {})
