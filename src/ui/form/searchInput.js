// aiditor.ui.searchInput — single-line search field with a built-in clear affordance.
//
// opts are the same as ui.input, with a search icon prefix and an automatic
// clear button shown only while the field has text.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.searchInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value : '')
    const local = aiditor.signal(sig.peek() == null ? '' : String(sig.peek()))
    const doWrite = ui.writer(sig, o.onChange, 'ui.searchInput')

    const clear = ui.iconButton({
      icon: 'x',
      title: o.clearTitle || (aiditor.i18n && aiditor.i18n.has(aiditor.i18n.getLocale(), 'common.clear_search') ? aiditor.i18n.t('common.clear_search') : 'Clear search'),
      size: 'sm',
      kind: 'ghost',
      onClick: function () {
        local.set('')
        doWrite('')
      },
    })
    clear.classList.add('aiditor-ui-search-clear')

    const field = ui.input(Object.assign({}, o, {
      value: local,
      onChange: function (v) {
        local.set(v)
        doWrite(v)
      },
      prefix: ui.icon({ name: 'search', size: 'sm' }),
      suffix: clear,
    }))
    field.classList.add('aiditor-ui-search-field')

    ui.bind(field, sig, function (v) {
      const s = v == null ? '' : String(v)
      if (local.peek() !== s) local.set(s)
    })
    ui.bind(field, local, function (v) {
      clear.hidden = !(v != null && String(v).length)
    })

    return field
  }
})(window.aiditor = window.aiditor || {})
