// Dock renderer — keyed reconciliation by dock id.
//
// On every tree commit:
//   • SPLIT frames are cheap structural divs, rebuilt every pass
//   • DOCK elements are reused via layout.dockRuntimes (keyed by dockId).
//     Dock DOM, content container, all PanelRuntimes, all panel contentEls,
//     all static + dynamic toolbar item contentEls — all preserved.
//
// After the structural rebuild, every surviving dock runtime is synced:
//   1. updateDockRuntime — fresh dataSig + refresh panel-runtime data signals
//   2. syncActivePanel  — detach old / attach new active panel + dynamic toolbar
//   3. syncDockClasses  — focused / collapsed visual classes
;(function (EF) {
  'use strict'

  const CORNERS = ['tl', 'tr', 'bl', 'br']
  const RT = EF._dock

  function reconcile(layout, newTree) {
    const used = new Set()
    const root = build(newTree, [], layout, used, newTree)
    layout.container.replaceChildren(root)

    // GC dock runtimes whose dockId disappeared from the tree.
    const toDelete = []
    layout.dockRuntimes.forEach(function (dr, id) {
      if (!used.has(id)) toDelete.push(id)
    })
    for (let i = 0; i < toDelete.length; i++) {
      const dr = layout.dockRuntimes.get(toDelete[i])
      RT.disposeDockRuntime(dr)
      layout.dockRuntimes.delete(toDelete[i])
    }

    // Mount active panels + sync visual classes. Stale panel runtime GC runs
    // after every dock has had a chance to re-home moved panel runtimes.
    layout.dockRuntimes.forEach(function (dr) {
      const data = dr.dataSig.peek()
      RT.syncActivePanel(dr, data, layout)
      RT.syncDockClasses(dr, data)
    })
    layout.dockRuntimes.forEach(function (dr) {
      const data = dr.dataSig.peek()
      RT.disposeStalePanelRuntimes(dr, data)
    })
  }

  function build(node, path, layout, used, tree) {
    if (node.type === 'dock') {
      used.add(node.id)
      return getOrCreateDockEl(node, layout)
    }
    return createSplit(node, path, layout, used, tree)
  }

  function createSplit(node, path, layout, used, tree) {
    const el = document.createElement('div')
    el.className = 'ef-split ef-split-' + node.direction

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const wrap = document.createElement('div')
      wrap.className = 'ef-split-child'
      // Collapsed dock in a compatible parent split → its slot shrinks to
      // the intrinsic size of the visible toolbar, and sibling grow factors
      // (still their original ratios) absorb the freed space. Compatibility
      // is decided once, purely from topology + toolbar direction, by
      // canCollapseDock — that's the single source of truth for "does this
      // collapse request get honored?".
      //
      // Sizes in the tree are normalized (sum ≈ 1). CSS Flex § 9.7.12.3:
      // when the sum of grow factors is < 1, only `sum × freeSpace` gets
      // distributed — the rest is wasted, leaving empty space. After a
      // sibling collapses to `0 0 auto`, the remaining grows would sum to
      // < 1 and waste the freed area. Multiplying every share by 100
      // pushes the sum comfortably above 1 without changing relative
      // proportions. The splitter-drag code uses the same ×100 so live
      // resize stays consistent with the initial render.
      const isCollapsed = child.type === 'dock' && child.collapsed &&
                          EF.canCollapseDock(tree, child.id)
      wrap.style.flex = isCollapsed ? '0 0 auto' : ((node.sizes[i] * 100) + ' 0 0')
      wrap.appendChild(build(child, path.concat(i), layout, used, tree))
      el.appendChild(wrap)

      if (i < node.children.length - 1) {
        const sp = document.createElement('div')
        sp.className = 'ef-splitter ef-splitter-' + node.direction
        EF._dock.attachSplitterDrag(sp, el, node, path, i, layout)
        el.appendChild(sp)
      }
    }
    return el
  }

  function getOrCreateDockEl(dockData, layout) {
    let dr = layout.dockRuntimes.get(dockData.id)
    if (dr) {
      RT.updateDockRuntime(dr, dockData, layout)
      return dr.dockEl
    }

    // Fresh dock: build DOM + runtime + (optionally) toolbar components.
    const dockEl = document.createElement('div')
    dockEl.className = 'ef-dock'
    if (dockData.toolbar) {
      dockEl.classList.add('ef-dock-with-toolbar')
      dockEl.classList.add('ef-dock-toolbar-' + dockData.toolbar.direction)
    }
    dockEl.dataset.dockId = dockData.id

    let toolbarEl = null, toolbarStartEl = null, toolbarEndEl = null
    if (dockData.toolbar) {
      toolbarEl = document.createElement('div')
      toolbarEl.className = 'ef-toolbar ef-toolbar-' + dockData.toolbar.direction
      toolbarStartEl = document.createElement('div')
      toolbarStartEl.className = 'ef-toolbar-start'
      toolbarEndEl = document.createElement('div')
      toolbarEndEl.className = 'ef-toolbar-end'
      toolbarEl.appendChild(toolbarStartEl)
      toolbarEl.appendChild(toolbarEndEl)
      dockEl.appendChild(toolbarEl)
    }

    const content = document.createElement('div')
    content.className = 'ef-dock-content'
    dockEl.appendChild(content)

    for (let i = 0; i < CORNERS.length; i++) {
      const c = CORNERS[i]
      const h = document.createElement('div')
      h.className = 'ef-corner ef-corner-' + c
      h.dataset.corner = c
      EF._dock.attachCornerDrag(h, dockData.id, c, layout)
      dockEl.appendChild(h)
    }
    attachCornerHover(dockEl)

    dr = RT.createDockRuntime(dockData, dockEl, content, layout, {
      toolbarEl:      toolbarEl,
      toolbarStartEl: toolbarStartEl,
      toolbarEndEl:   toolbarEndEl,
    })
    layout.dockRuntimes.set(dockData.id, dr)

    // Now that the runtime exists with toolbar element references, instantiate
    // every static toolbar component. They live for the entire dock lifetime.
    if (dockData.toolbar) {
      RT.createStaticToolbarRuntimes(dr, dockData, layout)
    }

    return dockEl
  }

  // 3×3 grid hover: only the corner whose grid cell the cursor is in becomes
  // visible. Center / edge cells → no corner shown.
  function attachCornerHover(dockEl) {
    const CLS = ['ef-dock-c-tl', 'ef-dock-c-tr', 'ef-dock-c-bl', 'ef-dock-c-br']
    function clear() {
      for (let i = 0; i < CLS.length; i++) dockEl.classList.remove(CLS[i])
    }
    dockEl.addEventListener('pointermove', function (e) {
      const r = dockEl.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      const col = x < 1 / 3 ? 'l' : x > 2 / 3 ? 'r' : null
      const row = y < 1 / 3 ? 't' : y > 2 / 3 ? 'b' : null
      if (row && col) {
        const want = 'ef-dock-c-' + row + col
        if (!dockEl.classList.contains(want)) { clear(); dockEl.classList.add(want) }
      } else {
        clear()
      }
    })
    dockEl.addEventListener('pointerleave', clear)
  }

  EF._dock = EF._dock || {}
  EF._dock.reconcile = reconcile
})(window.EF = window.EF || {})
