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
  // valueKind:'hex' forces colorInput to store '#rrggbb' strings — CSS
  // accepts them directly. Without this override, the default color
  // typedef (base_type:int) stores 24-bit ints, which write to
  // el.style.background as plain digit strings and the browser ignores.
  ui.BOX_STYLE_SCHEMA = {
    background:    { type: 'color', type_agv: { valueKind: 'hex' } },
    borderColor:   { type: 'color', type_agv: { valueKind: 'hex' } },
    borderWidth:   { type: 'int' },
    borderStyle:   { type: 'enum_string', type_agv: { options: ['solid','dashed','dotted'] } },
    borderRadius:  { type: 'int' },
    padding:       { type: 'int' },
    opacity:       { type: 'float' },
    shadowX:       { type: 'int' },
    shadowY:       { type: 'int' },
    shadowBlur:    { type: 'int' },
    shadowColor:   { type: 'color', type_agv: { valueKind: 'hex' } },
  }

  // borderStyle defaults to 'solid' so that as soon as a user sets
  // borderWidth + borderColor, the border actually paints — CSS treats
  // border-style:none (the spec default) as "no border", which made the
  // empty default invisible even when the other two were filled in.
  ui.BOX_STYLE_DEFAULTS = {
    background:   '',
    borderColor:  '',
    borderWidth:  null,
    borderStyle:  'solid',
    borderRadius: null,
    padding:      null,
    opacity:      null,
    shadowX:      null,
    shadowY:      null,
    shadowBlur:   null,
    shadowColor:  '',
  }

  ui.applyBoxStyle = function (el, propsSig) {
    EF.effect(function () {
      const p = propsSig() || {}
      setStr(el, 'background',   p.background)
      setStr(el, 'borderColor',  p.borderColor)
      setPx (el, 'borderWidth',  p.borderWidth)
      // Fall back to 'solid' whenever a width is set but the user hasn't
      // picked a style — CSS treats border-style:none as "no border" so an
      // unset style would silently swallow width+color even if both were
      // provided.
      setStr(el, 'borderStyle',  p.borderStyle || (p.borderWidth > 0 ? 'solid' : ''))
      setPx (el, 'borderRadius', p.borderRadius)
      setPx (el, 'padding',      p.padding)
      setNum(el, 'opacity',      p.opacity)
      // Compose box-shadow only when at least a color is supplied.
      // Empty color → no shadow regardless of x/y/blur (CSS would fall
      // back to currentColor, which is a confusing default for users).
      if (p.shadowColor) {
        el.style.boxShadow = (p.shadowX || 0) + 'px ' +
                             (p.shadowY || 0) + 'px ' +
                             (p.shadowBlur || 0) + 'px ' +
                             p.shadowColor
      } else {
        el.style.boxShadow = ''
      }
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
