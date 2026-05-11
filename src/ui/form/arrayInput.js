// aeditor.ui.arrayInput — generic list editor.
//
// Renders one row per element; each row = [index · editor · remove]. The
// default element editor is a text input (so `arrayInput({ value: tagsSig })`
// just works for a string list), but callers supply an `editor` factory for
// anything else. No type_config coupling.
//
// opts:
//   value:         signal<any[]>                                    required
//   editor?:       (slotSig, write, ctx, idx) => HTMLElement        default: ui.input
//   defaultValue?: () => any                                         default: () => ''
//   onChange?:     (nextArr) => void                                 default: writes into `value`
//   ctx?:          any                                               forwarded to editor()
//
// Length reconcile is incremental (push / pop only). Value changes at an
// unchanged index propagate through the per-slot `fieldSig = derived(() =>
// value()[idx])` — the row DOM, its editor, pointer captures, and in-flight
// edits are all preserved across pure value updates.
//
// Index is the only key. If an external mutation removes a middle element
// the tail rows see their `fieldSig` shift (row[i] now reads what was at
// i+1). This is the natural array semantics; callers that need stable row
// identity should store structs with their own id field.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.arrayInput = function (opts) {
    const o = opts || {}
    if (!ui.isSignal(o.value)) throw new Error('ui.arrayInput: `value` must be a signal')
    const value        = o.value
    const editorFactory = typeof o.editor === 'function'
      ? o.editor
      : function (sig, write) { return ui.input({ value: sig, onChange: write }) }
    const seed         = typeof o.defaultValue === 'function' ? o.defaultValue : function () { return '' }
    const onChange     = typeof o.onChange === 'function' ? o.onChange : null
    const ctx          = o.ctx

    const root = ui.h('div', 'aeditor-ui-array-input')
    const list = ui.h('div', 'aeditor-ui-array-input-rows')
    root.appendChild(list)

    const addBtn = ui.button({
      text: 'Add', kind: 'default', size: 'sm',
      onClick: function () {
        const cur = value.peek() || []
        const next = cur.concat([seed()])
        if (onChange) onChange(next)
        else value.set(next)
      },
    })
    addBtn.classList.add('aeditor-ui-array-input-add')
    root.appendChild(addBtn)

    // One row runtime per array slot; index is stable for its lifetime.
    const rows = []

    function buildRow(idx) {
      const row   = ui.h('div', 'aeditor-ui-array-input-row')
      const label = ui.h('span', 'aeditor-ui-array-input-index', { text: '[' + idx + ']' })
      const cell  = ui.h('div', 'aeditor-ui-array-input-cell')

      const fieldSig = aeditor.derived(function () {
        const cur = value()
        return Array.isArray(cur) ? cur[idx] : undefined
      })

      const writeSlot = function (nv) {
        const cur = Array.isArray(value.peek()) ? value.peek() : []
        if (cur[idx] === nv) return
        const next = cur.slice(); next[idx] = nv
        if (onChange) onChange(next)
        else value.set(next)
      }

      const editor = editorFactory(fieldSig, writeSlot, ctx, idx)
      cell.appendChild(editor)

      const del = ui.iconButton({
        icon: 'x', title: 'Remove', size: 'sm',
        onClick: function () {
          const cur = Array.isArray(value.peek()) ? value.peek() : []
          const next = cur.slice(); next.splice(idx, 1)
          if (onChange) onChange(next)
          else value.set(next)
        },
      })

      row.appendChild(label); row.appendChild(cell); row.appendChild(del)
      return { el: row, fieldSig: fieldSig, editor: editor }
    }

    function disposeRow(r) {
      r.fieldSig.dispose()
      ui.dispose(r.editor)
      if (r.el.parentNode) r.el.parentNode.removeChild(r.el)
    }

    ui.bind(root, value, function (v) {
      const len = Array.isArray(v) ? v.length : 0
      while (rows.length > len) disposeRow(rows.pop())
      while (rows.length < len) {
        const r = buildRow(rows.length)
        rows.push(r)
        list.appendChild(r.el)
      }
    })

    ui.collect(root, function () { while (rows.length) disposeRow(rows.pop()) })

    return root
  }
})(window.aeditor = window.aeditor || {})
