// aeditor.ui.divider — horizontal or vertical separator line.
//
// aeditor.ui.divider({ vertical?: boolean|signal, label?: string|signal })
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.divider = function (opts) {
    const o = opts || {}
    const vertical = ui.asSig(o.vertical != null ? o.vertical : false)
    const label    = ui.asSig(o.label    != null ? o.label    : '')
    const el = ui.h('div', 'aeditor-ui-divider')
    const labelEl = ui.h('span', 'aeditor-ui-divider-label')
    ui.bindText(labelEl, label)
    ui.bind(el, vertical, function (v) {
      el.classList.toggle('aeditor-ui-divider-v', !!v)
      el.classList.toggle('aeditor-ui-divider-h', !v)
    })
    ui.bind(el, label, function (v) {
      const has = v != null && v !== ''
      el.classList.toggle('aeditor-ui-divider-labeled', has)
      if (has) { if (!labelEl.parentNode) el.appendChild(labelEl) }
      else if (labelEl.parentNode) el.removeChild(labelEl)
    })
    return el
  }
})(window.aeditor = window.aeditor || {})
