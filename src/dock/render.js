// Dock renderer — keyed in-place reconciliation.
//
// The renderer owns only the split/dock DOM skeleton. DockRuntime owns panel
// content and toolbar component lifecycles. Reconcile therefore runs in two
// phases: first patch structural frames in place, then sync active panels for
// every surviving dock. This keeps unrelated active panel DOM connected across
// local tree changes such as tab activation.
;(function (aiditor) {
  'use strict'

  const CORNERS = ['tl', 'tr', 'bl', 'br']
  const RT = aiditor._dock

  function reconcile(layout, newTree) {
    const used = new Set()
    layout.rootFrame = reconcileFrame(layout.rootFrame, newTree, [], layout, used, newTree)
    mountRoot(layout, layout.rootFrame.el)

    const staleDockIds = []
    layout.dockRuntimes.forEach(function (dr, id) {
      if (!used.has(id)) staleDockIds.push(id)
    })

    layout.dockRuntimes.forEach(function (dr, id) {
      if (!used.has(id)) return
      const data = dr.dataSig.peek()
      RT.syncActivePanel(dr, data, layout)
      RT.syncDockClasses(dr, data)
    })
    layout.dockRuntimes.forEach(function (dr, id) {
      if (!used.has(id)) return
      const data = dr.dataSig.peek()
      RT.disposeStalePanelRuntimes(dr, data)
    })
    for (let i = 0; i < staleDockIds.length; i++) {
      const dr = layout.dockRuntimes.get(staleDockIds[i])
      RT.disposeDockRuntime(dr)
      layout.dockRuntimes.delete(staleDockIds[i])
    }
  }

  function mountRoot(layout, el) {
    if (layout.container.firstChild === el) {
      while (el.nextSibling) layout.container.removeChild(el.nextSibling)
      return
    }
    if (layout.container.firstChild) layout.container.replaceChild(el, layout.container.firstChild)
    else layout.container.appendChild(el)
    while (el.nextSibling) layout.container.removeChild(el.nextSibling)
  }

  function reconcileFrame(frame, node, path, layout, used, tree) {
    return node.type === 'dock'
      ? reconcileDockFrame(frame, node, layout, used)
      : reconcileSplitFrame(frame, node, path, layout, used, tree)
  }

  function reconcileDockFrame(frame, dockData, layout, used) {
    used.add(dockData.id)
    const dockEl = getOrCreateDockEl(dockData, layout)
    if (frame && frame.kind === 'dock' && frame.dockId === dockData.id) {
      frame.node = dockData
      frame.el = dockEl
      frame.dockIds = [dockData.id]
      return frame
    }
    return { kind: 'dock', node: dockData, dockId: dockData.id, dockIds: [dockData.id], el: dockEl }
  }

  function reconcileSplitFrame(frame, node, path, layout, used, tree) {
    if (!frame || frame.kind !== 'split') frame = createSplitFrame()
    if (frame.direction !== node.direction) {
      frame.direction = node.direction
      frame.el.className = 'aiditor-split aiditor-split-' + node.direction
    }
    const oldFrames = frame.childFrames
    const oldWraps = frame.childWraps
    const claimed = {}
    const nextFrames = []
    const nextWraps = []

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      const oldIndex = findReusableChild(oldFrames, child, i, claimed)
      const childPath = path.concat(i)
      let childFrame = oldIndex >= 0 ? oldFrames[oldIndex] : null
      const sameChild = childFrame && childFrame.node === child && (child.type === 'dock' || samePath(childFrame.path, childPath))
      if (!sameChild) childFrame = reconcileFrame(childFrame, child, childPath, layout, used, tree)
      else addFrameDockIds(childFrame, used)

      const wrap = oldIndex >= 0 ? oldWraps[oldIndex] : createChildWrap()
      const flex = childFlex(child, node, i, tree)
      if (wrap.style.flex !== flex) wrap.style.flex = flex
      if (wrap.firstChild !== childFrame.el) {
        if (wrap.firstChild) wrap.replaceChild(childFrame.el, wrap.firstChild)
        else wrap.appendChild(childFrame.el)
      }
      childFrame.path = childPath
      nextFrames.push(childFrame)
      nextWraps.push(wrap)
    }

    removeOldSplitters(frame)
    removeUnusedWraps(oldWraps, claimed)
    frame.node = node
    frame.path = path
    frame.childFrames = nextFrames
    frame.childWraps = nextWraps
    frame.splitters = createSplitters(node, path, layout, frame.el)
    frame.dockIds = collectDockIds(nextFrames)
    syncSplitDom(frame)
    return frame
  }

  function createSplitFrame() {
    return {
      kind: 'split',
      node: null,
      path: [],
      direction: null,
      el: document.createElement('div'),
      childFrames: [],
      childWraps: [],
      splitters: [],
      dockIds: [],
    }
  }

  function createChildWrap() {
    const wrap = document.createElement('div')
    wrap.className = 'aiditor-split-child'
    return wrap
  }

  function findReusableChild(frames, node, preferred, claimed) {
    if (matchesFrame(frames[preferred], node, true) && !claimed[preferred]) {
      claimed[preferred] = true
      return preferred
    }
    for (let i = 0; i < frames.length; i++) {
      if (claimed[i]) continue
      if (matchesFrame(frames[i], node, false)) {
        claimed[i] = true
        return i
      }
    }
    return -1
  }

  function matchesFrame(frame, node, preferred) {
    if (!frame || !node) return false
    if (node.type === 'dock') return frame.kind === 'dock' && frame.dockId === node.id
    return frame.kind === 'split' && (preferred || frame.node === node)
  }

  function collectDockIds(frames) {
    const ids = []
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      if (frame.kind === 'dock') ids.push(frame.dockId)
      else for (let j = 0; j < frame.dockIds.length; j++) ids.push(frame.dockIds[j])
    }
    return ids
  }

  function addFrameDockIds(frame, used) {
    if (frame.kind === 'dock') {
      used.add(frame.dockId)
      return
    }
    for (let i = 0; i < frame.dockIds.length; i++) used.add(frame.dockIds[i])
  }

  function childFlex(child, parent, index, tree) {
    const isCollapsed = child.type === 'dock' && child.collapsed &&
                        aiditor.canCollapseDock(tree, child.id)
    return isCollapsed ? '0 0 auto' : ((parent.sizes[index] * 100) + ' 0 0')
  }

  function removeOldSplitters(frame) {
    for (let i = 0; i < frame.splitters.length; i++) {
      if (frame.splitters[i].parentNode) frame.splitters[i].remove()
    }
  }

  function removeUnusedWraps(wraps, claimed) {
    for (let i = 0; i < wraps.length; i++) {
      if (!claimed[i] && wraps[i].parentNode) wraps[i].remove()
    }
  }

  function createSplitters(node, path, layout, splitEl) {
    const out = []
    for (let i = 0; i < node.children.length - 1; i++) {
      const sp = document.createElement('div')
      sp.className = 'aiditor-splitter aiditor-splitter-' + node.direction
      aiditor._dock.attachSplitterDrag(sp, splitEl, node, path, i, layout)
      out.push(sp)
    }
    return out
  }

  function syncSplitDom(frame) {
    let cursor = 0
    for (let i = 0; i < frame.childWraps.length; i++) {
      cursor = placeChild(frame.el, frame.childWraps[i], cursor)
      if (i < frame.splitters.length) cursor = placeChild(frame.el, frame.splitters[i], cursor)
    }
    while (frame.el.childNodes.length > cursor) frame.el.removeChild(frame.el.childNodes[cursor])
  }

  function placeChild(parent, child, index) {
    const at = parent.childNodes[index] || null
    if (at !== child) parent.insertBefore(child, at)
    return index + 1
  }

  function samePath(a, b) {
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  function getOrCreateDockEl(dockData, layout) {
    let dr = layout.dockRuntimes.get(dockData.id)
    if (dr) {
      RT.updateDockRuntime(dr, dockData, layout)
      return dr.dockEl
    }

    const dockEl = document.createElement('div')
    dockEl.className = 'aiditor-dock'
    if (dockData.toolbar) {
      dockEl.classList.add('aiditor-dock-with-toolbar')
      dockEl.classList.add('aiditor-dock-toolbar-' + dockData.toolbar.direction)
    }
    dockEl.dataset.dockId = dockData.id

    let toolbarEl = null, toolbarStartEl = null, toolbarEndEl = null
    if (dockData.toolbar) {
      toolbarEl = document.createElement('div')
      toolbarEl.className = 'aiditor-toolbar aiditor-toolbar-' + dockData.toolbar.direction
      toolbarStartEl = document.createElement('div')
      toolbarStartEl.className = 'aiditor-toolbar-start'
      toolbarEndEl = document.createElement('div')
      toolbarEndEl.className = 'aiditor-toolbar-end'
      toolbarEl.appendChild(toolbarStartEl)
      toolbarEl.appendChild(toolbarEndEl)
      dockEl.appendChild(toolbarEl)
    }

    const content = document.createElement('div')
    content.className = 'aiditor-dock-content'
    dockEl.appendChild(content)

    for (let i = 0; i < CORNERS.length; i++) {
      const c = CORNERS[i]
      const h = document.createElement('div')
      h.className = 'aiditor-corner aiditor-corner-' + c
      h.dataset.corner = c
      aiditor._dock.attachCornerDrag(h, dockData.id, c, layout)
      dockEl.appendChild(h)
    }
    attachCornerHover(dockEl)

    dr = RT.createDockRuntime(dockData, dockEl, content, layout, {
      toolbarEl:      toolbarEl,
      toolbarStartEl: toolbarStartEl,
      toolbarEndEl:   toolbarEndEl,
    })
    layout.dockRuntimes.set(dockData.id, dr)

    if (dockData.toolbar) {
      RT.createStaticToolbarRuntimes(dr, dockData, layout)
    }

    return dockEl
  }

  function attachCornerHover(dockEl) {
    const CLS = ['aiditor-dock-c-tl', 'aiditor-dock-c-tr', 'aiditor-dock-c-bl', 'aiditor-dock-c-br']
    function clear() {
      for (let i = 0; i < CLS.length; i++) dockEl.classList.remove(CLS[i])
    }
    dockEl.addEventListener('pointermove', function (e) {
      if (e.target.closest('.aiditor-dock') !== dockEl) {
        clear()
        return
      }
      const r = dockEl.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      const col = x < 1 / 3 ? 'l' : x > 2 / 3 ? 'r' : null
      const row = y < 1 / 3 ? 't' : y > 2 / 3 ? 'b' : null
      if (row && col) {
        const want = 'aiditor-dock-c-' + row + col
        if (!dockEl.classList.contains(want)) { clear(); dockEl.classList.add(want) }
      } else {
        clear()
      }
    })
    dockEl.addEventListener('pointerleave', clear)
  }

  aiditor._dock = aiditor._dock || {}
  aiditor._dock.reconcile = reconcile
})(window.aiditor = window.aiditor || {})
