// Panel drag — tab tear-out, tab reorder, five-zone dock drop, and pop-out.
//
// Tab widgets call `aeditor._dock.beginPanelDrag` on pointerdown. This module
// tracks the threshold, paints a ghost, hit-tests target docks AND target
// tab bars, gates by the target's `accept` whitelist (§ 4.12), and on
// pointerup commits one of:
//   • drop on a tab bar       → layout.movePanel(panelId, dstDockId, idx)
//                               (reorder within srcDock, or cross-dock with
//                               an explicit insertion slot)
//   • drop on dock center     → layout.movePanel(panelId, dstDockId)
//                               (append, no index)
//   • drop on dock edge       → layout.movePanelToSplit(panelId, dstDockId, ...)
//                               (new dock on that side)
//   • drop outside any dock   → aeditor._dock.popOutPanel (§ 4.14, if loaded)
//
// Split from dock/interactions.js — that file now owns only the splitter
// and corner drags (§ 4.1 / § 4.2). Both subsystems read their threshold
// from --aeditor-drag-threshold via ui.readNum(); keeping the code split makes
// each file readable top-to-bottom without scrolling past the other.
;(function (aeditor) {
  'use strict'

  function beginPanelDrag(e, panelId, srcDockId, layout) {
    if (e.button !== 0) return
    e.preventDefault()
    const treeSig = layout.treeSig
    const threshold = aeditor.ui.readNum('--aeditor-drag-threshold', 6)

    const srcFound = aeditor.findPanel(treeSig.peek(), panelId)
    if (!srcFound) return
    const label  = srcFound.panel.title || srcFound.panel.component
    const component = srcFound.panel.component

    const startX = e.clientX, startY = e.clientY
    let dragging = false
    let ghost = null
    let lastDockEl = null
    let lastIndicator = null
    let lastOverlay = null
    let drop = null
    let done = false

    function clearHighlights() {
      if (lastDockEl) {
        lastDockEl.classList.remove('aeditor-drop-target', 'aeditor-drop-reject')
        lastDockEl = null
      }
      if (lastIndicator) {
        lastIndicator.remove()
        lastIndicator = null
      }
      if (lastOverlay) {
        lastOverlay.remove()
        lastOverlay = null
      }
    }

    function onMove(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging) {
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
        dragging = true
        ghost = makeGhost(label)
        document.body.appendChild(ghost)
        document.body.classList.add('aeditor-dragging')
      }
      ghost.style.transform = 'translate(' + (ev.clientX + 8) + 'px,' + (ev.clientY + 8) + 'px)'

      clearHighlights()
      drop = null

      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!el || !el.closest) return

      const dockEl = el.closest('.aeditor-dock')
      if (!dockEl) return
      const dstId = dockEl.dataset.dockId
      if (!dstId) return

      const dst = aeditor.findDock(treeSig.peek(), dstId)
      if (!dst) return
      const a = dst.node.accept
      const accepts = !a || a === '*' || (Array.isArray(a) && a.indexOf(component) >= 0)

      // Same-dock drop on plain dock body (not on tab bar) is a no-op —
      // we don't paint anything and dropIndex stays null so pointerup does
      // nothing. Reorder only happens when the pointer is on a tab bar.
      if (!accepts) {
        dockEl.classList.add('aeditor-drop-reject')
        lastDockEl = dockEl
        return
      }

      // Is the pointer inside a tab bar? If yes, compute an insertion index
      // and paint a drop indicator between the two nearest tab buttons.
      // `.aeditor-dock-tabs` is the marker class added by the dock-tabs thin
      // shell; it sits next to `.aeditor-ui-tab` (the visual styling), so any
      // tab strip the dock rendered matches both.
      const tabsEl = el.closest('.aeditor-dock-tabs')
      if (tabsEl && dockEl.contains(tabsEl)) {
        const idx = computeTabInsertionIndex(tabsEl, ev.clientX, ev.clientY, panelId)
        drop = { kind: 'move', dockId: dstId, index: idx }
        lastIndicator = makeDropIndicator(tabsEl, idx)
        if (dstId !== srcDockId) {
          dockEl.classList.add('aeditor-drop-target')
          lastDockEl = dockEl
        }
        return
      }

      const zone = classifyDockZone(dockEl, ev.clientX, ev.clientY)
      if (zone.kind === 'center') {
        if (dstId === srcDockId) return
        dockEl.classList.add('aeditor-drop-target')
        lastDockEl = dockEl
        drop = { kind: 'move', dockId: dstId, index: null }
        lastOverlay = makeDockDropOverlay(dockEl, zone)
        return
      }

      dockEl.classList.add('aeditor-drop-target')
      lastDockEl = dockEl
      drop = {
        kind: 'split',
        dockId: dstId,
        zone: zone.name,
        direction: zone.direction,
        side: zone.side,
        ratio: zone.ratio,
      }
      lastOverlay = makeDockDropOverlay(dockEl, zone)
    }

    function cleanup() {
      if (done) return false
      done = true
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onCancel)
      document.body.classList.remove('aeditor-dragging')
      if (ghost) ghost.remove()
      clearHighlights()
      return true
    }

    function onUp(ev) {
      const resolvedDrop = drop
      const wasDragging   = dragging
      if (!cleanup()) return
      if (!wasDragging) return

      if (resolvedDrop && resolvedDrop.kind === 'move') {
        // Skip same-dock no-op reorders. computeTabInsertionIndex already
        // filters out the dragging tab, so its returned index is in the
        // post-removal list. A reorder is a no-op iff that slot coincides
        // with the panel's original position in the post-removal list,
        // which equals its original `oldIdx` (everything at/after oldIdx
        // shifts down by 1 → insert at oldIdx puts it right back).
        if (resolvedDrop.dockId === srcDockId && resolvedDrop.index != null) {
          const srcDock = aeditor.findDock(treeSig.peek(), srcDockId).node
          const oldIdx = srcDock.panels.findIndex(function (p) { return p.id === panelId })
          if (resolvedDrop.index === oldIdx) return
        }
        try {
          layout.movePanel(panelId, resolvedDrop.dockId, resolvedDrop.index)
        } catch (err) {
          aeditor.reportError({ scope: 'global' }, err)
        }
        return
      }

      if (resolvedDrop && resolvedDrop.kind === 'split') {
        try {
          layout.movePanelToSplit(
            panelId,
            resolvedDrop.dockId,
            resolvedDrop.direction,
            resolvedDrop.side,
            resolvedDrop.ratio
          )
        } catch (err) {
          aeditor.reportError({ scope: 'global' }, err)
        }
        return
      }

      // Dropped outside any accepting dock — pop out into a new window if
      // the pointer also left the original dock entirely.
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const anyDock = el && el.closest && el.closest('.aeditor-dock')
      if (!anyDock && aeditor._dock.popOutPanel) {
        aeditor._dock.popOutPanel(panelId, layout, ev.screenX, ev.screenY)
      }
    }

    function onKey(ev) { if (ev.key === 'Escape') { dragging = false; cleanup() } }
    function onCancel() { dragging = false; cleanup() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onCancel)
  }

  function beginExternalPanelDrag(e, partial, layout, opts) {
    if (e.button !== 0) return
    e.preventDefault()
    const panel = partial || {}
    const component = panel.component
    const label = (opts && opts.label) || panel.title || component
    const threshold = aeditor.ui.readNum('--aeditor-drag-threshold', 6)

    const startX = e.clientX, startY = e.clientY
    let dragging = false
    let ghost = null
    let lastDockEl = null
    let lastOverlay = null
    let drop = null
    let done = false

    function clearHighlights() {
      if (lastDockEl) {
        lastDockEl.classList.remove('aeditor-drop-target', 'aeditor-drop-reject')
        lastDockEl = null
      }
      if (lastOverlay) {
        lastOverlay.remove()
        lastOverlay = null
      }
    }

    function onMove(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging) {
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
        dragging = true
        ghost = makeGhost(label)
        document.body.appendChild(ghost)
        document.body.classList.add('aeditor-dragging')
      }
      ghost.style.transform = 'translate(' + (ev.clientX + 8) + 'px,' + (ev.clientY + 8) + 'px)'

      clearHighlights()
      drop = null

      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const dockEl = el && el.closest && el.closest('.aeditor-dock')
      if (!dockEl) return
      const dstId = dockEl.dataset.dockId
      const dst = dstId && aeditor.findDock(layout.tree(), dstId)
      if (!dst) return

      const a = dst.node.accept
      const accepts = !a || a === '*' || (Array.isArray(a) && a.indexOf(component) >= 0)
      if (!accepts) {
        dockEl.classList.add('aeditor-drop-reject')
        lastDockEl = dockEl
        return
      }

      const zone = classifyDockZone(dockEl, ev.clientX, ev.clientY)
      dockEl.classList.add('aeditor-drop-target')
      lastDockEl = dockEl
      lastOverlay = makeDockDropOverlay(dockEl, zone)
      drop = Object.assign({ dockId: dstId }, zone)
    }

    function cleanup() {
      if (done) return false
      done = true
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onCancel)
      document.body.classList.remove('aeditor-dragging')
      if (ghost) ghost.remove()
      clearHighlights()
      return true
    }

    function onUp() {
      const resolvedDrop = drop
      const wasDragging = dragging
      if (!cleanup() || !wasDragging || !resolvedDrop) return
      try {
        if (resolvedDrop.kind === 'center') {
          layout.addPanel(resolvedDrop.dockId, clonePanelInput(panel))
          return
        }
        layout.addPanelToSplit(
          resolvedDrop.dockId,
          resolvedDrop.direction,
          resolvedDrop.side,
          resolvedDrop.ratio,
          clonePanelInput(panel)
        )
      } catch (err) {
        aeditor.reportError({ scope: 'global' }, err)
      }
    }

    function onKey(ev) { if (ev.key === 'Escape') { dragging = false; cleanup() } }
    function onCancel() { dragging = false; cleanup() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onCancel)
  }

  // Find which gap between existing tabs the pointer falls into. Works for
  // both horizontal and vertical tab strips. The returned index is the slot
  // in the POST-REMOVAL list (with draggingPanelId filtered out) — that's
  // exactly what aeditor.movePanel's dstIndex means, so no further adjustment
  // is needed at the call site.
  function computeTabInsertionIndex(tabsEl, clientX, clientY, draggingPanelId) {
    const vertical = tabsEl.classList.contains('aeditor-ui-tab-vertical')
    const tabs = tabsEl.querySelectorAll(':scope > .aeditor-ui-tab-btn')
    let idx = 0
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.tabId === draggingPanelId) continue
      const r = tabs[i].getBoundingClientRect()
      const mid = vertical ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2
      const pos = vertical ? clientY : clientX
      if (pos < mid) return idx
      idx++
    }
    return idx
  }

  function classifyDockZone(dockEl, clientX, clientY) {
    const r = dockEl.getBoundingClientRect()
    const x = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1)
    const y = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1)
    const edge = 0.24
    const ratio = 0.28
    if (x > edge && x < 1 - edge && y > edge && y < 1 - edge) {
      return { kind: 'center', name: 'center' }
    }
    const d = [
      { name: 'left',   value: x,     direction: 'horizontal', side: 'before' },
      { name: 'right',  value: 1 - x, direction: 'horizontal', side: 'after' },
      { name: 'top',    value: y,     direction: 'vertical',   side: 'before' },
      { name: 'bottom', value: 1 - y, direction: 'vertical',   side: 'after' },
    ]
    let best = d[0]
    for (let i = 1; i < d.length; i++) if (d[i].value < best.value) best = d[i]
    return Object.assign({ kind: 'split', ratio: ratio }, best)
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

  function makeDockDropOverlay(dockEl, zone) {
    const r = dockEl.getBoundingClientRect()
    const overlay = document.createElement('div')
    overlay.className = 'aeditor-panel-drop-overlay aeditor-panel-drop-' + zone.name
    overlay.style.left = r.left + 'px'
    overlay.style.top = r.top + 'px'
    overlay.style.width = r.width + 'px'
    overlay.style.height = r.height + 'px'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'aeditor-panel-drop-map')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('preserveAspectRatio', 'none')
    appendDropShape(svg, 'top',    '0,0 100,0 76,24 24,24', zone.name)
    appendDropShape(svg, 'left',   '0,0 24,24 24,76 0,100', zone.name)
    appendDropShape(svg, 'right',  '100,0 100,100 76,76 76,24', zone.name)
    appendDropShape(svg, 'bottom', '0,100 100,100 76,76 24,76', zone.name)
    const center = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    center.setAttribute('class', 'aeditor-panel-drop-shape aeditor-panel-drop-shape-center' + (zone.name === 'center' ? ' aeditor-panel-drop-active' : ''))
    center.setAttribute('x', '24')
    center.setAttribute('y', '24')
    center.setAttribute('width', '52')
    center.setAttribute('height', '52')
    svg.appendChild(center)
    overlay.appendChild(svg)
    document.body.appendChild(overlay)
    return overlay
  }

  function appendDropShape(svg, name, points, activeName) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    shape.setAttribute('class', 'aeditor-panel-drop-shape aeditor-panel-drop-shape-' + name + (activeName === name ? ' aeditor-panel-drop-active' : ''))
    shape.setAttribute('points', points)
    svg.appendChild(shape)
  }

  // Build a short accent bar between two tabs (or before/after the whole
  // strip) to visualise the insertion slot. Positioned absolutely inside
  // the tabs element (which is position:relative per component.css).
  function makeDropIndicator(tabsEl, index) {
    const vertical = tabsEl.classList.contains('aeditor-ui-tab-vertical')
    const ind = document.createElement('div')
    ind.className = 'aeditor-ui-tab-drop-indicator'
    const tabs = tabsEl.querySelectorAll(':scope > .aeditor-ui-tab-btn')
    const barRect = tabsEl.getBoundingClientRect()

    let edge
    if (tabs.length === 0) {
      edge = 0
    } else if (index >= tabs.length) {
      const r = tabs[tabs.length - 1].getBoundingClientRect()
      edge = vertical ? (r.bottom - barRect.top) : (r.right - barRect.left)
    } else {
      const r = tabs[index].getBoundingClientRect()
      edge = vertical ? (r.top - barRect.top) : (r.left - barRect.left)
    }

    if (vertical) {
      ind.style.left   = '2px'
      ind.style.right  = '2px'
      ind.style.top    = (edge - 1) + 'px'
      ind.style.height = '2px'
    } else {
      ind.style.top    = '2px'
      ind.style.bottom = '2px'
      ind.style.left   = (edge - 1) + 'px'
      ind.style.width  = '2px'
    }
    tabsEl.appendChild(ind)
    return ind
  }

  function makeGhost(label) {
    const g = document.createElement('div')
    g.className = 'aeditor-drag-ghost'
    g.textContent = label
    return g
  }

  function clonePanelInput(panel) {
    const out = Object.assign({}, panel)
    if (panel.props) out.props = structuredClone(panel.props)
    if (panel.toolbarItems) out.toolbarItems = structuredClone(panel.toolbarItems)
    return out
  }

  aeditor._dock = aeditor._dock || {}
  aeditor._dock.beginPanelDrag = beginPanelDrag
  aeditor._dock.beginExternalPanelDrag = beginExternalPanelDrag
})(window.aeditor = window.aeditor || {})
