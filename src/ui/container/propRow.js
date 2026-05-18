// aiditor.ui.propRow — Blender-style property row: label on the left, control on the right.
//
// opts: {
//   label?: string|signal,
//   control: HTMLElement,
//   hint?: string|signal,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.propRow = function (opts) {
    const o = opts || {}
    const label = ui.asSig(o.label != null ? o.label : '')
    const el = ui.h('div', 'aiditor-ui-prop-row')
    const lab = ui.h('label', 'aiditor-ui-prop-label')
    ui.bindText(lab, label)
    if (o.hint != null) ui.bindAttr(lab, ui.asSig(o.hint), 'title')
    const ctrl = ui.h('div', 'aiditor-ui-prop-control')
    if (o.control) ctrl.appendChild(o.control)
    el.appendChild(lab); el.appendChild(ctrl)
    return el
  }
})(window.aiditor = window.aiditor || {})
