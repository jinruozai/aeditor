// Shared "box visual chrome" schema fragment + applyBoxStyle helper.
//
// Components that look like boxes (containers, badges, banners, text frames,
// image cards, …) share this set of props so palette / property-panel
// consumers see a uniform vocabulary. Adding a new visual prop = update
// these two tables in one place.
//
//   schema:   ui.BOX_STYLE_SCHEMA          merge into a component's schema
//   defaults: ui.BOX_STYLE_DEFAULTS        merge into defaultProps
//   helper:   ui.applyBoxStyle(el, props)  inline-style sync from a propsSig
//
// Defaults are empty / null. The helper writes inline only when the value
// is "real" (non-empty string, non-null number). Empty → no inline style →
// the framework's CSS rules (theme cascade) win. That's how "no edit = use
// theme" falls out for free.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  // valueKind:'hex' forces colorInput to store '#rrggbb' strings — CSS
  // accepts them directly. Without this override, the default color
  // typedef (base_type:int) stores 24-bit ints, which write to
  // el.style.background as plain digit strings and the browser ignores.
  ui.BOX_STYLE_SCHEMA = {
    background:    { type: 'color', type_agv: { valueKind: 'hex' } },
    borderColor:   { type: 'color', type_agv: { valueKind: 'hex' } },
    borderWidth:   { type: 'int'    },
    borderStyle:   { type: 'enum_string', type_agv: { options: ['solid','dashed','dotted'] } },
    borderRadius:  { type: 'int'    },
    padding:       { type: 'int'    },
    opacity:       { type: 'float'  },
    shadow:        { type: 'string' },
  }

  ui.BOX_STYLE_DEFAULTS = {
    background:   '',
    borderColor:  '',
    borderWidth:  null,
    borderStyle:  '',
    borderRadius: null,
    padding:      null,
    opacity:      null,
    shadow:       '',
  }

  ui.applyBoxStyle = function (el, propsSig) {
    EF.effect(function () {
      const p = propsSig() || {}
      setStr(el, 'background',   p.background)
      setStr(el, 'borderColor',  p.borderColor)
      setPx (el, 'borderWidth',  p.borderWidth)
      setStr(el, 'borderStyle',  p.borderStyle)
      setPx (el, 'borderRadius', p.borderRadius)
      setPx (el, 'padding',      p.padding)
      setNum(el, 'opacity',      p.opacity)
      setStr(el, 'boxShadow',    p.shadow)
    })
  }

  function setStr(el, prop, v) { el.style[prop] = (v == null || v === '') ? '' : v }
  function setPx (el, prop, v) {
    if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) el.style[prop] = ''
    else el.style[prop] = v + 'px'
  }
  function setNum(el, prop, v) { el.style[prop] = (v == null || v === '') ? '' : String(v) }

  // Shared with _text-style.js so the small primitives stay one definition.
  ui._styleSetters = { setStr: setStr, setPx: setPx, setNum: setNum }
})(window.EF = window.EF || {})
