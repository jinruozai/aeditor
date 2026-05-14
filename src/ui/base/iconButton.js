// aeditor.ui.iconButton — square icon-only button (toolbars, table row actions).
//
// opts: { icon, title, ariaLabel?, size?, kind?, disabled?, onClick }
//
// All display props accept either a plain value or a signal. `title` or
// `ariaLabel` is required for accessibility; when either is a signal the DOM
// title / aria-label tracks it.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.iconButton = function (opts) {
    const o = opts || {}
    const titleSig = ui.asSig(o.title != null ? o.title : '')
    const ariaSig  = ui.asSig(o.ariaLabel != null ? o.ariaLabel : o.title)
    if (!titleSig.peek() && !ariaSig.peek()) {
      throw new Error('ui.iconButton: `title` or `ariaLabel` is required for accessibility')
    }
    const icon     = ui.asSig(o.icon     != null ? o.icon     : '·')
    const size     = ui.asSig(o.size     != null ? o.size     : 'md')
    const kind     = ui.asSig(o.kind     != null ? o.kind     : 'ghost')
    const disabled = ui.asSig(o.disabled != null ? o.disabled : false)

    const el = ui.h('button', 'aeditor-ui-icon-btn', { type: 'button' })
    ui.bind(el, titleSig, function (v) {
      const s = v == null ? '' : String(v)
      if (s) el.setAttribute('title', s)
      else el.removeAttribute('title')
    })
    ui.bind(el, ariaSig, function (v) {
      const s = v == null ? '' : String(v)
      if (s) el.setAttribute('aria-label', s)
      else el.removeAttribute('aria-label')
    })
    ui.bindClass(el, size, 'aeditor-ui-icon-btn-')
    ui.bindClass(el, kind, 'aeditor-ui-btn-')
    ui.bindAttr(el, disabled, 'disabled')

    // Inner icon tracks both name (registered SVG) and size via the same
    // signals. `icon` is forwarded as `name` — ui.icon resolves it to a
    // registered SVG first; otherwise falls back to rendering the value as
    // a text glyph, so single-char text values still work.
    el.appendChild(ui.icon({ name: icon, size: size }))

    if (o.onClick) el.addEventListener('click', function (e) { if (!el.disabled) o.onClick(e) })
    return el
  }
})(window.aeditor = window.aeditor || {})
