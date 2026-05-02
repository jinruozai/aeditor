// EF.ui.list — virtualized fixed-row list with multi-select.
//
// opts:
//   items     : signal<any[]>            row data (signal so updates auto-render)
//   rowHeight : number                   pixels per row
//   render    : (item, index) => HTMLElement       row factory (called on demand)
//   selected? : signal<any[]>            always an array; length≤1 in single-select
//   onSelect? : (selected[]) => void     write path; required if selected is read-only
//   multi?    : boolean                  default true; false collapses ctrl/shift to plain
//   onActivate?:(item, index) => void    double-click handler
//
// Click semantics (when multi is true):
//   plain click          → [item]                  ; sets shift-anchor to this index
//   ctrl/cmd-click       → toggle item in current  ; sets shift-anchor to this index
//   shift-click          → range from anchor → idx ; anchor unchanged
// When multi is false, modifiers fall through to plain click.
//
// Selection identity is by reference (===). Callers with positional duplicates
// or recreated rows should map to stable values upstream.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.list = function (opts) {
    const o = opts || {}
    const items = ui.asSig(o.items != null ? o.items : [])
    const rowH = o.rowHeight || 22
    const render = o.render || function (it) { return ui.h('div', null, { text: String(it) }) }
    const selected = o.selected
    const multi    = o.multi !== false
    const writeSelected = selected ? ui.writer(selected, o.onSelect, 'ui.list') : null
    let anchor = -1

    const el = ui.h('div', 'ef-ui-list ef-ui-scrollarea')
    const spacer = ui.h('div', 'ef-ui-list-spacer')
    const win = ui.h('div', 'ef-ui-list-window')
    el.appendChild(spacer)
    spacer.appendChild(win)

    const cache = new Map()  // index → element

    function discardRow(row) {
      ui.dispose(row)
    }

    function selectedSet() {
      if (!selected) return null
      return new Set(selected.peek() || [])
    }

    function commit(arr, newAnchor) {
      if (writeSelected) writeSelected(arr)
      if (newAnchor != null) anchor = newAnchor
    }

    function handleClick(ev, item, idx) {
      if (!writeSelected) return
      const arr = items.peek()
      const cur = selected.peek() || []

      if (multi && ev.shiftKey && anchor >= 0) {
        const lo = Math.min(anchor, idx), hi = Math.max(anchor, idx)
        commit(arr.slice(lo, hi + 1))
        return
      }
      if (multi && (ev.metaKey || ev.ctrlKey)) {
        const at = cur.indexOf(item)
        const next = at >= 0 ? cur.slice(0, at).concat(cur.slice(at + 1)) : cur.concat([item])
        commit(next, idx)
        return
      }
      commit([item], idx)
    }

    function paint() {
      const arr = items.peek()
      spacer.style.height = (arr.length * rowH) + 'px'
      const top = el.scrollTop
      const h = el.clientHeight || 200
      const start = Math.max(0, Math.floor(top / rowH) - 4)
      const end   = Math.min(arr.length, Math.ceil((top + h) / rowH) + 4)
      win.style.transform = 'translateY(' + (start * rowH) + 'px)'

      const want = new Set()
      for (let i = start; i < end; i++) want.add(i)
      cache.forEach(function (row, key) {
        if (!want.has(key)) { discardRow(row); cache.delete(key) }
      })
      const sel = selectedSet()
      for (let i = start; i < end; i++) {
        if (!cache.has(i)) {
          const row = render(arr[i], i)
          row.style.height = rowH + 'px'
          row.classList.add('ef-ui-list-row')
          row.dataset.idx = i
          if (sel && sel.has(arr[i])) row.classList.add('ef-ui-list-row-active')
          row.addEventListener('mousedown', function (ev) { handleClick(ev, arr[i], i) })
          if (o.onActivate) row.addEventListener('dblclick', function () { o.onActivate(arr[i], i) })
          cache.set(i, row)
          win.appendChild(row)
        }
      }
    }
    el.addEventListener('scroll', paint, { passive: true })
    ui.collect(el, function () {
      cache.forEach(discardRow)
      cache.clear()
    })
    ui.bind(el, items, function () {
      cache.forEach(discardRow)
      cache.clear(); paint()
    })
    if (selected) ui.bind(el, selected, function () {
      const arr = items.peek()
      const sel = selectedSet()
      cache.forEach(function (row, i) { row.classList.toggle('ef-ui-list-row-active', sel.has(arr[i])) })
    })
    requestAnimationFrame(paint)
    return el
  }
})(window.EF = window.EF || {})
