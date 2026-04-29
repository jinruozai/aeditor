// ComponentContext factory — the only handle a component gets into the framework.
//
// Three kinds of ComponentRuntime share this factory; the only difference is
// which fields ctx exposes (§ 4.9 ctx surface):
//
//   kind='panel'           → ctx.dock + ctx.panel; dock follows runtime.dockRef
//   kind='toolbar-static'  → ctx.dock only (no ctx.panel); dock is fixed
//   kind='toolbar-dynamic' → ctx.dock + ctx.panel; dock follows owning panel
//
// The runtime layer (dock/runtime.js) is responsible for setting up
// runtime.data / runtime.dockRef / runtime.active before calling makeContext.
// This file is pure glue — it never touches DOM and never decides lifetimes.
;(function (EF) {
  'use strict'

  const signal  = EF.signal
  const derived = EF.derived

  function makeContext(runtime, layout) {
    const ctx = {}

    // Private back-reference so widgets that need framework-level operations
    // (e.g. tab component calling beginPanelDrag) can reach the layout runtime.
    // Underscore-prefixed → not part of the public ComponentContext surface.
    ctx._layout = layout

    // ── shared (all kinds) ─────────────────────────────
    ctx.active = runtime.active

    ctx.onCleanup = function (fn) { runtime.cleanups.push(fn) }

    ctx.safeCall = function (fn) { return EF.safeCall(runtimeSource(runtime), fn) }

    // Auto-unsubscribing bus. The disposer returned by `on()` is the single
    // canonical way to unsubscribe — it's idempotent and self-splices from
    // `runtime.cleanups`, so manual early-unsubscribe leaves no stale entry.
    // Panel dispose flushes anything still in cleanups. Components that need the
    // raw `off(topic, handler)` surface can use EF.bus.off directly.
    ctx.bus = {
      on: function (topic, handler) {
        const rawOff = EF.bus.on(topic, handler)
        let done = false
        const dispose = function () {
          if (done) return
          done = true
          rawOff()
          const i = runtime.cleanups.indexOf(dispose)
          if (i >= 0) runtime.cleanups.splice(i, 1)
        }
        runtime.cleanups.push(dispose)
        return dispose
      },
      emit: EF.bus.emit,
    }

    ctx.dock = makeDockCtx(runtime, layout)

    if (runtime.kind === 'panel' || runtime.kind === 'toolbar-dynamic') {
      ctx.panel = makePanelCtx(runtime, layout)
    }

    return ctx
  }

  // dockRef resolution per kind:
  //   panel / toolbar-dynamic → runtime.dockRef (panel's current dock signal)
  //   toolbar-static          → fixed signal seeded with the owning dock id
  function makeDockCtx(runtime, layout) {
    const dockIdSig = runtime.dockRef // runtime layer sets this for all kinds
    const treeSig = layout.treeSig

    function lookupDock() {
      const id = dockIdSig()
      const found = EF.findDock(treeSig(), id)
      return found ? found.node : null
    }

    return {
      id:          derived(function () { return dockIdSig() }),
      panels:      derived(function () { const d = lookupDock(); return d ? d.panels   : [] }),
      activeId:    derived(function () { const d = lookupDock(); return d ? d.activeId : null }),
      collapsed:   derived(function () { const d = lookupDock(); return d ? !!d.collapsed : false }),
      focused:     derived(function () { const d = lookupDock(); return d ? !!d.focused   : false }),
      // Pure topology check — false when the dock has no toolbar, is root,
      // or its parent split direction doesn't match the collapse axis. The
      // collapsed bit in tree is a user-intent flag; this signal tells you
      // whether render.js will actually honor it at the current position.
      canCollapse: derived(function () { return EF.canCollapseDock(treeSig(), dockIdSig()) }),

      activatePanel: function (id) { layout.activatePanel(id) },
      removePanel:   function (id) { layout.removePanel(id) },
      // Return shape matches the public LayoutHandle (§ 4.9 Layer 1):
      // `{ panelId }`, never a bare string. One operation, one shape.
      addPanel:      function (partial) { return { panelId: layout.addPanel(dockIdSig(), partial) } },
      toggleFocus:   function () {
        const d = lookupDock()
        layout.setTree(EF.setFocused(treeSig.peek(), dockIdSig(), !(d && d.focused)))
      },
      setFocus:     function (b) { layout.setTree(EF.setFocused(treeSig.peek(), dockIdSig(), !!b)) },
      setCollapsed: function (b) { layout.setTree(EF.setCollapsed(treeSig.peek(), dockIdSig(), !!b)) },
    }
  }

  function makePanelCtx(runtime, layout) {
    const data = runtime.data        // signal<PanelData>, owned by panel runtime
    const panelId = runtime.panelId  // immutable for the lifetime of the runtime

    function patch(fields) {
      layout.setTree(EF.updatePanel(layout.treeSig.peek(), panelId, fields))
    }

    return {
      id:    panelId,
      title: derived(function () { return data().title || data().component }),
      icon:  derived(function () { return data().icon || '' }),
      dirty: derived(function () { return !!data().dirty }),
      badge: derived(function () { return data().badge || null }),
      props: derived(function () { return data().props || {} }),

      setTitle: function (s) { patch({ title: s }) },
      setIcon:  function (s) { patch({ icon: s }) },
      setDirty: function (b) { patch({ dirty: !!b }) },
      setBadge: function (s) { patch({ badge: s }) },
      updateProps: function (p) {
        const cur = data().props || {}
        patch({ props: Object.assign({}, cur, p) })
      },

      promote: function () { layout.promotePanel(panelId) },
      close:   function () { layout.removePanel(panelId) },
      popOut:  function () {
        if (EF._dock.popOutPanel) EF._dock.popOutPanel(panelId, layout)
      },
    }
  }

  function runtimeSource(runtime) {
    const src = { scope: 'component', component: runtime.component }
    if (runtime.kind === 'panel' || runtime.kind === 'toolbar-dynamic') {
      src.panelId = runtime.panelId
    }
    if (runtime.dockRef) src.dockId = runtime.dockRef.peek()
    return src
  }

  EF._dock = EF._dock || {}
  EF._dock.makeContext = makeContext
})(window.EF = window.EF || {})
