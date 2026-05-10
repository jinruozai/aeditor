// createDockLayout — public entry. Builds a LayoutRuntime, drives one
// reconcile effect, and exposes the LayoutHandle described in § 4.9 Layer 1.
//
// This is the only file in dock/ that touches the public EF surface.
;(function (EF) {
  'use strict'

  const signal = EF.signal
  const effect = EF.effect
  const RT     = EF._dock

  let _globalListenersInstalled = false

  function installGlobalErrorListeners() {
    if (_globalListenersInstalled) return
    _globalListenersInstalled = true
    window.addEventListener('error', function (e) {
      EF.reportError({ scope: 'global' }, e.error || new Error(e.message))
    })
    window.addEventListener('unhandledrejection', function (e) {
      EF.reportError({ scope: 'global' }, e.reason || new Error('unhandledrejection'))
    })
  }

  function createDockLayout(container, config) {
    config = config || {}
    if (!config.tree) throw new Error('createDockLayout: config.tree is required')

    installGlobalErrorListeners()
    container.classList.add('ef-root')

    const tree   = signal(config.tree)
    const layout = RT.createLayoutRuntime(container, tree, {
      lru:   config.lru,
      hooks: config.hooks,
    })

    const stopReconcile = effect(function () {
      const t = tree()
      if (!layout.disposed) RT.reconcile(layout, t)
    })
    layout.cleanups.push(stopReconcile)

    // Phase 6 — popup mode handshake. No-op in regular windows.
    if (RT.bindMigrationReceiver) RT.bindMigrationReceiver(layout)

    // ── LayoutHandle ───────────────────────────────────
    const handle = {
      tree:      function ()  { return tree.peek() },
      setTree:   function (t) { layout.setTree(t) },
      subscribe: function (fn) { return effect(function () { fn(tree()) }) },

      addPanel: function (dockId, partial, opts) {
        const id = resolveDockId(tree.peek(), dockId)
        return { panelId: id ? layout.addPanel(id, partial, opts) : null }
      },
      addPanelToSplit: function (dockId, dir, side, ratio, partial) {
        const id = resolveDockId(tree.peek(), dockId)
        return id ? layout.addPanelToSplit(id, dir, side, ratio, partial) : { newDockId: null, newPanelId: null }
      },
      removePanel:   function (panelId)                      { layout.removePanel(panelId) },
      activatePanel: function (panelId)                      { layout.activatePanel(panelId) },
      promotePanel:  function (panelId)                      { layout.promotePanel(panelId) },
      movePanel:     function (panelId, dstDockId, dstIndex) { layout.movePanel(panelId, dstDockId, dstIndex) },
      inspectPanel:  function (panelId)                      { return RT.inspectPanel(layout, panelId) },
      inspectPanels: function ()                             { return RT.inspectPanels(layout) },

      splitDock: function (dockId, dir, side, ratio, opts) {
        if (layout.disposed) return { newDockId: null, newPanelId: null }
        // § 4.1 — seed new dock from active panel component defaults.
        const seed = computeSplitSeed(tree.peek(), dockId)
        const r = EF.splitDock(tree.peek(), dockId, dir, side, ratio, { seedPanels: seed })
        layout.setTree(r.tree)
        return { newDockId: r.newDockId, newPanelId: r.newPanelId }
      },

      mergeDocks: function (winnerId, loserId) {
        if (layout.disposed) return false
        const r = EF.mergeDocks(tree.peek(), winnerId, loserId)
        if (r.discardedPanels.some(function (p) { return p.dirty })) {
          const hook = layout.hooks.onDirtyDiscard
          const choice = hook ? hook(r.discardedPanels) : 'cancel'
          if (choice !== 'discard') return false
        }
        layout.setTree(r.tree)
        return true
      },

      // Toggle a dock's collapsed state by id OR name. Accepts the config
      // `name` (assigned via EF.dock({ name: 'log' })) as a sugar — the
      // names are more stable across layouts than framework-generated ids.
      setDockCollapsed: function (idOrName, bool) {
        if (layout.disposed) return false
        const id = resolveDockId(tree.peek(), idOrName)
        if (!id) return false
        layout.setTree(EF.setCollapsed(tree.peek(), id, !!bool))
        return true
      },

      destroy: function () {
        RT.disposeLayoutRuntime(layout)
      },
    }

    // Expose the runtime on the handle for interactions.js (private use).
    handle._runtime = layout
    if (EF.extensions && EF.extensions.registerLayout) {
      layout.cleanups.push(EF.extensions.registerLayout(config.name || 'default', handle))
    }
    return handle
  }

  // Walk the tree for a dock whose id OR config-time name matches.
  // The framework assigns opaque ids (dock-1, dock-2…); callers that
  // need stable external references pass `name` at dock creation and
  // pass the same string here. Returns the resolved id or null.
  function resolveDockId(tree, idOrName) {
    if (!idOrName) return null
    let hit = null
    function walk(n) {
      if (!n || hit) return
      if (n.type === 'dock') {
        if (n.id === idOrName || n.name === idOrName) { hit = n.id; return }
      } else if (n.children) {
        for (let i = 0; i < n.children.length; i++) walk(n.children[i])
      }
    }
    walk(tree)
    return hit
  }

  // Compute seedPanels for a split — § 4.1: same component as source's active
  // panel + that component's defaults. Empty source dock → empty new dock.
  function computeSplitSeed(tree, srcDockId) {
    const f = EF.findDock(tree, srcDockId)
    if (!f || !f.node.activeId) return null
    const active = f.node.panels.find(function (p) { return p.id === f.node.activeId })
    if (!active) return null
    const defaults = EF.componentDefaults(active.component)
    return [Object.assign({}, defaults, { component: active.component })]
  }

  EF.createDockLayout = createDockLayout
  EF._dock = EF._dock || {}
  EF._dock.computeSplitSeed = computeSplitSeed
})(window.EF = window.EF || {})
