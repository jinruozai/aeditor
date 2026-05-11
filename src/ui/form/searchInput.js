// aeditor.ui.searchInput — single-line search field with a built-in clear affordance.
//
// opts are the same as ui.input, with a search icon prefix and an automatic
// clear button shown only while the field has text.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.searchInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value : '')

    const clear = ui.iconButton({
      icon: 'x',
      title: o.clearTitle || (aeditor.i18n && aeditor.i18n.has(aeditor.i18n.getLocale(), 'common.clear_search') ? aeditor.i18n.t('common.clear_search') : 'Clear search'),
      size: 'sm',
      kind: 'ghost',
      onClick: function () {
        sig.set('')
        if (typeof o.onChange === 'function') o.onChange('')
      },
    })
    clear.classList.add('aeditor-ui-search-clear')

    const field = ui.input(Object.assign({}, o, {
      value: sig,
      onChange: function (v) {
        sig.set(v)
        if (typeof o.onChange === 'function') o.onChange(v)
      },
      prefix: ui.icon({ name: 'search', size: 'sm' }),
      suffix: clear,
    }))
    field.classList.add('aeditor-ui-search-field')

    ui.bind(field, sig, function (v) {
      clear.hidden = !(v != null && String(v).length)
    })

    return field
  }
})(window.aeditor = window.aeditor || {})
