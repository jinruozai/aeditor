// aiditor.ui.copyButton — icon button that copies text and gives success feedback.
//
// opts:
//   text    : string | () => string | signal<string>
//   title?  : string | signal<string>   default: 'Copy'
//   copiedTitle?                     default: 'Copied'
//   size?   : 'sm' | 'md' | 'lg' | signal
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.copyButton = function (opts) {
    const o = opts || {}
    const copied = aiditor.signal(false)
    const copyTitle = aiditor.derived(function () { return readValue(o.title) || 'Copy' })
    let timer = 0

    const btn = ui.stateButton({
      value: copied,
      off: { icon: 'copy', title: copyTitle },
      on: { icon: 'check', title: o.copiedTitle || 'Copied', pressed: false },
      size: o.size || 'sm',
      kind: 'ghost',
      next: function () { return true },
      onChange: function () {
        ui.copyText(readText(o.text)).then(function () {
          copied.set(true)
          if (timer) clearTimeout(timer)
          timer = setTimeout(function () {
            copied.set(false)
            timer = 0
          }, 950)
        })
      },
    })
    btn.classList.add('aiditor-ui-copy-btn')
    ui.collect(btn, copyTitle.dispose)
    ui.collect(btn, function () { if (timer) clearTimeout(timer) })
    return btn
  }

  function readText(v) {
    return readValue(v)
  }

  function readValue(v) {
    if (ui.isSignal && ui.isSignal(v)) return v()
    if (typeof v === 'function') return v()
    return v
  }

  ui.copyText = function (text) {
    const s = String(text == null ? '' : text)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).catch(function () { fallbackCopy(s) })
    }
    fallbackCopy(s)
    return Promise.resolve()
  }

  function fallbackCopy(s) {
    const ta = document.createElement('textarea')
    ta.value = s
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
})(window.aiditor = window.aiditor || {})
