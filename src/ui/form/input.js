// aiditor.ui.input — single-line text input bound to a signal.
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
//   onCancel    : (base) => void              fired after Escape restores base
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.input = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : '')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const readOnly    = ui.asSig(o.readOnly    != null ? o.readOnly    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.input')

    const wrap = ui.h('div', 'aiditor-ui-field')
    if (o.prefix != null) wrap.appendChild(slot(o.prefix, 'prefix'))
    const el = ui.h('input', 'aiditor-ui-input', { type: o.type || 'text' })
    wrap.appendChild(el)
    if (o.suffix != null) wrap.appendChild(slot(o.suffix, 'suffix'))

    ui.bindAttr(el, placeholder, 'placeholder')
    ui.bindAttr(el, readOnly,    'readOnly')
    ui.bind(wrap, sig, function (v) {
      if (document.activeElement !== el) el.value = v == null ? '' : String(v)
    })
    ui.bind(wrap, disabled, function (v) {
      el.disabled = !!v
      wrap.classList.toggle('aiditor-ui-field-disabled', !!v)
    })

    el.addEventListener('input', function () { doWrite(el.value) })
    ui.editSession({
      el: el,
      owner: wrap,
      get: function () { return el.value },
      set: function (v) {
        el.value = v == null ? '' : String(v)
        doWrite(el.value)
      },
      onCommit: o.onCommit,
      onCancel: o.onCancel,
    })

    return wrap
  }

  function slot(content, side) {
    const el = ui.h('span', 'aiditor-ui-field-' + side)
    if (content instanceof HTMLElement) el.appendChild(content)
    else el.textContent = String(content)
    return el
  }
})(window.aiditor = window.aiditor || {})
