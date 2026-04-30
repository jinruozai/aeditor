// EF.ui.image — bitmap/raster image primitive.
//
// opts:
//   src       : string | signal<string>           image URL
//   alt       : string | signal<string>           accessibility text
//   objectFit : 'cover'|'contain'|'fill'|'none'   fit mode (default 'cover')
//
// Sizing comes from CSS — the <img> fills its parent by default; consumers
// shape it via the standard BOX_STYLE props (width/height/border/radius/…)
// applied to the wrapping element by the component registration.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.image = function (opts) {
    const o = opts || {}
    const src = ui.asSig(o.src != null ? o.src : '')
    const alt = ui.asSig(o.alt != null ? o.alt : '')
    const fit = ui.asSig(o.objectFit != null ? o.objectFit : 'cover')

    const el = ui.h('img', 'ef-ui-image')
    el.setAttribute('draggable', 'false')
    el.addEventListener('error', function () { el.removeAttribute('src') })
    ui.bind(el, src, function (v) {
      const s = v == null ? '' : String(v)
      const resolved = s && typeof ui.resolveAssetUrl === 'function' ? (ui.resolveAssetUrl(s) || s) : s
      if (resolved) el.setAttribute('src', resolved); else el.removeAttribute('src')
    })
    ui.bind(el, alt, function (v) { el.setAttribute('alt', v == null ? '' : String(v)) })
    ui.bind(el, fit, function (v) { el.style.objectFit = v || 'cover' })
    return el
  }
})(window.EF = window.EF || {})
