// EF.ui.anchorPicker — Unity-style anchor + offset editor for a LayoutRect.
//
// opts:
//   value       : signal<LayoutRect>   required (two-way)
//   parentSize  : signal<{w,h}> | {w,h}  optional — when present, switching
//                 a preset preserves the visible box on screen by
//                 recomputing offsets in the new anchor frame.
//   onChange    : (next) => void       optional override; default writes value
//
// Layout: a 4×4 grid of anchor preset buttons (each renders a mini SVG
// showing where the anchor min/max land inside the parent), followed by
// four numeric fields whose meaning adapts to the current rect:
//   • horizontal stretched (aMin.x ≠ aMax.x) → "Left" / "Right" insets
//   • horizontal fixed     (aMin.x = aMax.x) → "PosX"  / "Width"
//   • vertical analogous on the second axis.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}
  const LR = ui.layoutRect

  ui.anchorPicker = function (opts) {
    const o = opts || {}
    const value      = o.value
    const parentSize = ui.isSignal(o.parentSize)
      ? o.parentSize
      : (o.parentSize ? EF.signal(o.parentSize) : null)
    const writer = ui.writer(value, o.onChange, 'ui.anchorPicker')

    const root = ui.h('div', 'ef-ui-anchor-picker')

    // 4×4 preset grid ────────────────────────────────────────────────
    const grid = ui.h('div', 'ef-ui-anchor-grid')
    const cells = LR.PRESETS.map(function (p) {
      const btn = ui.h('button', 'ef-ui-anchor-cell', {
        type: 'button',
        title: p.label + ' — click: re-anchor (preserve box) · alt/option-click: snap rect to anchor',
      })
      btn.appendChild(buildAnchorGlyph(p))
      btn.addEventListener('click', function (ev) { switchPreset(p, ev.altKey) })
      return btn
    })
    cells.forEach(function (c) { grid.appendChild(c) })
    root.appendChild(grid)

    ui.bind(root, value, function (v) {
      const m = LR.matchPreset(v)
      cells.forEach(function (c, i) {
        c.classList.toggle('is-active', !!(m && m.id === LR.PRESETS[i].id))
      })
    })

    // Plain click → re-anchor while preserving the visible box (Unity's
    // default). Alt/Option click → snap the rect into the anchor frame
    // (fills stretched axes, retains size on fixed axes).
    function switchPreset(preset, snap) {
      const cur = value.peek() || LR.identity()
      let next
      if (snap) {
        next = LR.snapToAnchor(cur, preset)
      } else {
        const ps = parentSize ? parentSize.peek() : null
        if (ps && ps.w > 0 && ps.h > 0) {
          const box = LR.toBox(cur, ps)
          next = LR.fromBox(box, { aMin: preset.aMin, aMax: preset.aMax }, ps)
        } else {
          next = {
            aMin: clone(preset.aMin), aMax: clone(preset.aMax),
            oMin: clone(cur.oMin),    oMax: clone(cur.oMax),
          }
        }
      }
      writer(next)
    }

    // Offset / size fields ───────────────────────────────────────────
    const fieldsRow = ui.h('div', 'ef-ui-anchor-offsets')
    const fL = makeField(function (n) { applyField(function (cur) { return setOMin(cur, 'x', n) }) })
    const fT = makeField(function (n) { applyField(function (cur) { return setOMin(cur, 'y', n) }) })
    const fR = makeField(function (n) {
      applyField(function (cur) {
        return cur.aMin.x !== cur.aMax.x
          ? withOMax(cur, 'x', -n)
          : withOMax(cur, 'x', cur.oMin.x + n)
      })
    })
    const fB = makeField(function (n) {
      applyField(function (cur) {
        return cur.aMin.y !== cur.aMax.y
          ? withOMax(cur, 'y', -n)
          : withOMax(cur, 'y', cur.oMin.y + n)
      })
    })
    fieldsRow.appendChild(fL.row); fieldsRow.appendChild(fT.row)
    fieldsRow.appendChild(fR.row); fieldsRow.appendChild(fB.row)
    root.appendChild(fieldsRow)

    EF.effect(function () {
      const v = value() || LR.identity()
      const stretchX = v.aMin.x !== v.aMax.x
      const stretchY = v.aMin.y !== v.aMax.y
      fL.label.textContent = stretchX ? 'Left'  : 'PosX'
      fR.label.textContent = stretchX ? 'Right' : 'Width'
      fT.label.textContent = stretchY ? 'Top'    : 'PosY'
      fB.label.textContent = stretchY ? 'Bottom' : 'Height'
      fL.value.set(round(v.oMin.x))
      fT.value.set(round(v.oMin.y))
      fR.value.set(round(stretchX ? -v.oMax.x : v.oMax.x - v.oMin.x))
      fB.value.set(round(stretchY ? -v.oMax.y : v.oMax.y - v.oMin.y))
    })

    function applyField(applier) {
      const cur = value.peek() || LR.identity()
      writer(applier(cur))
    }

    return root
  }

  // ── helpers ─────────────────────────────────────────────────────
  function setOMin(rect, axis, n) {
    const next = cloneRect(rect)
    next.oMin[axis] = n
    return next
  }
  function withOMax(rect, axis, n) {
    const next = cloneRect(rect)
    next.oMax[axis] = n
    return next
  }
  function cloneRect(r) {
    return {
      aMin: clone(r.aMin), aMax: clone(r.aMax),
      oMin: clone(r.oMin), oMax: clone(r.oMax),
    }
  }
  function clone(p) { return { x: p.x, y: p.y } }
  function round(n) { return Math.round(n * 100) / 100 }

  function makeField(onChange) {
    const row   = ui.h('label', 'ef-ui-anchor-offset')
    const label = ui.h('span',  'ef-ui-anchor-offset-label')
    const value = EF.signal(0)
    const input = ui.numberInput({
      value: value,
      step: 1,
      precision: 0,
      onChange: function (n) {
        value.set(n)
        onChange(n)
      },
    })
    input.classList.add('ef-ui-anchor-offset-input')
    row.appendChild(label); row.appendChild(input)
    return { row: row, label: label, value: value, input: input }
  }

  // SVG glyph for a single preset cell. Mirrors Unity's pictogram: a small
  // parent box with two arrows showing where aMin (top-left) and aMax
  // (bottom-right) land. When min === max the slot is a single point; when
  // they differ the space between them is shaded to imply stretch.
  const SVG_NS = 'http://www.w3.org/2000/svg'
  function buildAnchorGlyph(preset) {
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', 'ef-ui-anchor-glyph')
    // Parent frame
    const frame = document.createElementNS(SVG_NS, 'rect')
    frame.setAttribute('x', '2'); frame.setAttribute('y', '2')
    frame.setAttribute('width', '20'); frame.setAttribute('height', '20')
    frame.setAttribute('class', 'ef-ui-anchor-glyph-frame')
    svg.appendChild(frame)
    const px = function (t) { return 2 + t * 20 }
    if (preset.aMin.x !== preset.aMax.x || preset.aMin.y !== preset.aMax.y) {
      const span = document.createElementNS(SVG_NS, 'rect')
      span.setAttribute('x', String(px(preset.aMin.x)))
      span.setAttribute('y', String(px(preset.aMin.y)))
      span.setAttribute('width',  String(px(preset.aMax.x) - px(preset.aMin.x) || 1))
      span.setAttribute('height', String(px(preset.aMax.y) - px(preset.aMin.y) || 1))
      span.setAttribute('class', 'ef-ui-anchor-glyph-span')
      svg.appendChild(span)
    }
    addMarker(svg, px(preset.aMin.x), px(preset.aMin.y), 'min')
    if (preset.aMin.x !== preset.aMax.x || preset.aMin.y !== preset.aMax.y) {
      addMarker(svg, px(preset.aMax.x), px(preset.aMax.y), 'max')
    }
    return svg
  }
  function addMarker(svg, x, y, kind) {
    const m = document.createElementNS(SVG_NS, 'circle')
    m.setAttribute('cx', String(x)); m.setAttribute('cy', String(y))
    m.setAttribute('r', '2')
    m.setAttribute('class', 'ef-ui-anchor-glyph-mark ef-ui-anchor-glyph-mark-' + kind)
    svg.appendChild(m)
  }
})(window.EF = window.EF || {})
