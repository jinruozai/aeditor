// Shared "typography" schema fragment + applyTextStyle helper. Lives
// alongside _box-style.js — same shape (schema + defaults + helper),
// different surface (font / color / line-height / decoration).
//
// Empty / null → no inline write → CSS cascade (theme) wins. User-typed
// values are inline and override.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.TEXT_STYLE_SCHEMA = {
    color:          { type: 'color', type_agv: { valueKind: 'hex' }, group: 'text' },
    fontFamily:     { type: 'string', group: 'text' },
    fontSize:       { type: 'int',    group: 'text' },
    fontWeight:     { type: 'enum_string', type_agv: { options: ['normal','bold','100','200','300','400','500','600','700','800','900'] }, group: 'text' },
    fontStyle:      { type: 'enum_string', type_agv: { options: ['normal','italic'] }, group: 'text' },
    textAlign:      { type: 'enum_string', type_agv: { options: ['left','center','right','justify'] }, group: 'text' },
    letterSpacing:  { type: 'float',  group: 'text' },
    lineHeight:     { type: 'float',  group: 'text' },
    textDecoration: { type: 'enum_string', type_agv: { options: ['none','underline','line-through'] }, group: 'text' },
  }

  ui.TEXT_STYLE_DEFAULTS = {
    color:          '',
    fontFamily:     '',
    fontSize:       null,
    fontWeight:     '',
    fontStyle:      '',
    textAlign:      '',
    letterSpacing:  null,
    lineHeight:     null,
    textDecoration: '',
  }

  ui.applyTextStyle = function (el, propsSig) {
    const setStr = ui._styleSetters.setStr
    const setPx  = ui._styleSetters.setPx
    const setNum = ui._styleSetters.setNum
    EF.effect(function () {
      const p = propsSig() || {}
      setStr(el, 'color',          p.color)
      setStr(el, 'fontFamily',     p.fontFamily)
      setPx (el, 'fontSize',       p.fontSize)
      setStr(el, 'fontWeight',     p.fontWeight)
      setStr(el, 'fontStyle',      p.fontStyle)
      setStr(el, 'textAlign',      p.textAlign)
      setPx (el, 'letterSpacing',  p.letterSpacing)
      setNum(el, 'lineHeight',     p.lineHeight)
      setStr(el, 'textDecoration', p.textDecoration)
    })
  }
})(window.EF = window.EF || {})
