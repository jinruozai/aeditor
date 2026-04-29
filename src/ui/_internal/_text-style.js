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
    color:          { type: 'color', type_agv: { valueKind: 'hex' }, group: 'text',
                      desc: 'Text color. Empty falls back to the theme.' },
    fontFamily:     { type: 'string', group: 'text',
                      desc: 'CSS font-family stack (e.g. "Inter, sans-serif"). Empty inherits.' },
    fontSize:       { type: 'int',    group: 'text',
                      desc: 'Font size in pixels.' },
    fontWeight:     { type: 'enum_string', type_agv: { options: ['normal','bold','100','200','300','400','500','600','700','800','900'] }, group: 'text',
                      desc: 'Font weight. 400 = normal, 700 = bold; numeric values for fine control.' },
    fontStyle:      { type: 'enum_string', type_agv: { options: ['normal','italic'] }, group: 'text',
                      desc: 'normal · italic.' },
    textAlign:      { type: 'enum_string', type_agv: { options: ['left','center','right','justify'] }, group: 'text',
                      desc: 'Horizontal text alignment.' },
    letterSpacing:  { type: 'float',  group: 'text',
                      desc: 'Extra space between characters in pixels (negative = tighter).' },
    lineHeight:     { type: 'float',  group: 'text',
                      desc: 'Line height as a multiplier of font size (1.4 = 140%).' },
    textDecoration: { type: 'enum_string', type_agv: { options: ['none','underline','line-through'] }, group: 'text',
                      desc: 'none · underline · line-through.' },
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
