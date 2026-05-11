// UI library — portal layer.
//
// All overlay widgets (popover, menu, tooltip, modal, drawer, toast) mount
// their root elements into a single document-level container so they can
// escape parent stacking contexts and `overflow:hidden` clippers (a common
// problem when a popover is hosted inside a scrollable panel).
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  function root() {
    let r = document.getElementById('aeditor-portal-root')
    if (!r) {
      r = document.createElement('div')
      r.id = 'aeditor-portal-root'
      // z-index: use the popover token as the portal layer baseline; each
      // overlay stacks on top via calc() in _overlay.js.
      r.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:var(--aeditor-z-popover);'
      document.body.appendChild(r)
    }
    return r
  }
  ui.portalRoot = root

  // mount(el): append into portal layer; returns an unmount function.
  ui.portal = function (el) {
    root().appendChild(el)
    return function () { if (el.parentNode) el.parentNode.removeChild(el) }
  }
})(window.aeditor = window.aeditor || {})
