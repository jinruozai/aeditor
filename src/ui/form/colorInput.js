// aeditor.ui.colorInput — color swatch + popover with HSV picker + hex input.
//
// opts:
//   value:     string|int|signal   hex ("#rrggbb") or 24-bit int (0xRRGGBB)
//   onChange?: (v) => void
//   valueKind?: 'hex' | 'int'      (default 'hex')   how the bound signal holds the value
//
// With valueKind='int', the signal stores an integer 0..0xFFFFFF. The swatch
// and picker internally work in hex strings; round-trip conversion happens at
// the signal boundary.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  function toHexStr(v) {
    if (typeof v === 'number') {
      const n = Math.max(0, Math.min(0xffffff, Math.trunc(v || 0)))
      let s = n.toString(16); while (s.length < 6) s = '0' + s
      return '#' + s
    }
    return v
  }

  ui.colorInput = function (opts) {
    const o = opts || {}
    const valueKind = o.valueKind === 'int' ? 'int' : 'hex'
    const sig = ui.asSig(o.value != null ? o.value : (valueKind === 'int' ? 0x7b6ef6 : '#7b6ef6'))
    const rawWrite = ui.writer(sig, o.onChange, 'ui.colorInput')
    // Internal API operates on hex strings; translate to/from int at the edge.
    function doWrite(hex) {
      if (valueKind === 'int') rawWrite(parseInt(hex.slice(1), 16))
      else rawWrite(hex)
    }

    const el = ui.h('div', 'aeditor-ui-color')
    const swatch = ui.h('div', 'aeditor-ui-color-swatch')
    const text = ui.h('input', 'aeditor-ui-color-text', { type: 'text' })
    el.appendChild(swatch); el.appendChild(text)

    ui.bind(el, sig, function (v) {
      const hex = toHexStr(v)
      swatch.style.background = hex
      if (document.activeElement !== text) text.value = valueKind === 'int' ? String(v) : hex
    })
    text.addEventListener('input', function () {
      const raw = text.value.trim()
      // Accept "#rrggbb" / "#rgb" / a plain integer literal.
      if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{3}$/i.test(raw)) {
        doWrite(raw)
      } else if (/^\d+$/.test(raw)) {
        const hex = toHexStr(parseInt(raw, 10))
        doWrite(hex)
      }
    })

    let pop = null
    swatch.addEventListener('click', function () {
      if (pop) { pop.close(); pop = null; return }
      pop = openPicker(el, sig, doWrite, function () { pop = null })
    })
    // If the component is disposed while the picker is open, tear it down.
    ui.collect(el, function () { if (pop) { pop.close(); pop = null } })
    return el
  }

  // ── HSV picker popover ─────────────────────────────────────────
  function openPicker(anchor, sig, doWrite, onClose) {
    const wrap = ui.h('div', 'aeditor-ui-color-picker')

    // The picker always works in hex internally; int-valued signals get
    // translated at the boundary by doWrite().
    const hsv = hexToHsv(toHexStr(sig.peek())) || { h: 0, s: 1, v: 1 }
    const sigH = aeditor.signal(hsv.h)
    const sigS = aeditor.signal(hsv.s)
    const sigV = aeditor.signal(hsv.v)

    // SV square
    const sv = ui.h('div', 'aeditor-ui-color-sv')
    const svDot = ui.h('div', 'aeditor-ui-color-sv-dot')
    sv.appendChild(svDot)
    // Hue strip
    const hue = ui.h('div', 'aeditor-ui-color-hue')
    const hueDot = ui.h('div', 'aeditor-ui-color-hue-dot')
    hue.appendChild(hueDot)
    // Hex input
    const hex = ui.h('input', 'aeditor-ui-color-hex', { type: 'text' })

    wrap.appendChild(sv); wrap.appendChild(hue); wrap.appendChild(hex)

    function update() {
      sv.style.background = 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(' +
                            (sigH.peek() * 360) + ',100%,50%))'
      svDot.style.left = (sigS.peek() * 100) + '%'
      svDot.style.top  = ((1 - sigV.peek()) * 100) + '%'
      hueDot.style.left = (sigH.peek() * 100) + '%'
      const out = hsvToHex(sigH.peek(), sigS.peek(), sigV.peek())
      doWrite(out)
      if (document.activeElement !== hex) hex.value = out
    }
    const stopEffect = aeditor.effect(function () { sigH(); sigS(); sigV(); update() })

    ui.attachDrag(sv, {
      onStart: scrubSv, onMove: scrubSv,
    })
    function scrubSv(e) {
      const r = sv.getBoundingClientRect()
      sigS.set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
      sigV.set(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)))
    }
    ui.attachDrag(hue, {
      onStart: scrubHue, onMove: scrubHue,
    })
    function scrubHue(e) {
      const r = hue.getBoundingClientRect()
      sigH.set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
    }
    hex.addEventListener('input', function () {
      const h = hexToHsv(hex.value.trim())
      if (h) { sigH.set(h.h); sigS.set(h.s); sigV.set(h.v) }
    })

    return ui.popover({
      anchor: anchor, content: wrap, side: 'bottom', align: 'start',
      onDismiss: function () { stopEffect(); onClose && onClose() },
    })
  }

  // ── color math ─────────────────────────────────────────────────
  function hexToHsv(hex) {
    if (!hex) return null
    let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
    if (!m) return null
    let h = m[1]
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    const r = parseInt(h.slice(0,2), 16) / 255
    const g = parseInt(h.slice(2,4), 16) / 255
    const b = parseInt(h.slice(4,6), 16) / 255
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn
    let H = 0
    if (d > 0) {
      if (mx === r) H = ((g - b) / d) % 6
      else if (mx === g) H = (b - r) / d + 2
      else H = (r - g) / d + 4
      H = (H * 60 + 360) % 360 / 360
    }
    const S = mx === 0 ? 0 : d / mx
    const V = mx
    return { h: H, s: S, v: V }
  }
  function hsvToHex(h, s, v) {
    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)
    let r, g, b
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break
      case 1: r = q; g = v; b = p; break
      case 2: r = p; g = v; b = t; break
      case 3: r = p; g = q; b = v; break
      case 4: r = t; g = p; b = v; break
      case 5: r = v; g = p; b = q; break
    }
    function h2(x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2) }
    return '#' + h2(r) + h2(g) + h2(b)
  }
})(window.aeditor = window.aeditor || {})
