// aeditor.ui.input — single-line text input bound to a signal.
//
// opts:
//   value       : string | signal<string>   (auto-wrapped if plain)
//   onChange    : (v) => void                 required if `value` is read-only
//   placeholder : string | signal<string>
//   disabled    : boolean | signal<boolean>
//   readOnly    : boolean | signal<boolean>
//   prefix      : string | HTMLElement        visual icon/label inside the well
//   suffix      : string | HTMLElement
//   type        : input type                  default "text"
//   onCommit    : (v) => void                 fired on Enter / blur
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.input = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : '')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const readOnly    = ui.asSig(o.readOnly    != null ? o.readOnly    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.input')

    const wrap = ui.h('div', 'aeditor-ui-field')
    if (o.prefix != null) wrap.appendChild(slot(o.prefix, 'prefix'))
    const el = ui.h('input', 'aeditor-ui-input', { type: o.type || 'text' })
    wrap.appendChild(el)
    if (o.suffix != null) wrap.appendChild(slot(o.suffix, 'suffix'))

    ui.bindAttr(el, placeholder, 'placeholder')
    ui.bindAttr(el, readOnly,    'readOnly')
    ui.bind(wrap, sig, function (v) {
      if (document.activeElement !== el) el.value = v == null ? '' : String(v)
    })
    ui.bind(wrap, disabled, function (v) {
      el.disabled = !!v
      wrap.classList.toggle('aeditor-ui-field-disabled', !!v)
    })

    el.addEventListener('input', function () { doWrite(el.value) })
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && o.onCommit) o.onCommit(el.value)
    })
    el.addEventListener('blur', function () { o.onCommit && o.onCommit(el.value) })

    return wrap
  }

  function slot(content, side) {
    const el = ui.h('span', 'aeditor-ui-field-' + side)
    if (content instanceof HTMLElement) el.appendChild(content)
    else el.textContent = String(content)
    return el
  }
})(window.aeditor = window.aeditor || {})
