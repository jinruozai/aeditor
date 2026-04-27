// EF.ui.vbox — vertical flex container. Children stack top→bottom.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  function build(propsSig, direction) {
    const el = ui.h('div', 'ef-ui-' + direction)
    el.style.display = 'flex'
    el.style.flexDirection = direction === 'vbox' ? 'column' : 'row'
    EF.effect(function () {
      const p = propsSig() || {}
      el.style.gap          = p.gap     != null ? p.gap + 'px'     : ''
      el.style.padding      = p.padding != null ? p.padding + 'px' : ''
      el.style.alignItems   = p.align   || ''
      el.style.justifyContent = p.justify || ''
      el.style.background   = p.background || ''
      el.style.width        = p.width  != null ? (typeof p.width  === 'number' ? p.width  + 'px' : p.width)  : ''
      el.style.height       = p.height != null ? (typeof p.height === 'number' ? p.height + 'px' : p.height) : ''
    })
    return el
  }

  function applyChildLayout(child, layout) {
    if (!layout) return
    if (layout.flex != null)  child.style.flex  = String(layout.flex)
    if (layout.basis != null) child.style.flexBasis = layout.basis + (typeof layout.basis === 'number' ? 'px' : '')
  }

  const SCHEMA = {
    gap:          { type: 'int' },
    padding:      { type: 'int' },
    align:        { type: 'enum_string', type_agv: { options: ['stretch','flex-start','center','flex-end'] } },
    justify:      { type: 'enum_string', type_agv: { options: ['flex-start','center','flex-end','space-between','space-around'] } },
    background:   { type: 'string' },
    width:        { type: 'int' },
    height:       { type: 'int' },
  }

  EF.registerComponent('vbox', {
    label: 'V Box', icon: 'columns', category: 'layout',
    acceptsChildren: true, bindable: [],
    defaultProps: { gap: 4 }, schema: SCHEMA,
    factory: function (propsSig) { return build(propsSig, 'vbox') },
    appendChild: function (parent, child, layout) { applyChildLayout(child, layout); parent.appendChild(child) },
  })

  EF.registerComponent('hbox', {
    label: 'H Box', icon: 'columns', category: 'layout',
    acceptsChildren: true, bindable: [],
    defaultProps: { gap: 4 }, schema: SCHEMA,
    factory: function (propsSig) { return build(propsSig, 'hbox') },
    appendChild: function (parent, child, layout) { applyChildLayout(child, layout); parent.appendChild(child) },
  })
})(window.EF = window.EF || {})
