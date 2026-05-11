// aeditor.ui.tabPanel — tab strip + content pane composite.
//
// This is the in-panel "paged view" primitive. It's built on top of
// aeditor.ui.tab (for the strip) and owns a body element that swaps which
// pane is currently mounted as the active tab changes.
//
// Panes are **caller-owned HTML elements** passed in via `panes: { id → el }`.
// Switching detach/re-attaches them (same rule as dock panels — § 4.3) so
// their DOM state (inputs, scroll, canvas) survives across switches.
//
// opts:
//   items    : signal<[{ id, title?, icon?, dirty?, transient?, badge? }]>
//   active   : signal<string|null>
//   panes    : { [id]: HTMLElement }          caller-owned, pre-created
//   variant  : 'bar' | 'compact' | 'sidebar'   (forwarded to ui.tab)
//   direction: 'horizontal' | 'vertical'        — 'vertical' = strip on the side
//   closable / addable / minShowCount           (forwarded to ui.tab)
//   onActivate / onClose / onAdd / onReorder    (forwarded to ui.tab)
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.tabPanel = function (opts) {
    const o = opts || {}
    const itemsSig  = ui.asSig(o.items  != null ? o.items  : [])
    const activeSig = ui.asSig(o.active != null ? o.active : null)
    const panes = o.panes || {}

    const layoutDir = o.direction === 'vertical' ? 'vertical' : 'horizontal'
    const root = ui.h('div', 'aeditor-ui-tabpanel aeditor-ui-tabpanel-' + layoutDir)

    // Strip is a regular aeditor.ui.tab — we let it own its own subscriptions.
    // For sidebar variant, default layout to 'vertical' so the strip lives
    // on the left. Caller can still override via direction.
    const stripVariant = o.variant || 'bar'
    if (o.direction == null && stripVariant === 'sidebar') {
      root.classList.remove('aeditor-ui-tabpanel-horizontal')
      root.classList.add('aeditor-ui-tabpanel-vertical')
    }

    const strip = ui.tab({
      items:        itemsSig,
      active:       activeSig,
      variant:      stripVariant,
      direction:    o.stripDirection,      // optional direct override
      closable:     o.closable,
      addable:      o.addable,
      minShowCount: o.minShowCount,
      onActivate:   o.onActivate,
      onReactivate: o.onReactivate,
      onClose:      o.onClose,
      onAdd:        o.onAdd,
      onDragStart:  o.onDragStart,
    })

    const body = ui.h('div', 'aeditor-ui-tabpanel-body')

    root.appendChild(strip)
    root.appendChild(body)

    // Active pane reconciliation — detach old, attach new. We read both
    // items and active on each tick so the pane stays in sync with its
    // (possibly reordered) tab.
    let mounted = null
    ui.collect(root, aeditor.effect(function () {
      const active = activeSig()
      if (active === mounted) return
      // detach previous (preserves its DOM state because we don't recreate)
      if (mounted && panes[mounted] && panes[mounted].parentNode === body) {
        body.removeChild(panes[mounted])
      }
      mounted = active
      if (active && panes[active]) body.appendChild(panes[active])
    }))

    // Expose the strip for advanced use (e.g. access its data-tab-id DOM).
    root.stripEl = strip
    root.bodyEl  = body
    return root
  }
})(window.aeditor = window.aeditor || {})
