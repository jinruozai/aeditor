// demo widget: component-tree
//
// Left-sidebar panel listing every catalog entry, grouped by category. The
// widget is a simple flat scrollable list with section headers — not a
// real tree — because:
//   1. The catalog is tiny (45 entries) so collapse/expand is UX debt
//   2. Users want to click any component without first expanding a group
//   3. Plain rows make it trivial to bind the active-id highlight
//
// Clicking a row calls Demo.select(id), which opens/activates the matching
// showcase panel in the center dock and sets Demo.selected so the property
// inspector follows. The currently-selected row gets a highlight via an
// effect subscribed to Demo.selected.
;(function (EF) {
  'use strict'
  const ui = EF.ui

  EF.registerComponent('component-tree', {
    defaults: function () { return { title: 'Components', icon: '☰' } },
    factory: function (propsSig, ctx) { const props = propsSig.peek() || {};
      const root = ui.h('div', 'demo-sidepanel')
      const scroll = ui.scrollArea()
      scroll.classList.add('demo-tree-scroll')
      root.appendChild(scroll)

      // One DOM pass — build a section per category, one row per entry.
      const rows = []   // { id, el }
      for (let i = 0; i < Demo.categories.length; i++) {
        const cat = Demo.categories[i]
        const list = Demo.byCategory(cat.id)
        if (list.length === 0) continue

        const head = ui.h('div', 'demo-tree-section', {
          text: cat.icon + '  ' + cat.label + '  (' + list.length + ')',
        })
        scroll.appendChild(head)

        for (let j = 0; j < list.length; j++) {
          const entry = list[j]
          const row = ui.h('div', 'demo-tree-row', { text: entry.name })
          row.setAttribute('data-demo-row', entry.id)
          row.title = entry.description || entry.name
          // Single click → preview (transient tab). Double click → pin
          // (promote to permanent). The dblclick handler runs AFTER two
          // click events, so the preview tab is already open; promote it.
          row.addEventListener('click', (function (id) {
            return function () { Demo.select(id, { preview: true }) }
          })(entry.id))
          row.addEventListener('dblclick', (function (id) {
            return function () { Demo.select(id, { preview: false }) }
          })(entry.id))
          scroll.appendChild(row)
          rows.push({ id: entry.id, el: row })
        }
      }

      // Highlight the currently selected row.
      ctx.onCleanup(EF.effect(function () {
        const sel = Demo.selected()
        for (let i = 0; i < rows.length; i++) {
          rows[i].el.classList.toggle('demo-tree-row-active', rows[i].id === sel)
        }
      }))

      return root
    },
  })
})(window.EF = window.EF || {})
