// demo component: property-panel
//
// Right-dock panel. Subscribes to Demo.selected; when the id changes, grabs
// the cached instance via Demo.getInstance(id) and builds an editable
// property list from the instance's `edit` map.
//
// The edit map values come in two shapes:
//   • plain signal<primitive>            → control picked via typeof sig.peek()
//   • { signal, options: [{value,label}] } → always ui.segmented
//
// Drift-proof: the signal objects in the edit map are the SAME references the
// component was constructed with, so editing here flows straight back into
// the live component without any intermediate binding layer.
;(function (EF) {
  'use strict'
  const ui = EF.ui

  function buildControl(spec) {
    // Enum form: { signal, options }
    if (spec && spec.signal && spec.options) {
      // For long option lists (>6), a select is nicer than segmented.
      if (spec.options.length > 6) {
        return ui.select({ value: spec.signal, options: spec.options })
      }
      return ui.segmented({ value: spec.signal, options: spec.options })
    }
    // Plain signal — look at current value to pick a control.
    const sig = spec
    const v = sig.peek()
    if (typeof v === 'boolean') {
      return ui['switch']({ value: sig })
    }
    if (typeof v === 'number') {
      return ui.numberInput({ value: sig, step: 1 })
    }
    // Default: text input.
    return ui.input({ value: sig })
  }

  function buildHeader(entry) {
    const head = ui.h('div', 'demo-prop-head')
    head.appendChild(ui.h('div', 'demo-prop-name',  { text: entry.name }))
    head.appendChild(ui.h('div', 'demo-prop-id',    { text: 'EF.ui.' + entry.id }))
    // Category chip — use ui.tag instead of a hand-rolled .demo-prop-cat div.
    const tagRow = ui.h('div', 'demo-prop-tags')
    tagRow.appendChild(ui.tag({ text: entry.category }))
    head.appendChild(tagRow)
    if (entry.description) {
      head.appendChild(ui.h('div', 'demo-prop-desc', { text: entry.description }))
    }
    return head
  }

  function labelFor(key) {
    // Convert camelCase → spaced title.
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) { return c.toUpperCase() })
  }

  EF.registerComponent('property-panel', {
    category: 'panel',
    label: 'Properties',
    icon: 'settings',
    defaults: function () { return { title: 'Properties', icon: '⚙' } },
    factory: function (propsSig, ctx) { const props = propsSig.peek() || {};
      const root = ui.h('div', 'demo-prop')

      const empty = ui.h('div', 'demo-prop-empty', {
        text: 'Select a component from the tree, search, or showcase to edit its props.',
      })

      const hostHead = ui.h('div', 'demo-prop-host-head')
      const hostBody = ui.h('div', 'demo-prop-host-body')
      const host = ui.h('div', 'demo-prop-host')
      host.appendChild(hostHead)
      host.appendChild(hostBody)
      const scroll = ui.scrollArea({ children: host })

      root.appendChild(empty)
      root.appendChild(scroll)

      // Dispose every child (runs their cleanups) then clear.
      function disposeChildren(el) {
        while (el.firstChild) {
          const c = el.firstChild
          ui.dispose(c)    // detaches from parent too
        }
      }

      ctx.onCleanup(EF.effect(function () {
        const id = Demo.selected()
        disposeChildren(hostHead)
        disposeChildren(hostBody)
        if (!id) {
          empty.style.display = ''
          scroll.style.display = 'none'
          return
        }
        const entry = Demo.byId(id)
        if (!entry) {
          empty.style.display = ''
          scroll.style.display = 'none'
          return
        }
        empty.style.display = 'none'
        scroll.style.display = ''

        hostHead.appendChild(buildHeader(entry))

        const edit = Demo.editFor(id)
        const keys = Object.keys(edit || {})
        if (keys.length === 0) {
          hostBody.appendChild(ui.h('div', 'demo-prop-empty', {
            text: 'This component has no editable props.',
          }))
          return
        }
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]
          const spec = edit[k]
          const ctrl = buildControl(spec)
          const row = ui.propRow({ label: labelFor(k), control: ctrl })
          if (EF.ai && EF.ai.attach && Demo.aiTargets) {
            EF.ai.attach(row.querySelector('.ef-ui-prop-label'), function () { return Demo.aiTargets.property(entry, k, spec) }, { contextMenu: true })
          }
          hostBody.appendChild(row)
        }
      }))

      return root
    },
  })
})(window.EF = window.EF || {})
