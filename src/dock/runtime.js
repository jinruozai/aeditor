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
;(function (aeditor) {
  'use strict'

  const signal = aeditor.signal

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
      cleanups:          [],
      disposed:          false,
    }

    layout.setTree = function (t) {
      if (layout.disposed) return
      treeSig.set(t)
    }

    layout.markActivation = function (panelId) {
      const dr = findPanelRuntime(layout, panelId)
      if (!dr) return
      dr.lastActivatedAt = ++layout.activationCounter
    }

    layout.activatePanel = function (panelId) {
      if (layout.disposed) return
      layout.setTree(aeditor.activatePanel(treeSig.peek(), panelId))
      layout.markActivation(panelId)
      maybeEvictLRU(layout)
    }

    layout.removePanel = function (panelId) {
      if (layout.disposed) return
      const dr = findOwningDockRuntime(layout, panelId)
      const pr = dr && dr.panelRuntimes.get(panelId)
      layout.setTree(aeditor.removePanel(treeSig.peek(), panelId))
      if (pr) {
        disposePanelRuntime(pr)
        dr.panelRuntimes.delete(panelId)
      }
    }

    // Single authoritative mutation path for adding panels. Every caller
    // (ctx.dock.addPanel, the public LayoutHandle, migrate.js) funnels
    // through here, so markActivation + maybeEvictLRU are never skipped.
    layout.addPanel = function (dockId, partial, opts) {
      if (layout.disposed) return null
      const r = aeditor.addPanel(treeSig.peek(), dockId, partial, opts)
      layout.setTree(r.tree)
      layout.markActivation(r.panelId)
      maybeEvictLRU(layout)
      return r.panelId
    }

    layout.addPanelToSplit = function (dockId, direction, side, ratio, partial) {
      if (layout.disposed) return { newDockId: null, newPanelId: null }
      const r = aeditor.splitDock(treeSig.peek(), dockId, direction, side, ratio, { seedPanels: [partial] })
      layout.setTree(r.tree)
      layout.markActivation(r.newPanelId)
      maybeEvictLRU(layout)
      return { newDockId: r.newDockId, newPanelId: r.newPanelId }
    }

    // Cross-dock move — runtime-level. Same invariant as addPanel: all
    // callers (handle, interactions.js panel drag, etc.) route here so
    // markActivation is never forgotten. No LRU eviction: move doesn't
    // create new runtimes, only re-homes existing ones.
    layout.movePanel = function (panelId, dstDockId, dstIndex) {
      if (layout.disposed) return
      layout.setTree(aeditor.movePanel(treeSig.peek(), panelId, dstDockId, dstIndex))
      layout.markActivation(panelId)
    }

    layout.movePanelToSplit = function (panelId, dstDockId, direction, side, ratio) {
      if (layout.disposed) return
      const r = aeditor.movePanelToSplit(treeSig.peek(), panelId, dstDockId, direction, side, ratio)
      layout.setTree(r.tree)
      layout.markActivation(panelId)
    }

    // Preview → permanent promotion. Pure tree rewrite, no runtime impact.
    layout.promotePanel = function (panelId) {
      if (layout.disposed) return
      layout.setTree(aeditor.promotePanel(treeSig.peek(), panelId))
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
      toolbarObserver:       null,
      toolbarKey:            toolbarKey(dockData.toolbar),
      panelRuntimes:         new Map(),
      staticToolbarRuntimes: [],
    }
    initToolbarVisibility(runtime)
    return runtime
  }

  function updateDockRuntime(dockRuntime, dockData, layout) {
    dockRuntime.dataSig.set(dockData)
    syncDockToolbar(dockRuntime, dockData, layout)
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

  function disposeLayoutRuntime(layout) {
    if (layout.disposed) return
    layout.disposed = true
    while (layout.cleanups.length) {
      const fn = layout.cleanups.pop()
      try { fn() } catch (e) { console.error(e) }
    }
    layout.dockRuntimes.forEach(disposeDockRuntime)
    layout.dockRuntimes.clear()
    layout.container.replaceChildren()
    layout.container.classList.remove('aeditor-root')
  }

  function disposeDockRuntime(dockRuntime) {
    dockRuntime.panelRuntimes.forEach(disposePanelRuntime)
    dockRuntime.panelRuntimes.clear()
    disposeStaticToolbarRuntimes(dockRuntime)
    disposeToolbarObserver(dockRuntime)
  }

  function disposeStaticToolbarRuntimes(dockRuntime) {
    for (let i = 0; i < dockRuntime.staticToolbarRuntimes.length; i++) {
      disposeComponentRuntime(dockRuntime.staticToolbarRuntimes[i])
    }
    dockRuntime.staticToolbarRuntimes.length = 0
  }

  function disposeToolbarObserver(dockRuntime) {
    if (dockRuntime.toolbarObserver) {
      dockRuntime.toolbarObserver.disconnect()
      dockRuntime.toolbarObserver = null
    }
  }

  function disposeStalePanelRuntimes(dockRuntime, dockData) {
    const live = new Set()
    for (let i = 0; i < dockData.panels.length; i++) live.add(dockData.panels[i].id)
    const stale = []
    dockRuntime.panelRuntimes.forEach(function (_, id) {
      if (!live.has(id)) stale.push(id)
    })
    for (let i = 0; i < stale.length; i++) {
      const pr = dockRuntime.panelRuntimes.get(stale[i])
      disposePanelRuntime(pr)
      dockRuntime.panelRuntimes.delete(stale[i])
    }
  }

  // Visual class sync — focused / collapsed live as classes on .aeditor-dock so
  // CSS handles all visuals (no JS layout math).
  function syncDockClasses(dockRuntime, dockData) {
    const cl = dockRuntime.dockEl.classList
    cl.toggle('aeditor-dock-focused',   !!dockData.focused)
    cl.toggle('aeditor-dock-collapsed', !!dockData.collapsed)
  }

  function toolbarKey(toolbar) {
    if (!toolbar) return ''
    return JSON.stringify({
      direction: toolbar.direction || 'top',
      items: (toolbar.items || []).map(function (it) {
        return {
          component: it.component,
          align: it.align || 'start',
          props: it.props || {},
        }
      }),
    })
  }

  function syncDockToolbar(dockRuntime, dockData, layout) {
    const nextKey = toolbarKey(dockData.toolbar)
    if (dockRuntime.toolbarKey === nextKey) return
    disposeStaticToolbarRuntimes(dockRuntime)
    disposeToolbarObserver(dockRuntime)
    if (dockRuntime.toolbarEl) dockRuntime.toolbarEl.remove()
    dockRuntime.toolbarEl = null
    dockRuntime.toolbarStartEl = null
    dockRuntime.toolbarEndEl = null

    const cl = dockRuntime.dockEl.classList
    cl.remove('aeditor-dock-with-toolbar', 'aeditor-dock-toolbar-top', 'aeditor-dock-toolbar-bottom', 'aeditor-dock-toolbar-left', 'aeditor-dock-toolbar-right', 'aeditor-dock-toolbar-empty')
    if (dockData.toolbar) {
      const dir = dockData.toolbar.direction || 'top'
      const toolbarEl = document.createElement('div')
      toolbarEl.className = 'aeditor-toolbar aeditor-toolbar-' + dir
      const start = document.createElement('div')
      start.className = 'aeditor-toolbar-start'
      const end = document.createElement('div')
      end.className = 'aeditor-toolbar-end'
      toolbarEl.appendChild(start)
      toolbarEl.appendChild(end)
      dockRuntime.dockEl.insertBefore(toolbarEl, dockRuntime.contentEl)
      dockRuntime.toolbarEl = toolbarEl
      dockRuntime.toolbarStartEl = start
      dockRuntime.toolbarEndEl = end
      cl.add('aeditor-dock-with-toolbar', 'aeditor-dock-toolbar-' + dir)
      initToolbarVisibility(dockRuntime)
      createStaticToolbarRuntimes(dockRuntime, dockData, layout)
    }
    dockRuntime.toolbarKey = nextKey
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
        kind:      'toolbar-static',
        component: item.component,
        align:     item.align || 'start',
        contentEl: null,
        cleanups:  [],
        active:    signal(true),
        dockRef:   signal(dockRuntime.id), // fixed: static items don't migrate
        props:     item.props || {},
        error:     null,
      }
      sr.ctx = aeditor._dock.makeContext(sr, layout)
      materializeComponentEl(sr, { dockId: dockRuntime.id })
      mountToolbarItem(sr, dockRuntime)
      dockRuntime.staticToolbarRuntimes.push(sr)
    }
    syncToolbarVisibility(dockRuntime)
  }

  function mountToolbarItem(itemRuntime, dockRuntime) {
    if (!dockRuntime.toolbarEl) return
    const slot = itemRuntime.align === 'end'
      ? dockRuntime.toolbarEndEl
      : dockRuntime.toolbarStartEl
    if (itemRuntime.contentEl && itemRuntime.contentEl.parentNode !== slot) {
      slot.appendChild(itemRuntime.contentEl)
    }
    syncToolbarVisibility(dockRuntime)
  }

  function initToolbarVisibility(dockRuntime) {
    if (!dockRuntime.toolbarEl) return
    const sync = function () { syncToolbarVisibility(dockRuntime) }
    const mo = new MutationObserver(sync)
    mo.observe(dockRuntime.toolbarEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class'],
    })
    dockRuntime.toolbarObserver = mo
    sync()
  }

  function syncToolbarVisibility(dockRuntime) {
    if (!dockRuntime.toolbarEl) return
    const visible = hasVisibleToolbarChild(dockRuntime.toolbarStartEl) ||
      hasVisibleToolbarChild(dockRuntime.toolbarEndEl)
    if (dockRuntime.toolbarEl.hidden === visible) dockRuntime.toolbarEl.hidden = !visible
    dockRuntime.dockEl.classList.toggle('aeditor-dock-toolbar-empty', !visible)
  }

  function hasVisibleToolbarChild(slot) {
    if (!slot) return false
    for (let n = slot.firstElementChild; n; n = n.nextElementSibling) {
      if (isVisibleToolbarNode(n)) return true
    }
    return false
  }

  function isVisibleToolbarNode(el) {
    if (el.hidden) return false
    if (el.style && el.style.display === 'none') return false
    if (el.classList.contains('aeditor-toolbar-item') && el.children.length === 1) {
      return isVisibleToolbarNode(el.firstElementChild)
    }
    return true
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
      error:                  null,
      _layout:                layout,
    }
    pr.ctx = aeditor._dock.makeContext(pr, layout)

    // Build dynamic toolbar runtimes from PanelData.toolbarItems. They share
    // the panel's data + dockRef signals so cross-dock moves propagate.
    if (panelData.toolbarItems && panelData.toolbarItems.length > 0) {
      for (let i = 0; i < panelData.toolbarItems.length; i++) {
        const item = panelData.toolbarItems[i]
        const tr = {
          kind:      'toolbar-dynamic',
          component: item.component,
          align:     item.align || 'start',
          panelId:   pr.panelId,
          contentEl: null,
          cleanups:  [],
          active:    signal(false),
          data:      pr.data,    // shared with parent panel
          dockRef:   pr.dockRef, // shared with parent panel
          props:     item.props || {},
          error:     null,
        }
        tr.ctx = aeditor._dock.makeContext(tr, layout)
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
      pr.contentEl.classList.add('aeditor-panel')
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
        tr.contentEl.classList.add('aeditor-toolbar-item')
      }
      const slot = tr.align === 'end'
        ? dockRuntime.toolbarEndEl
        : dockRuntime.toolbarStartEl
      if (tr.contentEl.parentNode !== slot) slot.appendChild(tr.contentEl)
      tr.active.set(true)
    }
    syncToolbarVisibility(dockRuntime)
  }

  function detachDynamicToolbar(panelRuntime) {
    const items = panelRuntime.dynamicToolbarRuntimes
    let dockRuntime = null
    for (let i = 0; i < items.length; i++) {
      const tr = items[i]
      if (!dockRuntime && tr.contentEl && tr.contentEl.parentNode) {
        const dockEl = tr.contentEl.closest('.aeditor-dock')
        const dockId = dockEl && dockEl.dataset && dockEl.dataset.dockId
        if (dockId && panelRuntime._layout) {
          dockRuntime = panelRuntime._layout.dockRuntimes.get(dockId)
        }
      }
      if (tr.contentEl) tr.contentEl.remove()
      tr.active.set(false)
    }
    if (dockRuntime) syncToolbarVisibility(dockRuntime)
  }

  // Generic component materialization — used by panel, static toolbar, and
  // dynamic toolbar runtimes. Wraps spec.factory in safeCall so a buggy component
  // produces a visible error stub instead of breaking the framework.
  //
  // The entire create() runs inside aeditor.untracked — reconcile invokes this
  // from within its own effect, and we don't want incidental ctx.* signal
  // reads (e.g. `ctx.panel.title()` for a guard check, or `ctx.dock.panels()`
  // in a toolbar tab component) to leak into the reconcile effect's dep set.
  // Any real reactivity must go through aeditor.effect explicitly inside the
  // component body, which establishes its own effect scope.
  function materializeComponentEl(runtime, srcExtra) {
    const spec = aeditor.resolveComponent(runtime.component)
    const src = Object.assign({ scope: 'component', component: runtime.component }, srcExtra || {})
    // propsSig source per kind:
    //   panel runtimes track props live via ctx.panel.props (derived off
    //     runtime.data) — pass that signal directly so components that subscribe
    //     to props get reactivity for free.
    //   toolbar (static / dynamic) runtimes get a frozen signal seeded from
    //     the static spec.props — those don't change after registration.
    const propsSig = (runtime.kind === 'panel')
      ? runtime.ctx.panel.props
      : aeditor.signal(runtime.props || {})
    runtime.propsSig = propsSig
    let el = null
    try {
      el = aeditor.untracked(function () {
        return spec.factory(propsSig, runtime.ctx)
      })
      runtime.error = null
    } catch (err) {
      runtime.error = {
        message: String(err && err.message ? err.message : err),
        stack: err && err.stack || null,
      }
      if (aeditor.reportError) aeditor.reportError(src, err)
    }
    if (!el) {
      if (!runtime.error) {
        runtime.error = { message: 'Component factory returned no element', stack: null }
        if (aeditor.reportError) aeditor.reportError(src, new Error(runtime.error.message))
      }
      runtime.contentEl = makeErrorEl(runtime.component, runtime.error.message)
      return
    }
    runtime.contentEl = el
    if (runtime.kind === 'panel' && aeditor.ui && aeditor.ui.scope) {
      aeditor.ui.scope(el, { active: runtime.active })
    }
  }

  function disposeComponentRuntime(runtime) {
    while (runtime.cleanups.length) {
      const fn = runtime.cleanups.pop()
      try { fn() } catch (e) { console.error(e) }
    }
    if (runtime.contentEl) {
      if (runtime.kind === 'panel' && aeditor.ui && aeditor.ui.closeScope) {
        aeditor.ui.closeScope(runtime.contentEl)
      }
      const spec = aeditor.resolveComponent(runtime.component)
      if (spec.dispose) {
        aeditor.safeCall({ scope: 'component', component: runtime.component },
          function () { spec.dispose(runtime.contentEl) })
      } else if (aeditor.ui && aeditor.ui.dispose) {
        aeditor.ui.dispose(runtime.contentEl)
      } else {
        runtime.contentEl.remove()
      }
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

  function inspectPanels(layout) {
    const out = []
    function walk(node) {
      if (!node) return
      if (node.type === 'dock') {
        const dr = layout.dockRuntimes.get(node.id)
        const panels = node.panels || []
        for (let i = 0; i < panels.length; i++) {
          const panel = panels[i]
          const pr = dr && dr.panelRuntimes.get(panel.id)
          out.push(panelStatus(node, panel, pr))
        }
        return
      }
      for (let j = 0; node.children && j < node.children.length; j++) walk(node.children[j])
    }
    walk(layout.treeSig.peek())
    return out
  }

  function inspectPanel(layout, panelId) {
    const list = inspectPanels(layout)
    for (let i = 0; i < list.length; i++) if (list[i].panelId === panelId) return list[i]
    return null
  }

  function panelStatus(dock, panel, runtime) {
    const materialized = !!(runtime && runtime.contentEl)
    const error = runtime && runtime.error
    const text = materialized && runtime.contentEl.textContent ? runtime.contentEl.textContent : ''
    return {
      panelId: panel.id,
      dockId: dock.id,
      dockName: dock.name || dock.id,
      title: panel.title || panel.component,
      component: panel.component,
      active: dock.activeId === panel.id,
      materialized: materialized,
      status: error ? 'error' : (materialized ? 'ready' : 'pending'),
      error: error ? { message: error.message, stack: error.stack || null } : null,
      textSample: text ? text.slice(0, 2000) : '',
    }
  }

  function makeErrorEl(componentName, message) {
    const el = document.createElement('div')
    el.className = 'aeditor-panel-error'
    el.textContent = 'Failed to create component: ' + componentName + (message ? '\n' + message : '')
    return el
  }

  aeditor._dock = aeditor._dock || {}
  aeditor._dock.createLayoutRuntime         = createLayoutRuntime
  aeditor._dock.disposeLayoutRuntime        = disposeLayoutRuntime
  aeditor._dock.createDockRuntime           = createDockRuntime
  aeditor._dock.updateDockRuntime           = updateDockRuntime
  aeditor._dock.disposeDockRuntime          = disposeDockRuntime
  aeditor._dock.createStaticToolbarRuntimes = createStaticToolbarRuntimes
  aeditor._dock.syncActivePanel             = syncActivePanel
  aeditor._dock.syncDockClasses             = syncDockClasses
  aeditor._dock.disposeStalePanelRuntimes   = disposeStalePanelRuntimes
  aeditor._dock.disposePanelRuntime         = disposePanelRuntime
  aeditor._dock.findPanelRuntime            = findPanelRuntime
  aeditor._dock.inspectPanels               = inspectPanels
  aeditor._dock.inspectPanel                = inspectPanel
})(window.aeditor = window.aeditor || {})
