// EF.ui.alert / ui.confirm / ui.prompt / ui.contextMenu — Promise-based
// dialog helpers built on ui.modal + ui.menu. These are the everyday entry
// points for "ask the user a yes/no question", "ask for a single string",
// "show an OK message", and "open a menu at a screen point".
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  function footer(buttons) {
    const f = ui.h('div', 'ef-ui-dialog-foot')
    buttons.forEach(function (b) { f.appendChild(b) })
    return f
  }

  function tr(key, fallback) {
    if (!EF.i18n) return fallback
    const value = EF.i18n.t(key)
    return value === key ? fallback : value
  }

  // ── ui.alert(opts) → Promise<void>
  // opts: { title?, message?, okLabel? = 'OK' }
  ui.alert = function (opts) {
    const o = opts || {}
    return new Promise(function (resolve) {
      const body = ui.h('div', 'ef-ui-dialog-body', { text: o.message || '' })
      let modal
      const ok = ui.button({
        text: o.okLabel || tr('common.ok', 'OK'), kind: 'primary',
        onClick: function () { modal.close() },
      })
      modal = ui.modal({
        title:   o.title || '',
        content: body,
        footer:  footer([ok]),
        onClose: function () { resolve() },
      })
      autoFocus(ok)
    })
  }

  // ── ui.confirm(opts) → Promise<boolean>
  // opts: { title?, message?, okLabel? = 'OK', cancelLabel? = 'Cancel', danger? }
  ui.confirm = function (opts) {
    const o = opts || {}
    return new Promise(function (resolve) {
      let done = false
      const finish = function (v) { if (done) return; done = true; modal.close(); resolve(v) }
      const body = ui.h('div', 'ef-ui-dialog-body', { text: o.message || '' })
      const cancel = ui.button({ text: o.cancelLabel || tr('common.cancel', 'Cancel'), onClick: function () { finish(false) } })
      const ok = ui.button({
        text: o.okLabel || tr('common.ok', 'OK'),
        kind: o.danger ? 'danger' : 'primary',
        onClick: function () { finish(true) },
      })
      var modal = ui.modal({
        title:   o.title || '',
        content: body,
        footer:  footer([cancel, ok]),
        onClose: function () { if (!done) { done = true; resolve(false) } },
      })
      autoFocus(ok)
    })
  }

  // ── ui.prompt(opts) → Promise<string|null>
  // opts: { title?, message?, default?, placeholder?, okLabel?, cancelLabel? }
  // Resolves with the entered string, or null if the user cancelled / closed.
  ui.prompt = function (opts) {
    const o = opts || {}
    return new Promise(function (resolve) {
      let done = false
      const finish = function (v) { if (done) return; done = true; resolve(v); modal.close() }
      const value  = EF.signal(o.default != null ? String(o.default) : '')
      const body   = ui.h('div', 'ef-ui-dialog-body ef-ui-dialog-body-prompt')
      if (o.message) body.appendChild(ui.h('div', 'ef-ui-dialog-msg', { text: o.message }))
      const inputEl = ui.input({ value: value, placeholder: o.placeholder || '' })
      body.appendChild(inputEl)

      const cancel = ui.button({ text: o.cancelLabel || tr('common.cancel', 'Cancel'), onClick: function () { finish(null) } })
      const ok     = ui.button({
        text: o.okLabel || tr('common.ok', 'OK'), kind: 'primary',
        onClick: function () { finish(value.peek()) },
      })
      var modal = ui.modal({
        title:   o.title || '',
        content: body,
        footer:  footer([cancel, ok]),
        onClose: function () { if (!done) { done = true; resolve(null) } },
      })

      const native = inputEl.querySelector('input')
      if (native) {
        native.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); finish(value.peek()) }
        })
        autoFocus(native, true)
      }
    })
  }

  // ── ui.contextMenu({x,y}, items) → menu handle
  // Items follow ui.menu's spec. A zero-size anchor at (x,y) lets popover
  // positioning flip against viewport edges. Anchor is removed on dismiss.
  ui.contextMenu = function (pos, items) {
    const anchor = ui.h('div', null, {
      style: 'position:fixed;width:0;height:0;left:' + (pos.x || 0) + 'px;top:' + (pos.y || 0) + 'px;',
    })
    document.body.appendChild(anchor)
    const menu = ui.menu({
      anchor: anchor, items: items, side: 'bottom', align: 'start',
      onDismiss: function () {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
      },
    })
    const origClose = menu.close
    menu.close = function () {
      origClose()
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
    }
    return menu
  }

  // Deferred focus — modal mount + focus-trap install both happen synchronously
  // before the box is in the DOM at its final size. rAF after that is when
  // .focus() reliably lands and (for inputs) .select() exposes the text.
  function autoFocus(el, selectAll) {
    requestAnimationFrame(function () {
      try { el.focus(); if (selectAll && typeof el.select === 'function') el.select() } catch (_) {}
    })
  }
})(window.EF = window.EF || {})
