// EF.ui.copyButton — icon button that copies text and gives success feedback.
//
// opts:
//   text    : string | () => string | signal<string>
//   title?  : string | signal<string>   default: 'Copy'
//   copiedTitle?                     default: 'Copied'
//   size?   : 'sm' | 'md' | 'lg' | signal
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.copyButton = function (opts) {
    const o = opts || {}
    const copied = EF.signal(false)
    const iconSig = EF.derived(function () { return copied() ? 'check' : 'copy' })
    const titleSig = EF.derived(function () {
      return copied() ? (o.copiedTitle || 'Copied') : (readValue(o.title) || 'Copy')
    })
    let timer = 0

    const btn = ui.iconButton({
      icon: iconSig,
      title: titleSig,
      size: o.size || 'sm',
      kind: 'ghost',
      onClick: function () {
        copyText(readText(o.text)).then(function () {
          copied.set(true)
          btn.classList.add('ef-ui-copy-btn-copied')
          if (timer) clearTimeout(timer)
          timer = setTimeout(function () {
            copied.set(false)
            btn.classList.remove('ef-ui-copy-btn-copied')
            timer = 0
          }, 950)
        })
      },
    })
    btn.classList.add('ef-ui-copy-btn')
    ui.collect(btn, iconSig.dispose)
    ui.collect(btn, titleSig.dispose)
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

  function copyText(text) {
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
})(window.EF = window.EF || {})
