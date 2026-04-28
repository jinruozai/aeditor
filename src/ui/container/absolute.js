// EF.ui.absolute — container component for free-form layout. Children are
// positioned via their `layout` field: { anchor, x, y, w, h, unit }.
//
// Anchor is the corner of the parent the (x, y) offset is measured from
// (tl/tr/bl/br/c). w/h null → auto-size. unit='percent' interprets x/y/w/h
// as fractions of the parent's box (0..1).
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.absolute = function (opts) {
    const o = opts || {}
    const propsSig = ui.isSignal(o.value) ? o.value : EF.signal(o)
    return buildAbsolute(propsSig)
  }

  function buildAbsolute(propsSig) {
    const el = ui.h('div', 'ef-ui-absolute')
    el.style.position = 'relative'
    // width / height / overflow are layout-y; background / border /
    // borderRadius / padding come uniformly from BOX_STYLE so the
    // absolute container shares the same visual vocabulary as every
    // other component.
    //
    // Default overflow lives in the .ef-ui-absolute CSS rule (hidden) so
    // editor surfaces can override via specificity (the cardStyle editor
    // wants resize handles to escape the card frame). We only write
    // inline overflow if the user explicitly sets one.
    EF.effect(function () {
      const p = propsSig() || {}
      el.style.width  = p.width  != null ? toCssLen(p.width)  : ''
      el.style.height = p.height != null ? toCssLen(p.height) : ''
      if (p.overflow) el.style.overflow = p.overflow
      else el.style.overflow = ''
    })
    ui.applyBoxStyle(el, propsSig)
    return el
  }

  function toCssLen(v) { return typeof v === 'number' ? v + 'px' : String(v) }

  function applyChildLayout(slotEl, layout) {
    slotEl.style.position = 'absolute'
    if (!layout) return
    const u = layout.unit || 'px'
    const cssV = function (v) {
      if (v == null) return ''
      if (u === 'percent') return (v * 100) + '%'
      return v + 'px'
    }
    const x = layout.x || 0, y = layout.y || 0
    const a = layout.anchor || 'tl'
    if (a === 'tl') { slotEl.style.left = cssV(x); slotEl.style.top    = cssV(y) }
    else if (a === 'tr') { slotEl.style.right = cssV(x); slotEl.style.top    = cssV(y) }
    else if (a === 'bl') { slotEl.style.left  = cssV(x); slotEl.style.bottom = cssV(y) }
    else if (a === 'br') { slotEl.style.right = cssV(x); slotEl.style.bottom = cssV(y) }
    else if (a === 'c')  {
      slotEl.style.left = '50%'; slotEl.style.top = '50%'
      slotEl.style.transform = 'translate(-50%, -50%)'
    }
    if (layout.w != null) {
      slotEl.style.width = cssV(layout.w)
      slotEl.classList.add('ef-ui-abs-slot-w')
    }
    if (layout.h != null) {
      slotEl.style.height = cssV(layout.h)
      slotEl.classList.add('ef-ui-abs-slot-h')
    }
  }

  EF.registerComponent('absolute', {
    label:           'Absolute',
    icon:            'maximize',
    category:        'layout',
    acceptsChildren: true,
    bindable:        [],
    defaultProps: Object.assign({}, ui.BOX_STYLE_DEFAULTS, { width: 120, height: 120 }),
    schema: Object.assign({}, ui.BOX_STYLE_SCHEMA, {
      width:  { type: 'int' },
      height: { type: 'int' },
    }),
    factory: function (propsSig) { return buildAbsolute(propsSig) },
    appendChild: function (parent, child, layout) {
      const slot = ui.h('div', 'ef-ui-abs-slot')
      applyChildLayout(slot, layout)
      slot.appendChild(child)
      parent.appendChild(slot)
    },
  })
})(window.EF = window.EF || {})
