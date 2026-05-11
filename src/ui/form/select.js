// aeditor.ui.select — dropdown selector with custom-styled menu (no native <select>).
//
// opts: {
//   value: signal<any>, onChange?,
//   options: [{ value, label, icon? }],
//   placeholder?: string|signal,
//   disabled?: bool|signal,
//   variant?: 'default'|'minimal',
//   autoWidth?: bool,
// }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.select = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value)
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : 'Select...')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.select')
    const cls = 'aeditor-ui-select'
      + (o.variant === 'minimal' ? ' aeditor-ui-select-minimal' : '')
      + (o.autoWidth ? ' aeditor-ui-select-auto' : '')
    const el = ui.h('button', cls, { type: 'button' })
    const labelEl = ui.h('span', 'aeditor-ui-select-label')
    const arrow = ui.h('span', 'aeditor-ui-select-arrow', { text: '▾' })
    el.appendChild(labelEl); el.appendChild(arrow)
    ui.bindAttr(el, disabled, 'disabled')

    function findLabel(v) {
      const items = o.options || []
      for (let i = 0; i < items.length; i++) if (items[i].value === v) return items[i].label
      return null
    }
    function repaint() {
      const v = sig.peek()
      const lbl = findLabel(v)
      if (lbl != null) { labelEl.textContent = lbl; labelEl.classList.remove('aeditor-ui-select-placeholder') }
      else { labelEl.textContent = placeholder.peek() || 'Select...'; labelEl.classList.add('aeditor-ui-select-placeholder') }
    }
    ui.bind(el, sig,         repaint)
    ui.bind(el, placeholder, repaint)

    let pop = null
    el.addEventListener('click', function () {
      if (disabled.peek()) return
      if (pop) { pop.close(); pop = null; return }
      const list = ui.h('div', 'aeditor-ui-menu')
      const items = o.options || []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.type === 'header') {
          list.appendChild(ui.h('div', 'aeditor-ui-menu-header', { text: it.label || '' }))
          continue
        }
        if (it.type === 'divider') {
          list.appendChild(ui.h('div', 'aeditor-ui-menu-divider'))
          continue
        }
        const row = ui.h('button', 'aeditor-ui-menu-item' + (it.value === sig.peek() ? ' aeditor-ui-menu-item-active' : ''), { type: 'button' })
        if (it.icon) row.appendChild(ui.icon({ glyph: it.icon }))
        const text = ui.h('span', 'aeditor-ui-menu-item-text')
        text.appendChild(ui.h('span', 'aeditor-ui-menu-item-label', { text: it.label != null ? it.label : String(it.value) }))
        if (it.subLabel) text.appendChild(ui.h('span', 'aeditor-ui-menu-item-sub', { text: it.subLabel }))
        row.appendChild(text)
        row.addEventListener('click', function () { doWrite(it.value); pop && pop.close(); pop = null })
        list.appendChild(row)
      }
      list.style.minWidth = Math.max(120, el.getBoundingClientRect().width) + 'px'
      list.style.maxHeight = Math.max(160, Math.min(420, window.innerHeight - 96)) + 'px'
      list.style.overflow = 'auto'
      pop = ui.popover({
        anchor: el,
        content: list,
        side: o.side || 'bottom',
        align: o.align || 'start',
        onDismiss: function () { pop = null },
      })
    })
    ui.collect(el, function () { if (pop) { pop.close(); pop = null } })

    return el
  }
})(window.aeditor = window.aeditor || {})
