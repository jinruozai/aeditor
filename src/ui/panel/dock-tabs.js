// Dock-tabs — the framework-side thin shell around EF.ui.tab.
//
// Zero visual code. Zero DOM construction. Its entire job is:
//   1. Pick an EF.ui.tab variant from preset defaults
//   2. Wire ctx.dock.panels → items, ctx.dock.activeId → active
//   3. Forward click / close / add / drag callbacks to ctx.dock.*
//   4. Tag the root with `.ef-dock-tabs` so interactions.js can hit-test it
//
// Registered presets (§ 4.6 — one implementation, four configurations):
//   tab-standard    closeable + addable                    (editor)
//   tab-compact     no close, hides when < 2 panels        (properties)
//   tab-collapsible closeable + click-active collapses     (utility)
//   tab-sidebar     icon-only vertical + collapsible       (left/right rail)
//
// A preset's `props` can override any of the hard-coded defaults on a
// per-toolbar-item basis — that's how a caller could, e.g., use the
// sidebar preset but force text mode with `props: { iconOnly: false }`.
;(function (EF) {
  'use strict'

  function buildDockTabs(p, ctx) {
    const el = EF.ui.tab({
      items:        ctx.dock.panels,     // derived signal<PanelData[]>
      active:       ctx.dock.activeId,   // derived signal<string|null>
      variant:      p.variant  || 'bar',
      direction:    p.direction,
      iconOnly:     p.iconOnly,
      closable:     p.closable != null ? p.closable : true,
      addable:      !!p.addable,
      minShowCount: p.minShowCount || 0,

      onActivate: function (id) {
        ctx.dock.activatePanel(id)
        if (p.collapsible && ctx.dock.canCollapse()) ctx.dock.setCollapsed(false)
      },
      onReactivate: function () {
        if (p.collapsible && ctx.dock.canCollapse()) {
          ctx.dock.setCollapsed(!ctx.dock.collapsed())
        }
      },
      onClose: function (id) {
        ctx.dock.removePanel(id)
      },
      onAdd: function () {
        const panels = ctx.dock.panels()
        const curId  = ctx.dock.activeId()
        const active = panels.find(function (pp) { return pp.id === curId })
        if (!active) return
        const defaults = EF.componentDefaults(active.component)
        ctx.dock.addPanel(Object.assign({}, defaults, { component: active.component }))
      },
      onDragStart: function (ev, panelId) {
        const fn = EF._dock && EF._dock.beginPanelDrag
        if (fn) fn(ev, panelId, ctx.dock.id(), ctx._layout)
      },
    })
    el.classList.add('ef-dock-tabs')
    return el
  }

  // Preset-bound factory — props are static for the lifetime of the toolbar
  // item, so .peek() once at construction is sufficient.
  function preset(defaults) {
    return function (propsSig, ctx) {
      return buildDockTabs(Object.assign({}, defaults, propsSig.peek() || {}), ctx)
    }
  }

  EF.registerComponent('tab-standard', {
    defaults: function () { return { title: 'Tabs' } },
    factory:  preset({ variant: 'bar', closable: true, addable: true }),
  })

  EF.registerComponent('tab-compact', {
    defaults: function () { return { title: 'Tabs' } },
    factory:  preset({ variant: 'compact', closable: false, minShowCount: 2 }),
  })

  EF.registerComponent('tab-collapsible', {
    defaults: function () { return { title: 'Tabs' } },
    factory:  preset({ variant: 'bar', closable: true, collapsible: true }),
  })

  EF.registerComponent('tab-sidebar', {
    defaults: function () { return { title: 'Tabs' } },
    factory:  preset({
      variant:     'sidebar',
      iconOnly:    true,
      direction:   'vertical',
      closable:    false,
      collapsible: true,
    }),
  })
})(window.EF = window.EF || {})
