// EF.ui.assetPicker — path text field + preview thumbnail, for images /
// audio / any project-resource field. The whole frame is both a drop zone
// (accepts OS files + URLs + other EF asset drags) and — via the
// thumbnail — a drag source for carrying this asset elsewhere.
//
// opts:
//   value:        string | signal<string>       the asset path
//   onChange?:    (v) => void
//   kind?:        'image' | 'audio' | 'file'    shape of the preview +
//                                               the drop filter
//   placeholder?: string | signal               path hint
//   accept?:      string                        ".png,.jpg…" for the native
//                                                picker (informational)
//   onBrowse?:    (current) => Promise<string|null> | string | null
//                                                custom "pick" action;
//                                                default opens a hidden
//                                                file input and stores an
//                                                object URL.
//   onFile?:      (file,current) => Promise<string|null> | string | null
//                                                custom file import path;
//                                                used by drop + default browse.
//   resolveSrc?:  (value) => string             preview URL resolver for
//                                                project-relative paths.
//   exists?:      (value) => boolean            marks missing project assets
//
// Layout: [thumb] [path input]. Clicking the thumb opens the picker
// (same action the now-removed folder button used to do). Dragging the
// thumb exports the current value as text/uri-list + ef.asset+json so
// other asset pickers / user widgets can receive it.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.assetPicker = function (opts) {
    const o = opts || {}
    const sig         = ui.asSig(o.value       != null ? o.value       : '')
    const placeholder = ui.asSig(o.placeholder != null ? o.placeholder : '')
    const kind        = o.kind || 'image'
    const accept      = o.accept || ''
    const doWrite     = ui.writer(sig, o.onChange, 'ui.assetPicker')

    const wrap = ui.h('div', 'ef-ui-asset-picker ef-ui-field')

    // Preview thumbnail. Also the visible affordance for "click to browse".
    const thumb = ui.h('div', 'ef-ui-asset-preview')
    function paintPreview(v) {
      thumb.innerHTML = ''
      if (kind === 'image' && v) {
        const src = typeof o.resolveSrc === 'function' ? o.resolveSrc(v) : v
        if (!src) {
          thumb.appendChild(placeholderIcon())
          return
        }
        const img = document.createElement('img')
        img.src = src
        img.onerror = function () { img.remove(); thumb.appendChild(placeholderIcon()) }
        thumb.appendChild(img)
      } else if (kind === 'audio') {
        thumb.appendChild(ui.icon({ name: 'music', size: 'sm' }))
      } else {
        thumb.appendChild(placeholderIcon())
      }
    }
    function placeholderIcon() {
      return ui.icon({ name: kind === 'image' ? 'image' : 'file', size: 'sm' })
    }
    thumb.addEventListener('click', doBrowse)
    wrap.appendChild(thumb)

    // Path input. We reuse ui.input, which already arrives wrapped in its
    // own .ef-ui-field — strip that layer's border so our outer frame
    // stays the only visible box.
    const pathSig = EF.signal(String(sig.peek() || ''))
    const input = ui.input({ value: pathSig, placeholder: placeholder })
    input.classList.add('ef-ui-asset-path')
    input.style.flex = '1 1 auto'
    input.style.minWidth = '0'
    const innerInput = input.querySelector('input')
    if (innerInput) innerInput.style.border = '0'
    wrap.appendChild(input)
    ui.collect(wrap, function () { ui.dispose(input) })

    // signal ⇄ input bi-sync
    ui.bind(wrap, sig, function (v) {
      const s = v == null ? '' : String(v)
      if (pathSig.peek() !== s) pathSig.set(s)
      wrap.classList.toggle('is-missing', !!s && typeof o.exists === 'function' && !o.exists(s))
      paintPreview(s)
    })
    ui.collect(wrap, EF.effect(function () {
      const s = pathSig()
      if (s !== String(sig.peek() || '')) doWrite(s)
    }))

    // Drop target — the whole frame accepts dragged assets that match
    // our `kind`. Files, URL drops, and other EF asset sources all flow
    // through ui.dnd.extractUrl so the consumer just sees a final string.
    ui.dropzone(wrap, {
      accept:  ['Files', 'text/uri-list', 'text/plain', 'application/ef.asset+json', 'application/ef.asset.' + kind + '+json'],
      canDrop: function (d) { return ui.dnd.matchesKind(d, kind) },
      onDrop:  function (d) {
        if (d.asset && d.asset.value) {
          doWrite(ui.dnd.extractUrl(d))
          return
        }
        if (d.files && d.files[0] && typeof o.onFile === 'function') {
          const res = o.onFile(d.files[0], sig.peek())
          if (res && typeof res.then === 'function') res.then(function (v) { if (v != null) doWrite(v) })
          else if (res != null) doWrite(res)
          return
        }
        doWrite(ui.dnd.extractUrl(d))
      },
    })

    // Drag source — the thumbnail exports the current value. Other
    // asset pickers of compatible kind can receive it; OS targets get the
    // plain URL.
    ui.dragsource(thumb, {
      effect:  'copyMove',
      getData: function () {
        const v = sig.peek() || ''
        if (!v) return {}
        return {
          'text/uri-list':              v,
          'text/plain':                 v,
          'application/ef.asset+json':  JSON.stringify({ kind: kind, value: v }),
          ['application/ef.asset.' + kind + '+json']: JSON.stringify({ kind: kind, value: v }),
        }
      },
    })

    let browseInput = null
    ui.collect(wrap, function () {
      if (browseInput && browseInput.parentNode) browseInput.parentNode.removeChild(browseInput)
      browseInput = null
    })

    function doBrowse() {
      if (typeof o.onBrowse === 'function') {
        const res = o.onBrowse(sig.peek())
        if (res && typeof res.then === 'function') {
          res.then(function (v) { if (v != null) doWrite(v) })
        } else if (res != null) {
          doWrite(res)
        }
        return
      }
      // Fallback: hidden native file input → object URL.
      const f = document.createElement('input')
      browseInput = f
      f.type = 'file'
      if (accept) f.accept = accept
      f.style.display = 'none'
      document.body.appendChild(f)
      function cleanup() {
        if (f.parentNode) f.parentNode.removeChild(f)
        if (browseInput === f) browseInput = null
      }
      f.addEventListener('change', function () {
        const file = f.files && f.files[0]
        if (file && typeof o.onFile === 'function') {
          const res = o.onFile(file, sig.peek())
          if (res && typeof res.then === 'function') res.then(function (v) { if (v != null) doWrite(v) })
          else if (res != null) doWrite(res)
        } else if (file) {
          doWrite(URL.createObjectURL(file))
        }
        cleanup()
      })
      f.addEventListener('cancel', cleanup)
      f.click()
    }

    paintPreview(sig.peek())
    return wrap
  }
})(window.EF = window.EF || {})
