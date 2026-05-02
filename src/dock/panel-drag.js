// Panel drag (Phase 5 + Phase 6 handoff) — tab tear-out, cross-dock move,
// same-dock reorder, and pop-out on outside-drop.
//
// Tab widgets call `EF._dock.beginPanelDrag` on pointerdown. This module
// tracks the threshold, paints a ghost, hit-tests target docks AND target
// tab bars, gates by the target's `accept` whitelist (§ 4.12), and on
// pointerup commits one of:
//   • drop on a tab bar       → layout.movePanel(panelId, dstDockId, idx)
//                               (reorder within srcDock, or cross-dock with
//                               an explicit insertion slot)
//   • drop on a dock body     → layout.movePanel(panelId, dstDockId)
//                               (append, no index)
//   • drop outside any dock   → EF._dock.popOutPanel (§ 4.14, if loaded)
//
// Split from dock/interactions.js — that file now owns only the splitter
// and corner drags (§ 4.1 / § 4.2). Both subsystems read their threshold
// from --ef-drag-threshold via ui.readNum(); keeping the code split makes
// each file readable top-to-bottom without scrolling past the other.
;(function (EF) {
  'use strict'

  function beginPanelDrag(e, panelId, srcDockId, layout) {
    if (e.button !== 0) return
    e.preventDefault()
    const treeSig = layout.treeSig
    const threshold = EF.ui.readNum('--ef-drag-threshold', 6)

    const srcFound = EF.findPanel(treeSig.peek(), panelId)
    if (!srcFound) return
    const label  = srcFound.panel.title || srcFound.panel.component
    const component = srcFound.panel.component

    const startX = e.clientX, startY = e.clientY
    let dragging = false
    let ghost = null
    let lastDockEl = null         // highlighted dock (for drop-target/reject class)
    let lastIndicator = null      // drop-indicator element inside a tab bar
    let dropDockId = null         // resolved drop target dock id (null = reject / outside)
    let dropIndex  = null         // resolved insertion index (null = append)
    let done = false

    function clearHighlights() {
      if (lastDockEl) {
        lastDockEl.classList.remove('ef-drop-target', 'ef-drop-reject')
        lastDockEl = null
      }
      if (lastIndicator) {
        lastIndicator.remove()
        lastIndicator = null
      }
    }

    function onMove(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging) {
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
        dragging = true
        ghost = makeGhost(label)
        document.body.appendChild(ghost)
        document.body.classList.add('ef-dragging')
      }
      ghost.style.transform = 'translate(' + (ev.clientX + 8) + 'px,' + (ev.clientY + 8) + 'px)'

      clearHighlights()
      dropDockId = null
      dropIndex  = null

      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!el || !el.closest) return

      const dockEl = el.closest('.ef-dock')
      if (!dockEl) return
      const dstId = dockEl.dataset.dockId
      if (!dstId) return

      const dst = EF.findDock(treeSig.peek(), dstId)
      if (!dst) return
      const a = dst.node.accept
      const accepts = !a || a === '*' || (Array.isArray(a) && a.indexOf(component) >= 0)

      // Same-dock drop on plain dock body (not on tab bar) is a no-op —
      // we don't paint anything and dropIndex stays null so pointerup does
      // nothing. Reorder only happens when the pointer is on a tab bar.
      if (!accepts) {
        dockEl.classList.add('ef-drop-reject')
        lastDockEl = dockEl
        return
      }

      // Is the pointer inside a tab bar? If yes, compute an insertion index
      // and paint a drop indicator between the two nearest tab buttons.
      // `.ef-dock-tabs` is the marker class added by the dock-tabs thin
      // shell; it sits next to `.ef-ui-tab` (the visual styling), so any
      // tab strip the dock rendered matches both.
      const tabsEl = el.closest('.ef-dock-tabs')
      if (tabsEl && dockEl.contains(tabsEl)) {
        const idx = computeTabInsertionIndex(tabsEl, ev.clientX, ev.clientY, panelId)
        dropDockId = dstId
        dropIndex  = idx
        lastIndicator = makeDropIndicator(tabsEl, idx)
        if (dstId !== srcDockId) {
          dockEl.classList.add('ef-drop-target')
          lastDockEl = dockEl
        }
        return
      }

      // On dock body (not tabs) — only cross-dock moves get the big highlight.
      if (dstId !== srcDockId) {
        dockEl.classList.add('ef-drop-target')
        lastDockEl = dockEl
        dropDockId = dstId
        dropIndex  = null   // append
      }
    }

    function cleanup() {
      if (done) return false
      done = true
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onCancel)
      document.body.classList.remove('ef-dragging')
      if (ghost) ghost.remove()
      clearHighlights()
      return true
    }

    function onUp(ev) {
      const resolvedDock  = dropDockId
      const resolvedIndex = dropIndex
      const wasDragging   = dragging
      if (!cleanup()) return
      if (!wasDragging) return

      if (resolvedDock) {
        // Skip same-dock no-op reorders. computeTabInsertionIndex already
        // filters out the dragging tab, so its returned index is in the
        // post-removal list. A reorder is a no-op iff that slot coincides
        // with the panel's original position in the post-removal list,
        // which equals its original `oldIdx` (everything at/after oldIdx
        // shifts down by 1 → insert at oldIdx puts it right back).
        if (resolvedDock === srcDockId && resolvedIndex != null) {
          const srcDock = EF.findDock(treeSig.peek(), srcDockId).node
          const oldIdx = srcDock.panels.findIndex(function (p) { return p.id === panelId })
          if (resolvedIndex === oldIdx) return
        }
        try {
          layout.movePanel(panelId, resolvedDock, resolvedIndex)
        } catch (err) {
          EF.reportError({ scope: 'global' }, err)
        }
        return
      }

      // Dropped outside any accepting dock — pop out into a new window if
      // the pointer also left the original dock entirely.
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const anyDock = el && el.closest && el.closest('.ef-dock')
      if (!anyDock && EF._dock.popOutPanel) {
        EF._dock.popOutPanel(panelId, layout, ev.screenX, ev.screenY)
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
  // exactly what EF.movePanel's dstIndex means, so no further adjustment
  // is needed at the call site.
  function computeTabInsertionIndex(tabsEl, clientX, clientY, draggingPanelId) {
    const vertical = tabsEl.classList.contains('ef-ui-tab-vertical')
    const tabs = tabsEl.querySelectorAll(':scope > .ef-ui-tab-btn')
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

  // Build a short accent bar between two tabs (or before/after the whole
  // strip) to visualise the insertion slot. Positioned absolutely inside
  // the tabs element (which is position:relative per component.css).
  function makeDropIndicator(tabsEl, index) {
    const vertical = tabsEl.classList.contains('ef-ui-tab-vertical')
    const ind = document.createElement('div')
    ind.className = 'ef-ui-tab-drop-indicator'
    const tabs = tabsEl.querySelectorAll(':scope > .ef-ui-tab-btn')
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
    g.className = 'ef-drag-ghost'
    g.textContent = label
    return g
  }

  EF._dock = EF._dock || {}
  EF._dock.beginPanelDrag = beginPanelDrag
})(window.EF = window.EF || {})
