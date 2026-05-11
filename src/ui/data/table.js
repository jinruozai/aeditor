// aeditor.ui.table — virtualized fixed-row table with column headers.
//
// opts:
//   rows      : signal<object[]>
//   columns   : [{ key, label, width?, render?(value, row) }]
//   rowHeight?: number  default 24
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.table = function (opts) {
    const o = opts || {}
    const rows = ui.asSig(o.rows != null ? o.rows : [])
    const cols = o.columns || []
    const rowH = o.rowHeight || 24

    const el = ui.h('div', 'aeditor-ui-table')
    const head = ui.h('div', 'aeditor-ui-table-head')
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const h = ui.h('div', 'aeditor-ui-table-th', { text: c.label || c.key })
      if (c.width) h.style.width = (typeof c.width === 'number' ? c.width + 'px' : c.width)
      else h.style.flex = '1 1 0'
      head.appendChild(h)
    }
    el.appendChild(head)

    const body = ui.list({
      items: rows,
      rowHeight: rowH,
      render: function (row) {
        const r = ui.h('div', 'aeditor-ui-table-row')
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i]
          const cell = ui.h('div', 'aeditor-ui-table-td')
          if (c.width) cell.style.width = (typeof c.width === 'number' ? c.width + 'px' : c.width)
          else cell.style.flex = '1 1 0'
          const v = row[c.key]
          if (c.render) {
            const out = c.render(v, row)
            if (out instanceof HTMLElement) cell.appendChild(out)
            else cell.textContent = out == null ? '' : String(out)
          } else {
            cell.textContent = v == null ? '' : String(v)
          }
          r.appendChild(cell)
        }
        return r
      },
    })
    body.classList.add('aeditor-ui-table-body')
    el.appendChild(body)
    return el
  }
})(window.aeditor = window.aeditor || {})
