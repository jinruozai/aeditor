// EF.ui._treeDnd — drag & drop layer for ui.tree.
//
// Lives in its own file so the core tree stays readable when DnD is not
// in use (the attach call is a no-op when opts.dnd is omitted). The layer
// owns:
//   · drag session state (source nodes, drag data payload, live target)
//   · ghost preview element (follows cursor)
//   · drop indicator (line between rows for before/after, outline for inside)
//   · auto-expand timer when hovering over a collapsed target
//   · auto-scroll when cursor nears viewport top/bottom edges
//   · cycle prevention (dragging parent into its own descendant)
//   · platform modifier for toggling inside vs before/after if ambiguous
//
// Contract with tree.js:
//   ui._treeDnd.attach(rootEl, itemsSig, expandedSig, flatSig, dndOpts, treeCtx)
// where treeCtx exposes the virtualizer row cache + multi-select bridge.
// Tree.js imports no DnD code directly — this file self-registers on load.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  // Drag starts after pointer moves past this distance; avoids flipping every
  // click into a drag. Read from the CSS token (same knob as dock drag in
  // dock/interactions.js) so a single theme-wide adjustment retunes both.
  function dragThreshold() {
    return (ui.readNum && ui.readNum('--ef-drag-threshold', 6)) || 6
  }

  function nearestRow(rootEl, clientX, clientY) {
    // document.elementFromPoint + walk up to the row element. Works under
    // virtualization — only rows actually in the DOM participate, which is
    // what we want (can't drop onto a row that isn't rendered).
    let el = document.elementFromPoint(clientX, clientY)
    while (el && el !== rootEl) {
      if (el.classList && el.classList.contains('ef-ui-tree-row')) return el
      el = el.parentNode
    }
    return null
  }

  // Classify the drop position from cursor offset within a row.
  //
  // Containers should feel easy to drop into, not like a pixel-hunt: when
  // `inside` is allowed the middle band owns most of the row. Before/after
  // stay available at the top/bottom edges for deliberate sibling inserts.
  // Moving right within the label area reinforces "make child" intent,
  // matching common outliner/file-tree behavior while keeping the API small.
  function classifyPosition(rowEl, clientX, clientY, zones) {
    const rect = rowEl.getBoundingClientRect()
    const rel = (clientY - rect.top) / rect.height
    const allowBefore = zones.indexOf('before') >= 0
    const allowInside = zones.indexOf('inside') >= 0
    const allowAfter  = zones.indexOf('after')  >= 0
    if (allowInside) {
      if (rel < 0.16 && allowBefore) return 'before'
      if (rel > 0.84 && allowAfter)  return 'after'
      if (clientX > rect.left + 24) return 'inside'
      return 'inside'
    }
    if (allowBefore && allowAfter) return rel < 0.5 ? 'before' : 'after'
    if (allowBefore) return 'before'
    if (allowAfter)  return 'after'
    return null
  }

  // Walk nodes to check if `descendantId` is (transitively) under `rootNode`.
  // Used to prevent cycles — user can't drop a parent into its own subtree.
  function containsDescendant(rootNode, targetId) {
    if (!rootNode.children || !rootNode.children.length) return false
    for (let i = 0; i < rootNode.children.length; i++) {
      const c = rootNode.children[i]
      if (c.id === targetId) return true
      if (containsDescendant(c, targetId)) return true
    }
    return false
  }

  function defaultGhost(nodes) {
    const el = ui.h('div', 'ef-ui-tree-ghost')
    const first = nodes[0]
    const lab = first.label != null ? String(first.label) : String(first.id)
    el.textContent = nodes.length > 1 ? (lab + '  + ' + (nodes.length - 1)) : lab
    return el
  }

  ui._treeDnd = {
    attach: function (rootEl, itemsSig, expandedSig, flatSig, dnd, treeCtx) {
      if (typeof dnd.onDrop !== 'function') {
        console.warn('[ui.tree] dnd enabled but onDrop missing — DnD disabled')
        return
      }
      const canDrag       = typeof dnd.canDrag === 'function' ? dnd.canDrag : function () { return true }
      const canDrop       = typeof dnd.canDrop === 'function' ? dnd.canDrop : function () { return true }
      const getDragData   = typeof dnd.getDragData === 'function' ? dnd.getDragData : null
      const renderPreview = typeof dnd.renderDragPreview === 'function' ? dnd.renderDragPreview : defaultGhost
      const dropZonesFn   = typeof dnd.dropZones === 'function' ? dnd.dropZones : null
      const autoExpandDelay = dnd.autoExpandDelay != null ? dnd.autoExpandDelay : 500

      // Delegated pointerdown on the whole tree. Per-row listeners exist too
      // (for click/dblclick), but the drag session captures globally at
      // pointerdown to stay active even when the cursor leaves the tree bounds.
      rootEl.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return
        const rowEl = nearestRow(rootEl, ev.clientX, ev.clientY)
        if (!rowEl) return
        const id = rowEl.dataset.treeNodeId
        if (!id) return
        const flat = flatSig.peek()
        const row = flat.find(function (r) { return String(r.node.id) === String(id) })
        if (!row) return
        if (!canDrag(row.node, row)) return

        // Determine source set — multi-select aware. If the dragged row is
        // part of the current selection (Finder semantics), drag the whole
        // selection; otherwise just the clicked row. Reading selection via
        // the tree's bridge avoids duplicating the single/multi shape logic.
        const selSet = treeCtx.readSelSet()
        const dragNodes = selSet.has(row.node.id)
          ? flat.filter(function (r) { return selSet.has(r.node.id) && canDrag(r.node, r) }).map(function (r) { return r.node })
          : [row.node]

        // Wait for threshold before committing to a drag. Clicks below the
        // threshold are handed back to the row's click handler untouched.
        const startX = ev.clientX, startY = ev.clientY
        const th = dragThreshold()
        let armed = false
        let session = null

        function onMove(e) {
          if (!armed) {
            if (Math.abs(e.clientX - startX) < th && Math.abs(e.clientY - startY) < th) return
            armed = true
            session = startSession(e, dragNodes, row)
          }
          if (session) updateSession(session, e)
        }
        function onUp(e) {
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('keydown', onKey, true)
          if (session) finishSession(session, e, false)
        }
        function onKey(e) {
          if (e.key === 'Escape' && session) {
            finishSession(session, null, true)
            window.removeEventListener('pointermove', onMove, true)
            window.removeEventListener('pointerup', onUp, true)
            window.removeEventListener('keydown', onKey, true)
          }
        }
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('keydown', onKey, true)
      })

      // Portal — ghost and indicator live at the document level so they're
      // not clipped by the tree's overflow:auto. We bail on the full
      // portal infrastructure: a single positioned div is enough.
      function makePortal() {
        const p = ui.h('div', 'ef-ui-tree-dnd-portal')
        p.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
        document.body.appendChild(p)
        return p
      }

      function startSession(ev, dragNodes, initialRow) {
        const portal = makePortal()
        const ghost = renderPreview(dragNodes)
        ghost.classList.add('ef-ui-tree-ghost-wrap')
        portal.appendChild(ghost)
        // Indicator has two visual modes (line vs outline) — we toggle a
        // class on the same element instead of maintaining two nodes.
        const indicator = ui.h('div', 'ef-ui-tree-drop-indicator')
        portal.appendChild(indicator)

        const dragData = getDragData
          ? getDragData(dragNodes)
          : { types: ['ef.tree/node'], payload: dragNodes.map(function (n) { return n.id }) }

        // Dim the source rows so the user can tell what's being moved.
        const sourceIds = new Set(dragNodes.map(function (n) { return n.id }))
        treeCtx._flat = flatSig  // (retained reference for virtualizer hooks)
        applySourceDim(sourceIds, true)

        const session = {
          portal: portal, ghost: ghost, indicator: indicator,
          dragNodes: dragNodes, dragData: dragData,
          sourceIds: sourceIds,
          hover: null,             // { row, rowEl, position, allowed }
          autoExpandId: null, autoExpandTimer: 0,
          autoScrollRaf: 0, scrollVelocity: 0,
        }
        positionGhost(session, ev)
        return session
      }

      function applySourceDim(ids, on) {
        // Decorate row elements currently in the virtualizer cache so the
        // user gets immediate feedback. Scrolled-out rows are recreated by
        // the virtualizer without the class — sourceIds is checked again
        // via a global CSS [data-dragging-id] match on re-render. Simpler:
        // brute-force toggle classes on cached rows only, and accept that
        // a row scrolling back in mid-drag won't be dimmed (edge case).
        treeCtx && treeCtx._rowCache && null  // reserved for a future pass
        const cache = rootEl.__efTree && rootEl.__efTree._rowCache
        if (!cache) return
        cache.forEach(function (entry) {
          if (ids.has(entry.row.node.id)) entry.el.classList.toggle('ef-ui-tree-row-dragging', on)
        })
      }

      function positionGhost(session, ev) {
        // Offset slightly from the cursor — matches native drag-image feel
        // and keeps the ghost from swallowing cursor targeting.
        session.ghost.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 8) + 'px)'
      }

      function zonesFor(node, row) {
        if (dropZonesFn) return dropZonesFn(node, row) || []
        const hasKids = !!(node.children && node.children.length)
        // Leaf nodes still get "inside" by default (turning them into a
        // container is the caller's call via canDrop); drop this in dropZones
        // if you want strict leaf-no-inside semantics.
        return hasKids ? ['before', 'inside', 'after'] : ['before', 'inside', 'after']
      }

      function updateSession(session, ev) {
        positionGhost(session, ev)
        const rowEl = nearestRow(rootEl, ev.clientX, ev.clientY)
        if (!rowEl) { hideIndicator(session); session.hover = null; scheduleAutoScroll(session, ev); return }
        const id = rowEl.dataset.treeNodeId
        const flat = flatSig.peek()
        const row = flat.find(function (r) { return String(r.node.id) === String(id) })
        if (!row) { hideIndicator(session); session.hover = null; return }

        // Cycle guard — silently reject targets that are the dragged node
        // itself or any of its descendants.
        let blockedByCycle = false
        for (let i = 0; i < session.dragNodes.length; i++) {
          const dn = session.dragNodes[i]
          if (row.node.id === dn.id || containsDescendant(dn, row.node.id)) { blockedByCycle = true; break }
        }

        const zones = blockedByCycle ? [] : zonesFor(row.node, row)
        const position = zones.length ? classifyPosition(rowEl, ev.clientX, ev.clientY, zones) : null
        let allowed = !blockedByCycle && !!position
        if (allowed) allowed = !!canDrop(row.node, position, session.dragData)

        session.hover = { row: row, rowEl: rowEl, position: position, allowed: allowed }
        paintIndicator(session)
        scheduleAutoExpand(session, row, position)
        scheduleAutoScroll(session, ev)
      }

      function hideIndicator(session) {
        session.indicator.style.display = 'none'
        session.indicator.classList.remove('ef-ui-tree-drop-inside')
        session.indicator.classList.remove('ef-ui-tree-drop-reject')
      }

      function paintIndicator(session) {
        const h = session.hover
        if (!h || !h.position) { hideIndicator(session); return }
        const rect = h.rowEl.getBoundingClientRect()
        const ind = session.indicator
        ind.style.display = 'block'
        ind.classList.toggle('ef-ui-tree-drop-reject', !h.allowed)
        if (h.position === 'inside') {
          ind.classList.add('ef-ui-tree-drop-inside')
          ind.style.left = rect.left + 'px'
          ind.style.top = rect.top + 'px'
          ind.style.width = rect.width + 'px'
          ind.style.height = rect.height + 'px'
        } else {
          ind.classList.remove('ef-ui-tree-drop-inside')
          const y = h.position === 'before' ? rect.top : rect.bottom
          ind.style.left = rect.left + 'px'
          ind.style.top = (y - 1) + 'px'
          ind.style.width = rect.width + 'px'
          ind.style.height = '2px'
        }
      }

      function scheduleAutoExpand(session, row, position) {
        if (!autoExpandDelay) return
        // Only auto-expand when hovering 'inside' a collapsed container —
        // the user's intent ("I want to dive deeper") is clear only then.
        const wantId = (position === 'inside' && !row.expanded) ? row.node.id : null
        if (wantId === session.autoExpandId) return
        if (session.autoExpandTimer) { clearTimeout(session.autoExpandTimer); session.autoExpandTimer = 0 }
        session.autoExpandId = wantId
        if (!wantId) return
        session.autoExpandTimer = setTimeout(function () {
          const cur = expandedSig.peek()
          const next = new Set(cur)
          next.add(wantId)
          expandedSig.set(next)
          session.autoExpandTimer = 0
        }, autoExpandDelay)
      }

      function scheduleAutoScroll(session, ev) {
        const rect = rootEl.getBoundingClientRect()
        const margin = 24
        let v = 0
        if (ev.clientY < rect.top + margin)    v = -((rect.top + margin) - ev.clientY) / 2
        else if (ev.clientY > rect.bottom - margin) v = (ev.clientY - (rect.bottom - margin)) / 2
        session.scrollVelocity = v
        if (v && !session.autoScrollRaf) {
          const step = function () {
            if (!session.scrollVelocity) { session.autoScrollRaf = 0; return }
            rootEl.scrollTop += session.scrollVelocity
            session.autoScrollRaf = requestAnimationFrame(step)
          }
          session.autoScrollRaf = requestAnimationFrame(step)
        }
      }

      function finishSession(session, ev, cancelled) {
        // Commit (or not), then unconditionally clean up to avoid leaks.
        if (!cancelled && session.hover && session.hover.allowed) {
          if (session.hover.position === 'inside') {
            const cur = expandedSig.peek()
            const next = new Set(cur)
            next.add(session.hover.row.node.id)
            expandedSig.set(next)
          }
          try {
            dnd.onDrop(session.hover.row.node, session.hover.position, session.dragData)
          } catch (e) {
            console.error('[ui.tree] onDrop threw', e)
          }
        }
        if (session.autoExpandTimer) clearTimeout(session.autoExpandTimer)
        if (session.autoScrollRaf) cancelAnimationFrame(session.autoScrollRaf)
        session.scrollVelocity = 0
        applySourceDim(session.sourceIds, false)
        if (session.portal && session.portal.parentNode) session.portal.parentNode.removeChild(session.portal)
      }
    },
  }
})(window.EF = window.EF || {})
