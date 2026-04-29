// Dock runtime — LayoutRuntime / DockRuntime / ComponentRuntime lifecycle.
//
// This file owns:
//   • per-panel ComponentRuntime objects (lazy contentEl, ctx, cleanups)
//   • per-dock static toolbar ComponentRuntime objects (eager materialization)
//   • per-panel dynamic toolbar ComponentRuntime objects (lazy, follow active)
//   • activate-panel detach/re-attach against a dock's content container
//   • dynamic-toolbar attach/detach across active-panel changes
//   • activation counter (lastActivatedAt) for "new active after close" + LRU
//   • LRU dispose when layout.lruMax > 0
//   • dock classlist sync (focused / collapsed)
//
// It does NOT touch DOM tree structure (that's render.js) and does NOT bind
// drag events (interactions.js).
;(function (EF) {
  'use strict'

  const signal = EF.signal

  // ── LayoutRuntime ─────────────────────────────────────
  function createLayoutRuntime(container, treeSig, opts) {
    const layout = {
      container:         container,
      treeSig:           treeSig,
      dockRuntimes:      new Map(),
      activationCounter: 0,
      lruMax:            (opts && opts.lru && opts.lru.max != null) ? opts.lru.max : -1,
      hooks:             (opts && opts.hooks) || {},
      broadcastChannel:  null,
    }

    layout.setTree = function (t) { treeSig.set(t) }

    layout.markActivation = function (panelId) {
      const dr = findPanelRuntime(layout, panelId)
      if (!dr) return
      dr.lastActivatedAt = ++layout.activationCounter
    }

    layout.activatePanel = function (panelId) {
      layout.setTree(EF.activatePanel(treeSig.peek(), panelId))
      layout.markActivation(panelId)
      maybeEvictLRU(layout)
    }

    layout.removePanel = function (panelId) {
      const dr = findOwningDockRuntime(layout, panelId)
      const pr = dr && dr.panelRuntimes.get(panelId)
      layout.setTree(EF.removePanel(treeSig.peek(), panelId))
      if (pr) {
        disposePanelRuntime(pr)
        dr.panelRuntimes.delete(panelId)
      }
    }

    // Single authoritative mutation path for adding panels. Every caller
    // (ctx.dock.addPanel, the public LayoutHandle, migrate.js) funnels
    // through here, so markActivation + maybeEvictLRU are never skipped.
    layout.addPanel = function (dockId, partial, opts) {
      const r = EF.addPanel(treeSig.peek(), dockId, partial, opts)
      layout.setTree(r.tree)
      layout.markActivation(r.panelId)
      maybeEvictLRU(layout)
      return r.panelId
    }

    // Cross-dock move — runtime-level. Same invariant as addPanel: all
    // callers (handle, interactions.js panel drag, etc.) route here so
    // markActivation is never forgotten. No LRU eviction: move doesn't
    // create new runtimes, only re-homes existing ones.
    layout.movePanel = function (panelId, dstDockId, dstIndex) {
      layout.setTree(EF.movePanel(treeSig.peek(), panelId, dstDockId, dstIndex))
      layout.markActivation(panelId)
    }

    // Preview → permanent promotion. Pure tree rewrite, no runtime impact.
    layout.promotePanel = function (panelId) {
      layout.setTree(EF.promotePanel(treeSig.peek(), panelId))
    }

    return layout
  }

  // ── DockRuntime ───────────────────────────────────────
  function createDockRuntime(dockData, dockEl, contentEl, layout, toolbarParts) {
    const runtime = {
      id:                    dockData.id,
      dataSig:               signal(dockData),
      dockEl:                dockEl,
      contentEl:             contentEl,
      toolbarEl:             (toolbarParts && toolbarParts.toolbarEl)      || null,
      toolbarStartEl:        (toolbarParts && toolbarParts.toolbarStartEl) || null,
      toolbarEndEl:          (toolbarParts && toolbarParts.toolbarEndEl)   || null,
      panelRuntimes:         new Map(),
      staticToolbarRuntimes: [],
    }
    return runtime
  }

  function updateDockRuntime(dockRuntime, dockData) {
    dockRuntime.dataSig.set(dockData)
    // Refresh runtime.data / dockRef for every existing PanelRuntime whose
    // PanelData is still in this dock. Panels that left this dock will be
    // re-homed by render.js when it visits their new dock.
    for (let i = 0; i < dockData.panels.length; i++) {
      const pd = dockData.panels[i]
      const pr = dockRuntime.panelRuntimes.get(pd.id)
      if (pr) {
        pr.data.set(pd)
        pr.dockRef.set(dockRuntime.id)
      }
    }
  }

  function disposeDockRuntime(dockRuntime) {
    dockRuntime.panelRuntimes.forEach(disposePanelRuntime)
    dockRuntime.panelRuntimes.clear()
    for (let i = 0; i < dockRuntime.staticToolbarRuntimes.length; i++) {
      disposeComponentRuntime(dockRuntime.staticToolbarRuntimes[i])
    }
    dockRuntime.staticToolbarRuntimes.length = 0
  }

  // Visual class sync — focused / collapsed live as classes on .ef-dock so
  // CSS handles all visuals (no JS layout math).
  function syncDockClasses(dockRuntime, dockData) {
    const cl = dockRuntime.dockEl.classList
    cl.toggle('ef-dock-focused',   !!dockData.focused)
    cl.toggle('ef-dock-collapsed', !!dockData.collapsed)
  }

  // ── Static toolbar runtime construction ───────────────
  // Eager materialization: static items live for the entire dock lifetime,
  // so we build their contentEls immediately and append into the toolbar.
  function createStaticToolbarRuntimes(dockRuntime, dockData, layout) {
    if (!dockData.toolbar || !dockData.toolbar.items) return
    const items = dockData.toolbar.items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const sr = {
        kind:     'toolbar-static',
        component:   item.component,
        align:    item.align || 'start',
        contentEl:null,
        cleanups: [],
        active:   signal(true),
        dockRef:  signal(dockRuntime.id), // fixed: static items don't migrate
        props:    item.props || {},
      }
      sr.ctx = EF._dock.makeContext(sr, layout)
      materializeComponentEl(sr, { dockId: dockRuntime.id })
      mountToolbarItem(sr, dockRuntime)
      dockRuntime.staticToolbarRuntimes.push(sr)
    }
  }

  function mountToolbarItem(itemRuntime, dockRuntime) {
    if (!dockRuntime.toolbarEl) return
    const slot = itemRuntime.align === 'end'
      ? dockRuntime.toolbarEndEl
      : dockRuntime.toolbarStartEl
    if (itemRuntime.contentEl && itemRuntime.contentEl.parentNode !== slot) {
      slot.appendChild(itemRuntime.contentEl)
    }
  }

  // ── PanelRuntime ──────────────────────────────────────
  function getOrCreatePanelRuntime(dockRuntime, panelData, layout) {
    let pr = dockRuntime.panelRuntimes.get(panelData.id)
    if (pr) {
      pr.data.set(panelData)
      pr.dockRef.set(dockRuntime.id)
      return pr
    }
    // Cross-dock migration: a panel that lived in another dock and just
    // moved here. Reuse its runtime (and contentEl, dynamic toolbar items,
    // ctx, cleanups, all of it) — that's the whole point of § 4.3.
    const oldOwner = findOwningDockRuntime(layout, panelData.id)
    if (oldOwner && oldOwner !== dockRuntime) {
      pr = oldOwner.panelRuntimes.get(panelData.id)
      oldOwner.panelRuntimes.delete(panelData.id)
      // Detach dynamic toolbar items from the old dock's toolbar (they'll be
      // re-attached to the new dock's toolbar inside syncActivePanel).
      detachDynamicToolbar(pr)
      pr.data.set(panelData)
      pr.dockRef.set(dockRuntime.id)
      dockRuntime.panelRuntimes.set(panelData.id, pr)
      return pr
    }
    pr = {
      kind:                   'panel',
      component:                 panelData.component,
      panelId:                panelData.id,
      contentEl:              null,
      ctx:                    null,
      cleanups:               [],
      active:                 signal(false),
      data:                   signal(panelData),
      dockRef:                signal(dockRuntime.id),
      dynamicToolbarRuntimes: [],
      lastActivatedAt:        0,
      _layout:                layout,
    }
    pr.ctx = EF._dock.makeContext(pr, layout)

    // Build dynamic toolbar runtimes from PanelData.toolbarItems. They share
    // the panel's data + dockRef signals so cross-dock moves propagate.
    if (panelData.toolbarItems && panelData.toolbarItems.length > 0) {
      for (let i = 0; i < panelData.toolbarItems.length; i++) {
        const item = panelData.toolbarItems[i]
        const tr = {
          kind:     'toolbar-dynamic',
          component:   item.component,
          align:    item.align || 'start',
          panelId:  pr.panelId,
          contentEl:null,
          cleanups: [],
          active:   signal(false),
          data:     pr.data,    // shared with parent panel
          dockRef:  pr.dockRef, // shared with parent panel
          props:    item.props || {},
        }
        tr.ctx = EF._dock.makeContext(tr, layout)
        pr.dynamicToolbarRuntimes.push(tr)
      }
    }

    dockRuntime.panelRuntimes.set(panelData.id, pr)
    return pr
  }

  // Mount the active panel into the dock's content container.
  // Detached DOM strategy (§ 4.3): non-active panels' contentEls are removed
  // from the DOM but kept alive in panelRuntimes. Switching just moves the
  // existing reference; components are never recreated.
  function syncActivePanel(dockRuntime, dockData, layout) {
    const targetId = dockData.activeId
    const content  = dockRuntime.contentEl

    // Detach whatever's currently in content if it doesn't match the target.
    const cur = content.firstChild
    if (cur) {
      const curId = cur.dataset && cur.dataset.panelId
      if (curId !== targetId) {
        const oldPr = dockRuntime.panelRuntimes.get(curId)
        cur.remove()
        if (oldPr) {
          oldPr.active.set(false)
          detachDynamicToolbar(oldPr)
        }
      }
    }

    if (!targetId) return

    const pd = dockData.panels.find(function (p) { return p.id === targetId })
    if (!pd) return
    const pr = getOrCreatePanelRuntime(dockRuntime, pd, layout)

    if (!pr.contentEl) {
      materializeComponentEl(pr, { panelId: pd.id, dockId: dockRuntime.id })
      pr.contentEl.dataset.panelId = pd.id
      pr.contentEl.classList.add('ef-panel')
    }

    if (pr.contentEl.parentNode !== content) {
      content.appendChild(pr.contentEl)
    }
    pr.active.set(true)

    attachDynamicToolbar(pr, dockRuntime)

    if (pr.lastActivatedAt === 0) {
      pr.lastActivatedAt = ++layout.activationCounter
    }
  }

  function attachDynamicToolbar(panelRuntime, dockRuntime) {
    if (!dockRuntime.toolbarEl) return
    const items = panelRuntime.dynamicToolbarRuntimes
    for (let i = 0; i < items.length; i++) {
      const tr = items[i]
      if (!tr.contentEl) {
        materializeComponentEl(tr, { panelId: tr.panelId })
        tr.contentEl.classList.add('ef-toolbar-item')
      }
      const slot = tr.align === 'end'
        ? dockRuntime.toolbarEndEl
        : dockRuntime.toolbarStartEl
      if (tr.contentEl.parentNode !== slot) slot.appendChild(tr.contentEl)
      tr.active.set(true)
    }
  }

  function detachDynamicToolbar(panelRuntime) {
    const items = panelRuntime.dynamicToolbarRuntimes
    for (let i = 0; i < items.length; i++) {
      const tr = items[i]
      if (tr.contentEl) tr.contentEl.remove()
      tr.active.set(false)
    }
  }

  // Generic component materialization — used by panel, static toolbar, and
  // dynamic toolbar runtimes. Wraps spec.factory in safeCall so a buggy component
  // produces a visible error stub instead of breaking the framework.
  //
  // The entire create() runs inside EF.untracked — reconcile invokes this
  // from within its own effect, and we don't want incidental ctx.* signal
  // reads (e.g. `ctx.panel.title()` for a guard check, or `ctx.dock.panels()`
  // in a toolbar tab component) to leak into the reconcile effect's dep set.
  // Any real reactivity must go through EF.effect explicitly inside the
  // component body, which establishes its own effect scope.
  function materializeComponentEl(runtime, srcExtra) {
    const spec = EF.resolveComponent(runtime.component)
    const src = Object.assign({ scope: 'component', component: runtime.component }, srcExtra || {})
    // propsSig source per kind:
    //   panel runtimes track props live via ctx.panel.props (derived off
    //     runtime.data) — pass that signal directly so components that subscribe
    //     to props get reactivity for free.
    //   toolbar (static / dynamic) runtimes get a frozen signal seeded from
    //     the static spec.props — those don't change after registration.
    const propsSig = (runtime.kind === 'panel')
      ? runtime.ctx.panel.props
      : EF.signal(runtime.props || {})
    runtime.propsSig = propsSig
    const el = EF.safeCall(src, function () {
      return EF.untracked(function () {
        return spec.factory(propsSig, runtime.ctx)
      })
    })
    runtime.contentEl = el || makeErrorEl(runtime.component)
  }

  function disposeComponentRuntime(runtime) {
    for (let i = 0; i < runtime.cleanups.length; i++) {
      try { runtime.cleanups[i]() } catch (e) { console.error(e) }
    }
    runtime.cleanups = []
    if (runtime.contentEl) {
      const spec = EF.resolveComponent(runtime.component)
      if (spec.dispose) {
        EF.safeCall({ scope: 'component', component: runtime.component },
          function () { spec.dispose(runtime.contentEl) })
      }
      runtime.contentEl.remove()
      runtime.contentEl = null
    }
    if (runtime.active) runtime.active.set(false)
  }

  function disposePanelRuntime(pr) {
    // Dispose the panel's own component...
    disposeComponentRuntime(pr)
    // ...and every dynamic toolbar component it contributed.
    for (let i = 0; i < pr.dynamicToolbarRuntimes.length; i++) {
      disposeComponentRuntime(pr.dynamicToolbarRuntimes[i])
    }
    pr.dynamicToolbarRuntimes.length = 0
  }

  function findPanelRuntime(layout, panelId) {
    let hit = null
    layout.dockRuntimes.forEach(function (dr) {
      if (hit) return
      const pr = dr.panelRuntimes.get(panelId)
      if (pr) hit = pr
    })
    return hit
  }

  function findOwningDockRuntime(layout, panelId) {
    let hit = null
    layout.dockRuntimes.forEach(function (dr) {
      if (hit) return
      if (dr.panelRuntimes.has(panelId)) hit = dr
    })
    return hit
  }

  function maybeEvictLRU(layout) {
    if (layout.lruMax < 0) return
    const candidates = []
    let total = 0
    layout.dockRuntimes.forEach(function (dr) {
      const activeId = dr.dataSig.peek().activeId
      dr.panelRuntimes.forEach(function (pr) {
        if (!pr.contentEl) return
        total++
        if (pr.panelId === activeId) return
        if (pr.data.peek().dirty) return
        candidates.push(pr)
      })
    })
    if (total <= layout.lruMax) return
    candidates.sort(function (a, b) { return a.lastActivatedAt - b.lastActivatedAt })
    let toEvict = total - layout.lruMax
    for (let i = 0; i < candidates.length && toEvict > 0; i++) {
      const pr = candidates[i]
      const dr = findOwningDockRuntime(layout, pr.panelId)
      disposePanelRuntime(pr)
      if (dr) dr.panelRuntimes.delete(pr.panelId)
      toEvict--
    }
  }

  function makeErrorEl(componentName) {
    const el = document.createElement('div')
    el.className = 'ef-panel-error'
    el.textContent = 'Failed to create component: ' + componentName
    return el
  }

  EF._dock = EF._dock || {}
  EF._dock.createLayoutRuntime         = createLayoutRuntime
  EF._dock.createDockRuntime           = createDockRuntime
  EF._dock.updateDockRuntime           = updateDockRuntime
  EF._dock.disposeDockRuntime          = disposeDockRuntime
  EF._dock.createStaticToolbarRuntimes = createStaticToolbarRuntimes
  EF._dock.syncActivePanel             = syncActivePanel
  EF._dock.syncDockClasses             = syncDockClasses
  EF._dock.disposePanelRuntime         = disposePanelRuntime
  EF._dock.findPanelRuntime            = findPanelRuntime
})(window.EF = window.EF || {})
