// EF.ui.combobox — text input + filtered dropdown.
//
// opts: {
//   value: signal<string>, onChange?,
//   options: string[] | [{value,label}],
//   placeholder?: string|signal,
//   disabled?: bool|signal,
// }
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  function norm(items) {
    return (items || []).map(function (it) {
      if (typeof it === 'string') return { value: it, label: it }
      return it
    })
  }

  ui.combobox = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : '')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.combobox')
    const wrap = ui.h('div', 'ef-ui-field ef-ui-combobox')
    const inp = ui.h('input', 'ef-ui-input', { type: 'text' })
    const arrow = ui.h('span', 'ef-ui-field-suffix', { text: '▾' })
    wrap.appendChild(inp); wrap.appendChild(arrow)
    ui.bindAttr(inp, placeholder, 'placeholder')
    ui.bindAttr(inp, disabled, 'disabled')
    ui.bind(wrap, sig, function (v) { if (document.activeElement !== inp) inp.value = v == null ? '' : String(v) })

    let pop = null
    function open(showAll) {
      if (pop) return
      if (disabled.peek()) return
      const list = ui.h('div', 'ef-ui-menu')
      const term = showAll ? '' : inp.value.toLowerCase()
      const items = norm(ui.isSignal && ui.isSignal(o.options) ? o.options.peek() : o.options)
      const filtered = items.filter(function (it) { return !term || String(it.label).toLowerCase().indexOf(term) >= 0 })
      if (!filtered.length) {
        const empty = ui.h('div', 'ef-ui-menu-empty', { text: 'No matches' })
        list.appendChild(empty)
      }
      for (let i = 0; i < filtered.length; i++) {
        const it = filtered[i]
        const row = ui.h('button', 'ef-ui-menu-item', { type: 'button', text: it.label })
        row.addEventListener('mousedown', function (e) { e.preventDefault(); doWrite(it.value); inp.value = it.value; close() })
        list.appendChild(row)
      }
      list.style.minWidth = wrap.getBoundingClientRect().width + 'px'
      list.style.maxHeight = '240px'; list.style.overflow = 'auto'
      pop = ui.popover({ anchor: wrap, content: list, side: 'bottom', align: 'start', onDismiss: function () { pop = null } })
    }
    function close() { if (pop) { pop.close(); pop = null } }
    function reopen(showAll) { close(); open(showAll) }

    inp.addEventListener('focus', function () { open(true) })
    inp.addEventListener('input', function () { doWrite(inp.value); reopen(false) })
    arrow.addEventListener('mousedown', function (e) { e.preventDefault(); inp.focus(); pop ? close() : open(true) })
    ui.collect(wrap, close)

    return wrap
  }
})(window.EF = window.EF || {})
