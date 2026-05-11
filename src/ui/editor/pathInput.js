// aeditor.ui.pathInput — file/folder path with browse button.
//
// In a pure-frontend world we can't actually open OS file dialogs. This
// component emits an `onBrowse` callback you wire up to your own picker (or
// to <input type=file>). For demos we expose `useFileInput: true` which
// uses the browser file picker to grab a name only.
//
// opts: {
//   value: signal<string>, onChange?,
//   placeholder?: string|signal,
//   disabled?: bool|signal,
//   useFileInput?, onBrowse?,
//   mode?: 'file'|'folder'|signal,
// }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.pathInput = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : 'Path...')
    const disabled    = ui.asSig(o.disabled    != null ? o.disabled    : false)
    const mode        = ui.asSig(o.mode        != null ? o.mode        : 'file')
    const doWrite = ui.writer(sig, o.onChange, 'ui.pathInput')
    const el = ui.h('div', 'aeditor-ui-field aeditor-ui-path')
    const ic = ui.h('span', 'aeditor-ui-field-prefix')
    const inp = ui.h('input', 'aeditor-ui-input', { type: 'text' })
    const btn = ui.h('button', 'aeditor-ui-path-browse', { type: 'button', text: '…' })
    el.appendChild(ic); el.appendChild(inp); el.appendChild(btn)

    ui.bind(el, mode, function (v) { ic.textContent = v === 'folder' ? '📁' : '📄' })
    ui.bindAttr(inp, placeholder, 'placeholder')
    ui.bindAttr(inp, disabled, 'disabled')
    ui.bindAttr(btn, disabled, 'disabled')
    ui.bind(el, sig, function (v) { if (document.activeElement !== inp) inp.value = v || '' })
    inp.addEventListener('input', function () { doWrite(inp.value) })

    // Accept drops: OS files → file.name; URL drops → the URL string.
    ui.dropzone(el, {
      accept: ['Files', 'text/uri-list', 'text/plain'],
      canDrop: function () { return !disabled.peek() },
      onDrop: function (d) {
        if (d.files && d.files[0]) doWrite(d.files[0].name)
        else if (d.uri)  doWrite(d.uri)
        else if (d.text) doWrite(d.text)
      },
    })

    btn.addEventListener('click', function () {
      if (disabled.peek()) return
      if (o.useFileInput) {
        // Hidden <input type=file> has to live in the DOM for .click() to
        // reliably open the picker (some older browsers reject detached
        // inputs). Both outcomes — change (file chosen) and cancel (picker
        // dismissed) — funnel through the same cleanup so the element never
        // accumulates in <body>.
        const f = ui.h('input', null, { type: 'file' })
        f.style.display = 'none'
        document.body.appendChild(f)
        function cleanup() { if (f.parentNode) f.parentNode.removeChild(f) }
        f.addEventListener('change', function () {
          if (f.files[0]) doWrite(f.files[0].name)
          cleanup()
        })
        f.addEventListener('cancel', cleanup)
        f.click()
      } else if (o.onBrowse) {
        o.onBrowse(function (path) { if (path) doWrite(path) })
      }
    })
    return el
  }
})(window.aeditor = window.aeditor || {})
