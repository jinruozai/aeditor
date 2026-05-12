// aeditor.ui.curveInput - animation/easing curve editor (cubic bezier 4-pt).
//
// Value : signal<[x1, y1, x2, y2]>  (control points in [0,1] like CSS bezier).
//
// Features:
//   - Responsive canvas sizing; ResizeObserver keeps DPR crisp.
//   - Drag either handle to shape the curve. Hover highlights the nearest handle.
//   - Grid, guide lines, accent-stroked bezier, filled handles.
//
// Applying named presets is an application concern, not a UI chrome concern.
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
    const xMin = numOpt(o.xMin, 0)
    const xMax = numOpt(o.xMax, 1)
    const yMin = numOpt(o.yMin, 0)
    const yMax = numOpt(o.yMax, 1)

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

    // Geometry maps normalized [0,1] into the available box. Padding and
    // handle sizes scale down in thumbnails, but stay comfortable in normal
    // editor panels.
    function geom() {
      const minSide = Math.min(cssW, cssH)
      const side = Math.max(1, minSide)
      const handle = Math.max(3.5, Math.min(5, side * 0.05))
      const activeHandle = Math.max(5, Math.min(7, side * 0.07))
      const PAD = Math.max(activeHandle + 2, Math.min(16, Math.floor(side * 0.14)))
      const inner = Math.max(1, side - PAD * 2)
      return {
        PAD: PAD,
        x: Math.round((cssW - side) / 2) + PAD,
        y: Math.round((cssH - side) / 2) + PAD,
        iw: inner,
        ih: inner,
        handle: handle,
        activeHandle: activeHandle,
        hitRadius: Math.max(10, Math.min(18, side * 0.18)),
      }
    }
    function norm(v, min, max) { return (v - min) / (max - min) }
    function denorm(v, min, max) { return min + v * (max - min) }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
    function map(g, x, y) {
      return [
        g.x + clamp(norm(x, xMin, xMax), 0, 1) * g.iw,
        g.y + (1 - clamp(norm(y, yMin, yMax), 0, 1)) * g.ih,
      ]
    }

    function draw() {
      if (cssW <= 0 || cssH <= 0) return
      const v = sig.peek()
      const g = geom()

      ctx.clearRect(0, 0, cssW, cssH)

      // backdrop
      ctx.fillStyle = getCss('--aeditor-bg-1', '#1a1a1f')
      ctx.fillRect(g.x, g.y, g.iw, g.ih)

      // grid (quarter lines)
      ctx.strokeStyle = getCss('--aeditor-border', '#2a2a30')
      ctx.lineWidth = minLine(cssW, cssH)
      ctx.beginPath()
      for (let i = 1; i < 4; i++) {
        const gx = g.x + (g.iw * i / 4) + 0.5
        const gy = g.y + (g.ih * i / 4) + 0.5
        ctx.moveTo(gx, g.y);         ctx.lineTo(gx, g.y + g.ih)
        ctx.moveTo(g.x, gy);         ctx.lineTo(g.x + g.iw, gy)
      }
      ctx.stroke()
      // bounding frame
      ctx.strokeStyle = getCss('--aeditor-border-strong', '#3a3a42')
      ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.iw, g.ih)

      // diagonal reference (linear curve, dimmed)
      ctx.strokeStyle = getCss('--aeditor-fg-3', '#55555f')
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(g.x, g.y + g.ih)
      ctx.lineTo(g.x + g.iw, g.y)
      ctx.stroke()
      ctx.setLineDash([])

      const p0 = map(g, xMin, yMin)
      const p1 = map(g, v[0], v[1])
      const p2 = map(g, v[2], v[3])
      const p3 = map(g, xMax, yMax)

      // handle guide lines
      ctx.strokeStyle = getCss('--aeditor-fg-3', '#55555f')
      ctx.lineWidth = minLine(cssW, cssH)
      ctx.beginPath()
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1])
      ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p2[0], p2[1])
      ctx.stroke()

      // bezier curve: glow pass + main stroke
      const accent = getCss('--aeditor-accent', '#7b6ef6')
      ctx.save()
      ctx.shadowColor = accent
      ctx.shadowBlur = 8
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(1.5, Math.min(2.5, Math.min(cssW, cssH) * 0.025))
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p0[0], p0[1])
      ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1])
      ctx.stroke()
      ctx.restore()

      // endpoint dots
      ctx.fillStyle = getCss('--aeditor-fg-2', '#8a8a95')
      ;[p0, p3].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, g.handle * 0.6), 0, Math.PI * 2); ctx.fill()
      })

      // control handles
      ;[p1, p2].forEach(function (p, i) {
        const active = (i === dragIdx) || (i === hoverIdx && dragIdx < 0)
        const r = active ? g.activeHandle : g.handle
        if (active) {
          ctx.save()
          ctx.globalAlpha = 0.22
          ctx.fillStyle = accent
          ctx.beginPath(); ctx.arc(p[0], p[1], r + Math.max(3, r * 0.8), 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = accent
        ctx.strokeStyle = getCss('--aeditor-fg-0', '#f0f0f5')
        ctx.lineWidth = Math.max(1.25, Math.min(2, Math.min(cssW, cssH) * 0.02))
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
      return bestD < g.hitRadius * g.hitRadius ? best : -1
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
    let parentRo = null
    function fitToParent() {
      const p = el.parentElement
      if (!p) return
      if (!parentRo) {
        parentRo = new ResizeObserver(fitToParent)
        parentRo.observe(p)
        ui.collect(el, function () { parentRo.disconnect() })
      }
      const r = p.getBoundingClientRect()
      const side = Math.floor(Math.min(r.width, r.height))
      if (side > 0) {
        el.style.width = side + 'px'
        el.style.height = side + 'px'
      }
      resize()
    }

    // Keep the editor square inside whichever bounded surface owns it.
    requestAnimationFrame(fitToParent)

    ui.bind(el, sig, draw)

    // Unified pointer session: move = hover + drag, down = capture + drag.
    cv.addEventListener('pointermove', function (e) {
      const r = cv.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      if (dragIdx >= 0) {
        const g = geom()
        const x = denorm(clamp((px - g.x) / g.iw, 0, 1), xMin, xMax)
        const y = denorm(clamp(1 - (py - g.y) / g.ih, 0, 1), yMin, yMax)
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
    function minLine(w, h) {
      return Math.max(0.75, Math.min(1, Math.min(w, h) * 0.012))
    }
    function numOpt(v, fallback) {
      return typeof v === 'number' && isFinite(v) ? v : fallback
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
