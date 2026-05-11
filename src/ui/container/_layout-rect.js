// aeditor.ui.layoutRect — Unity/Godot-style anchor + offset rect.
//
// One model handles every fixed-point + stretch case mainstream UI editors
// expose. A child's geometry inside an absolute parent is fully captured by
// two anchor points (parent-relative fractions in [0,1]) and two pixel
// offsets:
//
//   LayoutRect = {
//     aMin: { x, y },   // top-left anchor   (parent fraction)
//     aMax: { x, y },   // bottom-right anchor
//     oMin: { x, y },   // slot's TL corner offset from aMin point  (px)
//     oMax: { x, y },   // slot's BR corner offset from aMax point  (px)
//   }
//
// CSS expression (pure — no JS resize listener; the browser interpolates):
//   left   = (aMin.x * 100)% + oMin.x px
//   top    = (aMin.y * 100)% + oMin.y px
//   right  = ((1 - aMax.x) * 100)% - oMax.x px
//   bottom = ((1 - aMax.y) * 100)% - oMax.y px
//
// aMin === aMax → fixed point (no stretch). aMin !== aMax → stretches with
// the parent along that axis. Both axes independent.
//
// Sign convention: oMin / oMax are slot-corner offsets in the natural
// "right-and-down is positive" direction. For a fixed-point TL anchor with
// 80×24 box at (10, 10): oMin = (10, 10), oMax = (90, 34).
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}
  const LR = ui.layoutRect = {}

  LR.identity = function () {
    return {
      aMin: { x: 0, y: 0 }, aMax: { x: 0, y: 0 },
      oMin: { x: 0, y: 0 }, oMax: { x: 0, y: 0 },
    }
  }

  // Write a rect to a DOM slot. Leaves position:absolute up to the caller's
  // CSS so this stays a leaf utility.
  LR.applyToSlot = function (slot, rect) {
    const r = rect || LR.identity()
    const aMin = r.aMin || { x: 0, y: 0 }, aMax = r.aMax || { x: 0, y: 0 }
    const oMin = r.oMin || { x: 0, y: 0 }, oMax = r.oMax || { x: 0, y: 0 }
    slot.style.left   = pctPx(aMin.x,        oMin.x)
    slot.style.top    = pctPx(aMin.y,        oMin.y)
    slot.style.right  = pctPx(1 - aMax.x,   -oMax.x)
    slot.style.bottom = pctPx(1 - aMax.y,   -oMax.y)
    slot.style.width  = ''
    slot.style.height = ''
    slot.style.transform = ''
  }
  function pctPx(pct, px) {
    if (pct === 0) return px + 'px'
    if (px  === 0) return (pct * 100) + '%'
    return 'calc(' + (pct * 100) + '% + ' + px + 'px)'
  }

  // Resolve a rect into a pixel-space {l, t, r, b, w, h} given the parent's
  // pixel size. Used by editor for hit-testing + box-preserving anchor switch.
  LR.toBox = function (rect, parentSize) {
    const r = rect || LR.identity()
    const pw = parentSize.w, ph = parentSize.h
    const l = pw * r.aMin.x + r.oMin.x
    const t = ph * r.aMin.y + r.oMin.y
    const xR = pw * r.aMax.x + r.oMax.x          // slot's right x in parent space
    const yB = ph * r.aMax.y + r.oMax.y          // slot's bottom y in parent space
    return { l: l, t: t, r: pw - xR, b: ph - yB, w: xR - l, h: yB - t }
  }

  // Build a rect from a pixel-space box + a target anchor pair. Used when
  // the user clicks an anchor preset: we keep the box on screen and just
  // re-express it under the new anchor.
  LR.fromBox = function (box, anchor, parentSize) {
    const pw = parentSize.w, ph = parentSize.h
    const aMin = anchor.aMin, aMax = anchor.aMax
    return {
      aMin: { x: aMin.x, y: aMin.y },
      aMax: { x: aMax.x, y: aMax.y },
      oMin: { x: box.l       - pw * aMin.x, y: box.t       - ph * aMin.y },
      oMax: { x: (box.l + box.w) - pw * aMax.x, y: (box.t + box.h) - ph * aMax.y },
    }
  }

  // Pure transforms used by the cardstyle editor's pointer drag.
  LR.translate = function (rect, dx, dy) {
    return {
      aMin: clone(rect.aMin), aMax: clone(rect.aMax),
      oMin: { x: rect.oMin.x + dx, y: rect.oMin.y + dy },
      oMax: { x: rect.oMax.x + dx, y: rect.oMax.y + dy },
    }
  }
  // edges = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw' — which sides move.
  // n/w move the slot's TL corner (oMin), s/e move the BR corner (oMax).
  // Width/height are floored at 1px so handles can't invert.
  LR.resize = function (rect, edges, dx, dy, parentSize) {
    const oMin = clone(rect.oMin), oMax = clone(rect.oMax)
    if (edges.indexOf('w') >= 0) oMin.x += dx
    if (edges.indexOf('e') >= 0) oMax.x += dx
    if (edges.indexOf('n') >= 0) oMin.y += dy
    if (edges.indexOf('s') >= 0) oMax.y += dy
    const spanX = Math.max(0, (rect.aMax.x - rect.aMin.x) * ((parentSize && parentSize.w) || 0))
    const spanY = Math.max(0, (rect.aMax.y - rect.aMin.y) * ((parentSize && parentSize.h) || 0))
    const minDX = 1 - spanX
    const minDY = 1 - spanY
    if (oMax.x - oMin.x < minDX) {
      if (edges.indexOf('w') >= 0) oMin.x = oMax.x - minDX
      else                          oMax.x = oMin.x + minDX
    }
    if (oMax.y - oMin.y < minDY) {
      if (edges.indexOf('n') >= 0) oMin.y = oMax.y - minDY
      else                          oMax.y = oMin.y + minDY
    }
    return { aMin: clone(rect.aMin), aMax: clone(rect.aMax), oMin: oMin, oMax: oMax }
  }
  function clone(p) { return { x: p.x, y: p.y } }

  // 16 presets matching Unity's anchor picker. Each entry is the {aMin, aMax}
  // pair; offsets are preserved by callers (or recomputed via fromBox to keep
  // the visible box constant when the user switches anchors).
  LR.PRESETS = [
    { id: 'tl',       aMin: { x: 0,   y: 0   }, aMax: { x: 0,   y: 0   }, label: 'Top Left'      },
    { id: 't',        aMin: { x: 0.5, y: 0   }, aMax: { x: 0.5, y: 0   }, label: 'Top'           },
    { id: 'tr',       aMin: { x: 1,   y: 0   }, aMax: { x: 1,   y: 0   }, label: 'Top Right'     },
    { id: 'top-h',    aMin: { x: 0,   y: 0   }, aMax: { x: 1,   y: 0   }, label: 'Stretch Top'   },
    { id: 'l',        aMin: { x: 0,   y: 0.5 }, aMax: { x: 0,   y: 0.5 }, label: 'Middle Left'   },
    { id: 'c',        aMin: { x: 0.5, y: 0.5 }, aMax: { x: 0.5, y: 0.5 }, label: 'Center'        },
    { id: 'r',        aMin: { x: 1,   y: 0.5 }, aMax: { x: 1,   y: 0.5 }, label: 'Middle Right'  },
    { id: 'mid-h',    aMin: { x: 0,   y: 0.5 }, aMax: { x: 1,   y: 0.5 }, label: 'Stretch Middle'},
    { id: 'bl',       aMin: { x: 0,   y: 1   }, aMax: { x: 0,   y: 1   }, label: 'Bottom Left'   },
    { id: 'b',        aMin: { x: 0.5, y: 1   }, aMax: { x: 0.5, y: 1   }, label: 'Bottom'        },
    { id: 'br',       aMin: { x: 1,   y: 1   }, aMax: { x: 1,   y: 1   }, label: 'Bottom Right'  },
    { id: 'bot-h',    aMin: { x: 0,   y: 1   }, aMax: { x: 1,   y: 1   }, label: 'Stretch Bottom'},
    { id: 'left-v',   aMin: { x: 0,   y: 0   }, aMax: { x: 0,   y: 1   }, label: 'Stretch Left'  },
    { id: 'mid-v',    aMin: { x: 0.5, y: 0   }, aMax: { x: 0.5, y: 1   }, label: 'Stretch Center'},
    { id: 'right-v',  aMin: { x: 1,   y: 0   }, aMax: { x: 1,   y: 1   }, label: 'Stretch Right' },
    { id: 'fill',     aMin: { x: 0,   y: 0   }, aMax: { x: 1,   y: 1   }, label: 'Stretch Fill'  },
  ]

  // Snap a rect's offsets to the anchor frame defined by `preset`. Per-axis:
  //   stretched (aMin ≠ aMax) → fill the anchor strip (offsets become 0)
  //   fixed     (aMin = aMax) → place rect at the anchor with its current
  //                              size in that axis (oMin = 0, oMax = size)
  // Used by the anchor picker's Alt-click "snap rect to anchor" gesture.
  LR.snapToAnchor = function (rect, preset) {
    const r = rect || LR.identity()
    const aMin = preset.aMin, aMax = preset.aMax
    const stretchX = aMin.x !== aMax.x
    const stretchY = aMin.y !== aMax.y
    const sizeX = r.oMax.x - r.oMin.x
    const sizeY = r.oMax.y - r.oMin.y
    return {
      aMin: { x: aMin.x, y: aMin.y },
      aMax: { x: aMax.x, y: aMax.y },
      oMin: { x: 0, y: 0 },
      oMax: { x: stretchX ? 0 : sizeX, y: stretchY ? 0 : sizeY },
    }
  }

  // Find which preset matches a rect's anchor pair (or null if none).
  LR.matchPreset = function (rect) {
    if (!rect) return null
    for (let i = 0; i < LR.PRESETS.length; i++) {
      const p = LR.PRESETS[i]
      if (eqAnchor(p.aMin, rect.aMin) && eqAnchor(p.aMax, rect.aMax)) return p
    }
    return null
  }
  function eqAnchor(a, b) { return a && b && a.x === b.x && a.y === b.y }
})(window.aeditor = window.aeditor || {})
