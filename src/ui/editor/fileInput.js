// aiditor.ui.fileInput — drop zone + click-to-pick file input. Uses the shared
// ui.dropzone primitive so OS file drops and the reject/accept affordance
// stay consistent with every other asset-aware component.
//
// opts: { value: signal<File|null>, onChange?, accept?, multiple? }
//   value: if multiple, signal holds File[]; otherwise File or null.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.fileInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value : null)
    const doWrite = ui.writer(sig, o.onChange, 'ui.fileInput')
    const el = ui.h('div', 'aiditor-ui-fileinput')
    const inp = ui.h('input', null, { type: 'file' })
    if (o.accept) inp.accept = o.accept
    if (o.multiple) inp.multiple = true
    inp.style.display = 'none'

    const label = ui.h('div', 'aiditor-ui-fileinput-label')
    const ic = ui.h('div', 'aiditor-ui-fileinput-icon', { text: '⬆' })
    const tx = ui.h('div', 'aiditor-ui-fileinput-text', { text: 'Click or drop file…' })
    label.appendChild(ic); label.appendChild(tx)
    el.appendChild(inp); el.appendChild(label)

    function update(files) {
      const arr = Array.from(files || [])
      if (!arr.length) return
      doWrite(o.multiple ? arr : arr[0])
    }
    ui.bind(el, sig, function (v) {
      if (!v) { tx.textContent = 'Click or drop file…'; return }
      const list = Array.isArray(v) ? v : [v]
      tx.textContent = list.map(function (f) { return f.name }).join(', ')
    })

    el.addEventListener('click', function () { inp.click() })
    inp.addEventListener('change', function () { update(inp.files) })

    ui.dropzone(el, {
      accept: ['Files'],
      onDrop: function (d) { if (d.files) update(d.files) },
    })

    return el
  }
})(window.aiditor = window.aiditor || {})
