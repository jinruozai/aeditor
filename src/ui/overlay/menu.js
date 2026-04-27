// EF.ui.menu — context / dropdown menu.
//
// This is just a normal UI widget; the framework does NOT bind global menu
// hotkeys or right-click handlers. Callers wire it up: pointerdown / Ctrl+K /
// button click → call EF.ui.menu({ ... }) to open it.
//
// opts:
//   anchor   : HTMLElement                    required (popover anchor)
//   items    : MenuItem[]
//                MenuItem = { label, icon?, kbd?, onSelect?, disabled?, danger? }
//                         | { type: 'divider' }
//                         | { type: 'header', label }
//                         | { label, items: MenuItem[] }    nested submenu
//   side?, align?
//
// Returns a popover handle.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  // Build a menu element. The returned element carries a `closeSubs()` method
  // that shuts every open submenu beneath it — both `ui.menu` (for the root)
  // and sibling-row mouseenter (for focus semantics) call it, so a menu is
  // never left with stray children floating in portal-root.
  function buildMenu(items, onSelect) {
    const list = ui.h('div', 'ef-ui-menu')
    const openSubs = []  // { row, pop }
    function closeSubs() {
      while (openSubs.length) openSubs.pop().pop.close()
    }
    list.closeSubs = closeSubs

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.type === 'divider') {
        list.appendChild(ui.h('div', 'ef-ui-menu-divider'))
        continue
      }
      if (it.type === 'header') {
        list.appendChild(ui.h('div', 'ef-ui-menu-header', { text: it.label }))
        continue
      }
      const row = ui.h('button', 'ef-ui-menu-item' +
        (it.disabled ? ' ef-ui-menu-item-disabled' : '') +
        (it.danger ? ' ef-ui-menu-item-danger' : ''),
        { type: 'button' })
      // ui.icon resolves `name` against the registered icon set (rendering
      // an SVG); unknown names fall back to text. Passing the consumer's
      // string as `name` keeps "icon: 'copy'" working as a real icon.
      if (it.icon) row.appendChild(ui.icon({ name: it.icon, size: 'sm' }))
      row.appendChild(ui.h('span', 'ef-ui-menu-item-label', { text: it.label || '' }))
      if (it.kbd) {
        const k = ui.kbd(it.kbd); k.classList.add('ef-ui-menu-item-kbd'); row.appendChild(k)
      }

      if (it.items && it.items.length) {
        row.appendChild(ui.h('span', 'ef-ui-menu-item-sub', { text: '▸' }))
        row.addEventListener('mouseenter', function () {
          // One open submenu per parent menu — moving to a sibling row closes
          // the previous branch. Matches native desktop menu behavior.
          if (openSubs.length && openSubs[openSubs.length - 1].row === row) return
          closeSubs()
          const subList = buildMenu(it.items, onSelect)
          const pop = ui.popover({
            anchor: row, content: subList, side: 'right', align: 'start',
            onDismiss: function () {
              subList.closeSubs()
              const idx = openSubs.findIndex(function (s) { return s.row === row })
              if (idx >= 0) openSubs.splice(idx, 1)
            },
          })
          openSubs.push({ row: row, pop: pop })
        })
      } else {
        row.addEventListener('click', function () {
          if (it.disabled) return
          if (it.onSelect) it.onSelect()
          onSelect && onSelect()
        })
      }
      list.appendChild(row)
    }
    return list
  }

  ui.menu = function (opts) {
    const o = opts || {}
    let pop = null
    function closeAll() { if (pop) { pop.close(); pop = null } }
    const list = buildMenu(o.items || [], closeAll)
    pop = ui.popover({
      anchor:  o.anchor,
      content: list,
      side:    o.side  || 'bottom',
      align:   o.align || 'start',
      role:    'menu',
      // Outside-click / ESC / explicit close all route through here → walk
      // the open-submenu chain and dismiss top-down. Without this, a portal
      // sub-popover survives its parent and becomes an orphan overlay.
      onDismiss: function () { list.closeSubs() },
    })
    return pop
  }
})(window.EF = window.EF || {})
