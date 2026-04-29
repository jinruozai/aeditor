// demo component: component-search
//
// Left-sidebar panel: a text input + filtered ui.list over the catalog.
// Clicking a row calls Demo.select(id), same entry point as the tree.
;(function (EF) {
  'use strict'
  const ui = EF.ui

  EF.registerComponent('component-search', {
    defaults: function () { return { title: 'Search', icon: '⌕' } },
    factory: function (propsSig, ctx) { const props = propsSig.peek() || {};
      const root = ui.h('div', 'demo-sidepanel demo-search')

      const query = EF.signal('')
      const inp = ui.input({ value: query, placeholder: 'Search components…' })
      inp.classList.add('demo-search-input')
      root.appendChild(inp)

      // Derived filtered entries — reacts to both catalog (static) and query.
      const filtered = EF.derived(function () {
        const q = (query() || '').trim().toLowerCase()
        const all = Demo.catalog
        if (!q) return all.slice()
        const out = []
        for (let i = 0; i < all.length; i++) {
          const e = all[i]
          if (
            e.id.indexOf(q) !== -1 ||
            e.name.toLowerCase().indexOf(q) !== -1 ||
            (e.description && e.description.toLowerCase().indexOf(q) !== -1) ||
            e.category.indexOf(q) !== -1
          ) {
            out.push(e)
          }
        }
        return out
      })

      // Bridge Demo.selected (scalar id) to ui.list's array-of-entries selected.
      const selectedArr = EF.derived(function () {
        const id = Demo.selected()
        const e  = id ? Demo.catalog.find(function (c) { return c.id === id }) : null
        return e ? [e] : []
      })
      const list = ui.list({
        items: filtered,
        rowHeight: 36,
        multi: false,
        selected: selectedArr,
        // VSCode-style: single click = preview (transient), double click = pin.
        onSelect:   function (arr) { if (arr[0]) Demo.select(arr[0].id, { preview: true }) },
        onActivate: function (entry) { Demo.select(entry.id, { preview: false }) },
        render: function (entry) {
          const row = ui.h('div', 'demo-search-row')
          row.appendChild(ui.h('div', 'demo-search-row-name', { text: entry.name }))
          row.appendChild(ui.h('div', 'demo-search-row-cat', { text: entry.category + ' · ' + entry.id }))
          return row
        },
      })
      list.classList.add('demo-search-list')
      root.appendChild(list)
      return root
    },
  })
})(window.EF = window.EF || {})
