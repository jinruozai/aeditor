// aiditor.ui.tagInput — chip list with add-on-Enter and click-to-remove.
//
// opts: {
//   value: signal<string[]>, onChange?,
//   placeholder?: string|signal,
//   disabled?: bool|signal,
// }
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.tagInput = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : [])
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : 'Add...')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const doWrite = ui.writer(sig, o.onChange, 'ui.tagInput')
    const el = ui.h('div', 'aiditor-ui-field aiditor-ui-taginput')
    const list = ui.h('div', 'aiditor-ui-taginput-list')
    const inp = ui.h('input', 'aiditor-ui-taginput-input', { type: 'text' })
    el.appendChild(list); el.appendChild(inp)
    ui.bindAttr(inp, placeholder, 'placeholder')
    ui.bindAttr(inp, disabled, 'disabled')
    ui.bind(el, disabled, function (v) { el.classList.toggle('aiditor-ui-taginput-disabled', !!v) })

    function rebuild(arr) {
      list.replaceChildren()
      for (let i = 0; i < arr.length; i++) {
        const idx = i
        const t = ui.tag({ text: arr[idx], onClose: function () {
          if (disabled.peek()) return
          const next = sig.peek().slice(); next.splice(idx, 1); doWrite(next)
        }})
        list.appendChild(t)
      }
    }
    ui.bind(el, sig, rebuild)

    inp.addEventListener('keydown', function (e) {
      if (disabled.peek()) return
      if (e.key === 'Enter' && inp.value.trim()) {
        e.preventDefault()
        if (aiditor.shortcuts) aiditor.shortcuts.markHandled(e)
        doWrite(sig.peek().concat(inp.value.trim()))
        inp.value = ''
      } else if (e.key === 'Backspace' && !inp.value && sig.peek().length) {
        e.preventDefault()
        if (aiditor.shortcuts) aiditor.shortcuts.markHandled(e)
        doWrite(sig.peek().slice(0, -1))
      }
    })
    el.addEventListener('click', function () { if (!disabled.peek()) inp.focus() })
    return el
  }
})(window.aiditor = window.aiditor || {})
