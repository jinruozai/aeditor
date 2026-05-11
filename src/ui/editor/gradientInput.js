// aeditor.ui.gradientInput — linear gradient color stop editor.
//
// Value shape:  signal<{ stops: [{ pos: number 0..1, color: string }, ...] }>
//
// Interaction:
//   • Click anywhere on the gradient bar to add a stop at that position.
//   • Press and drag a stop handle to move it (stable — the dragged handle is
//     never recreated mid-drag, so the pointer capture holds reliably).
//   • Double-click a stop (or press the Delete button) to remove it.
//     At least 2 stops are always preserved.
//   • Selecting a stop reveals its color in the color editor below.
//
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.gradientInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value
      : { stops: [{ pos: 0, color: '#000000' }, { pos: 1, color: '#ffffff' }] })
    const doWrite = ui.writer(sig, o.onChange, 'ui.gradientInput')

    const el = ui.h('div', 'aeditor-ui-gradient')
    const barWrap = ui.h('div', 'aeditor-ui-gradient-barwrap')
    const checker = ui.h('div', 'aeditor-ui-gradient-checker')
    const bar     = ui.h('div', 'aeditor-ui-gradient-bar')
    const rail    = ui.h('div', 'aeditor-ui-gradient-rail')
    barWrap.appendChild(checker)
    barWrap.appendChild(bar)
    barWrap.appendChild(rail)
    el.appendChild(barWrap)

    // Local selection state (not part of the serialized value).
    let selectedIdx = 0
    // Stable DOM handles, one per logical stop index. Re-used across updates
    // so drag sessions survive signal rebroadcasts.
    const handles = []

    function sortedStops(data) {
      return data.stops.slice().sort(function (a, b) { return a.pos - b.pos })
    }
    function paintBar() {
      const s = sortedStops(sig.peek())
      const css = s.map(function (x) { return x.color + ' ' + (x.pos * 100).toFixed(2) + '%' }).join(', ')
      bar.style.background = 'linear-gradient(to right, ' + css + ')'
    }

    function makeHandle() {
      const h = ui.h('div', 'aeditor-ui-gradient-stop')
      const fill = ui.h('div', 'aeditor-ui-gradient-stop-fill')
      h.appendChild(fill)
      h.__fill = fill
      h.__idx = 0
      h.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const idx = h.__idx
        selectedIdx = idx
        syncClasses()
        colorSig.set(sig.peek().stops[idx].color)
        try { h.setPointerCapture(e.pointerId) } catch (_) {}
        h.classList.add('aeditor-ui-gradient-stop-dragging')
        function onMove(ev) {
          const r = bar.getBoundingClientRect()
          const p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
          const data = sig.peek()
          const stops = data.stops.slice()
          stops[idx] = { pos: p, color: stops[idx].color }
          doWrite({ stops: stops })
        }
        function onUp(ev) {
          h.removeEventListener('pointermove', onMove)
          h.removeEventListener('pointerup', onUp)
          h.removeEventListener('pointercancel', onUp)
          try { h.releasePointerCapture(ev.pointerId) } catch (_) {}
          h.classList.remove('aeditor-ui-gradient-stop-dragging')
        }
        h.addEventListener('pointermove', onMove)
        h.addEventListener('pointerup', onUp)
        h.addEventListener('pointercancel', onUp)
      })
      h.addEventListener('dblclick', function (e) {
        e.stopPropagation()
        removeStop(h.__idx)
      })
      return h
    }

    function syncClasses() {
      for (let i = 0; i < handles.length; i++) {
        handles[i].classList.toggle('aeditor-ui-gradient-stop-active', i === selectedIdx)
      }
    }

    function syncHandles() {
      const data = sig.peek()
      const n = data.stops.length
      while (handles.length < n) {
        const h = makeHandle()
        rail.appendChild(h)
        handles.push(h)
      }
      while (handles.length > n) {
        const h = handles.pop()
        h.remove()
      }
      if (selectedIdx >= n) selectedIdx = n - 1
      for (let i = 0; i < n; i++) {
        const s = data.stops[i]
        const h = handles[i]
        h.__idx = i
        h.style.left = (s.pos * 100) + '%'
        h.__fill.style.background = s.color
      }
      syncClasses()
    }

    ui.bind(el, sig, function () {
      paintBar()
      syncHandles()
    })

    bar.addEventListener('click', function (e) {
      const r = bar.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      const data = sig.peek()
      // Sample neighbor colors for a pleasant initial color.
      const sorted = sortedStops(data)
      let color = '#888888'
      for (let i = 0; i < sorted.length - 1; i++) {
        if (p >= sorted[i].pos && p <= sorted[i + 1].pos) {
          const t = (p - sorted[i].pos) / Math.max(1e-6, sorted[i + 1].pos - sorted[i].pos)
          color = mixHex(sorted[i].color, sorted[i + 1].color, t)
          break
        }
      }
      const stops = data.stops.slice()
      stops.push({ pos: p, color: color })
      selectedIdx = stops.length - 1
      doWrite({ stops: stops })
    })
    rail.addEventListener('click', function (e) { e.stopPropagation() })

    function removeStop(idx) {
      const data = sig.peek()
      if (data.stops.length <= 2) return
      const stops = data.stops.slice()
      stops.splice(idx, 1)
      if (selectedIdx >= stops.length) selectedIdx = stops.length - 1
      doWrite({ stops: stops })
    }

    // ── Color editor row ─────────────────────────────────────────
    const colorSig = aeditor.signal(sig.peek().stops[selectedIdx].color)

    // Parent → local: when the selected stop's color changes externally or
    // the selection moves, pull the active color into colorSig.
    let lastKey = ''
    ui.collect(el, aeditor.effect(function () {
      const data = sig()
      const i = Math.min(selectedIdx, data.stops.length - 1)
      const s = data.stops[i]
      const key = i + ':' + s.color
      if (key !== lastKey) {
        lastKey = key
        if (colorSig.peek() !== s.color) colorSig.set(s.color)
      }
    }))
    // Local → parent: editing colorSig writes back to the selected stop.
    ui.collect(el, aeditor.effect(function () {
      const c = colorSig()
      const data = sig.peek()
      const s = data.stops[selectedIdx]
      if (s && s.color !== c) {
        const stops = data.stops.slice()
        stops[selectedIdx] = { pos: s.pos, color: c }
        doWrite({ stops: stops })
      }
    }))

    const editorRow = ui.h('div', 'aeditor-ui-gradient-editor')
    const colorEditor = ui.colorInput({ value: colorSig })
    editorRow.appendChild(colorEditor)
    ui.collect(el, function () { ui.dispose(colorEditor) })
    const delBtn = ui.h('button', 'aeditor-ui-gradient-delete', {
      type: 'button', text: '✕', title: 'Delete stop (double-click a stop)',
    })
    delBtn.addEventListener('click', function () { removeStop(selectedIdx) })
    editorRow.appendChild(delBtn)
    el.appendChild(editorRow)

    return el
  }

  // Linear RGB mix between two 6-digit hex colors.
  function mixHex(a, b, t) {
    const pa = parseHex(a), pb = parseHex(b)
    if (!pa || !pb) return a
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
    return '#' + hex2(r) + hex2(g) + hex2(bl)
  }
  function parseHex(s) {
    if (!s) return null
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
    if (!m) return null
    let h = m[1]
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  function hex2(n) { return ('0' + Math.max(0, Math.min(255, n)).toString(16)).slice(-2) }
})(window.aeditor = window.aeditor || {})
