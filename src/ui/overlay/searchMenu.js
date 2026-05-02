// EF.ui.searchMenu — popover menu with a search field.
//
// opts:
//   anchor: HTMLElement
//   pos?: { x, y }              // optional zero-size viewport anchor
//   items:  [{ label, value?, icon?, group?, onSelect? }]
//   placeholder?: string
//   side?, align?, width?, maxHeight?
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.searchMenu = function (opts) {
    const o = opts || {}
    let pop = null
    const root = ui.h('div', 'ef-ui-search-menu')
    const query = EF.signal('')
    const input = ui.searchInput({
      value: query,
      placeholder: o.placeholder || 'Search...',
      onChange: function () { active = 0; paint() },
    })
    input.classList.add('ef-ui-search-menu-input')
    const list = ui.h('div', 'ef-ui-menu ef-ui-search-menu-list')
    root.appendChild(input)
    root.appendChild(list)

    const items = (o.items || []).slice()
    let active = 0

    function close() { if (pop) { pop.close(); pop = null } }
    function filtered() {
      const q = String(query.peek() || '').trim().toLowerCase()
      if (!q) return items
      return items.filter(function (it) {
        return String(it.label || it.value || '').toLowerCase().indexOf(q) >= 0
          || String(it.group || '').toLowerCase().indexOf(q) >= 0
      })
    }
    function paint() {
      list.innerHTML = ''
      const rows = filtered()
      if (active >= rows.length) active = rows.length - 1
      if (active < 0) active = 0
      if (!rows.length) {
        list.appendChild(ui.h('div', 'ef-ui-menu-empty', { text: 'No matches' }))
        return
      }
      let lastGroup = null
      rows.forEach(function (it, idx) {
        if (it.group && it.group !== lastGroup) {
          lastGroup = it.group
          list.appendChild(ui.h('div', 'ef-ui-menu-header', { text: it.group }))
        }
        const row = ui.h('button', 'ef-ui-menu-item' + (idx === active ? ' ef-ui-menu-item-active' : ''), { type: 'button' })
        if (it.icon) row.appendChild(ui.icon({ name: it.icon, size: 'sm' }))
        row.appendChild(ui.h('span', 'ef-ui-menu-item-label', { text: it.label != null ? it.label : String(it.value) }))
        row.addEventListener('mouseenter', function () { active = idx; paintActive() })
        row.addEventListener('click', function () { choose(it) })
        list.appendChild(row)
      })
    }
    function paintActive() {
      const rows = Array.from(list.querySelectorAll('.ef-ui-menu-item'))
      rows.forEach(function (row, idx) { row.classList.toggle('ef-ui-menu-item-active', idx === active) })
      if (rows[active]) rows[active].scrollIntoView({ block: 'nearest' })
    }
    function choose(it) {
      if (it.onSelect) it.onSelect(it.value, it)
      close()
    }

    input.addEventListener('keydown', function (ev) {
      const rows = filtered()
      if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(rows.length - 1, active + 1); paintActive(); return }
      if (ev.key === 'ArrowUp')   { ev.preventDefault(); active = Math.max(0, active - 1); paintActive(); return }
      if (ev.key === 'Enter')     { ev.preventDefault(); if (rows[active]) choose(rows[active]); return }
      if (ev.key === 'Escape')    { ev.preventDefault(); close(); return }
    })

    let anchor = o.anchor
    let tempAnchor = null
    if (!anchor && o.pos) {
      tempAnchor = ui.h('div', null, {
        style: 'position:fixed;width:0;height:0;left:' + (o.pos.x || 0) + 'px;top:' + (o.pos.y || 0) + 'px;pointer-events:none;',
      })
      document.body.appendChild(tempAnchor)
      anchor = tempAnchor
    }
    function disposeAnchor() {
      if (tempAnchor && tempAnchor.parentNode) tempAnchor.parentNode.removeChild(tempAnchor)
      tempAnchor = null
    }
    const r = anchor.getBoundingClientRect()
    root.style.width = (o.width || Math.max(260, Math.min(420, r.width || 0))) + 'px'
    list.style.maxHeight = (o.maxHeight || 360) + 'px'
    paint()
    pop = ui.popover({
      anchor: anchor,
      content: root,
      side: o.side || 'bottom',
      align: o.align || 'start',
      role: 'menu',
      onDismiss: function () { disposeAnchor(); pop = null },
    })
    setTimeout(function () {
      const inner = input.querySelector('input')
      if (inner) { inner.focus(); inner.select() }
    }, 0)
    return pop
  }
})(window.EF = window.EF || {})
