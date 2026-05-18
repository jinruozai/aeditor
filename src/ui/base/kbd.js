// aiditor.ui.kbd — keyboard shortcut hint chip (e.g. ⌘K, Ctrl+S).
//
// Signature accepts either a plain string short form or an opts
// object with a signal-aware `text` field. Both map to the same DOM.
//   aiditor.ui.kbd('Ctrl+S')
//   aiditor.ui.kbd({ text: sig })
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.kbd = function (arg) {
    const text = ui.asSig(
      arg && typeof arg === 'object' && !ui.isSignal(arg)
        ? (arg.text != null ? arg.text : '')
        : (arg != null ? arg : '')
    )
    const el = ui.h('kbd', 'aiditor-ui-kbd')
    ui.bindText(el, text)
    return el
  }
})(window.aiditor = window.aiditor || {})
