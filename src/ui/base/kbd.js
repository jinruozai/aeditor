// aeditor.ui.kbd — keyboard shortcut hint chip (e.g. ⌘K, Ctrl+S).
//
// Signature accepts either a plain string (legacy short form) or an opts
// object with a signal-aware `text` field. Both map to the same DOM.
//   aeditor.ui.kbd('Ctrl+S')
//   aeditor.ui.kbd({ text: sig })
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.kbd = function (arg) {
    const text = ui.asSig(
      arg && typeof arg === 'object' && !ui.isSignal(arg)
        ? (arg.text != null ? arg.text : '')
        : (arg != null ? arg : '')
    )
    const el = ui.h('kbd', 'aeditor-ui-kbd')
    ui.bindText(el, text)
    return el
  }
})(window.aeditor = window.aeditor || {})
