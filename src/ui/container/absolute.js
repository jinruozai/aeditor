// aeditor.ui.absolute — container component for free-form layout. Children are
// positioned via their `layout` field which is a LayoutRect (see
// _layout-rect.js for the data shape and CSS expansion).
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.absolute = function (opts) {
    const o = opts || {}
    const propsSig = ui.isSignal(o.value) ? o.value : aeditor.signal(o)
    return buildAbsolute(propsSig)
  }

  function buildAbsolute(propsSig) {
    const el = ui.h('div', 'aeditor-ui-absolute')
    el.style.position = 'relative'
    // Default overflow lives in the .aeditor-ui-absolute CSS rule (hidden) so
    // editor surfaces can override via specificity (the cardStyle editor
    // wants resize handles to escape the card frame). We only write
    // inline overflow if the user explicitly sets one.
    aeditor.effect(function () {
      const p = propsSig() || {}
      el.style.width  = p.width  != null ? toCssLen(p.width)  : ''
      el.style.height = p.height != null ? toCssLen(p.height) : ''
      el.style.overflow = p.overflow || ''
    })
    ui.applyBoxStyle(el, propsSig)
    return el
  }

  function toCssLen(v) { return typeof v === 'number' ? v + 'px' : String(v) }

  aeditor.registerComponent('absolute', {
    label:           'Absolute',
    icon:            'maximize',
    category:        'layout',
    bindable:        [],
    defaultProps: Object.assign({}, ui.BOX_STYLE_DEFAULTS, { width: 120, height: 120 }),
    schema: Object.assign({}, ui.BOX_STYLE_SCHEMA, {
      width:  { type: 'int', desc: 'Container width in pixels.' },
      height: { type: 'int', desc: 'Container height in pixels.' },
    }),
    factory: function (propsSig) { return buildAbsolute(propsSig) },
    appendChild: function (parent, child, layout) {
      const slot = ui.h('div', 'aeditor-ui-abs-slot')
      ui.layoutRect.applyToSlot(slot, layout)
      slot.appendChild(child)
      parent.appendChild(slot)
    },
  })
})(window.aeditor = window.aeditor || {})
