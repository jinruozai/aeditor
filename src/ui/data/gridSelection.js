// aeditor.ui.gridSelection — pointer selection, marquee, and reorder for grid-like collections.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.gridSelection = function (container, opts) {
    const o = opts || {}
    const state = {
      selected: new Set(o.initialSelection || []),
      lastClicked: o.initialLast || ((o.initialSelection || [])[0] || null),
      pointerId: null,
      isMouseDown: false,
      isDragging: false,
      downPos: null,
      downItem: null,
      downId: null,
      marquee: null,
      marqueeStart: null,
      marqueeBase: null,
      ghost: null,
      dropIndicator: null,
      dropTargetId: null,
      dropSide: null,
    }
    const itemSelector = o.itemSelector || '[data-id]'
    const selectedClass = o.selectedClass || 'is-selected'
    const draggingClass = o.draggingClass || 'is-dragging'
    const threshold = o.threshold || 5

    function idFor(el) {
      return o.getId ? o.getId(el) : el.dataset.id
    }

    function itemAt(ev) {
      const target = ev.target.closest && ev.target.closest(itemSelector)
      return target && container.contains(target) ? target : null
    }

    function itemsList() {
      return Array.prototype.slice.call(container.querySelectorAll(itemSelector))
    }

    function paintSelection() {
      itemsList().forEach(function (el) {
        el.classList.toggle(selectedClass, state.selected.has(idFor(el)))
      })
    }

    function commitSelection() {
      paintSelection()
      if (o.onSelect) o.onSelect(Array.from(state.selected), state.lastClicked)
    }

    function setSingle(id) {
      state.selected.clear()
      if (id) state.selected.add(id)
      commitSelection()
    }

    function cleanupArtifacts() {
      if (state.marquee) { state.marquee.remove(); state.marquee = null }
      if (state.ghost) { state.ghost.remove(); state.ghost = null }
      if (state.dropIndicator) { state.dropIndicator.remove(); state.dropIndicator = null }
      itemsList().forEach(function (el) { el.classList.remove(draggingClass) })
      state.marqueeStart = null
      state.marqueeBase = null
      state.isMouseDown = false
      state.isDragging = false
      state.dropTargetId = null
      state.dropSide = null
    }

    function point(ev) {
      const rect = container.getBoundingClientRect()
      return {
        x: ev.clientX - rect.left + container.scrollLeft,
        y: ev.clientY - rect.top + container.scrollTop,
      }
    }

    function onPointerDown(ev) {
      if (ev.button !== 0) return
      try { container.setPointerCapture(ev.pointerId) } catch (_) {}
      const item = itemAt(ev)
      state.pointerId = ev.pointerId
      state.isMouseDown = true
      state.isDragging = false
      state.downPos = { x: ev.clientX, y: ev.clientY }
      state.downItem = item
      state.downId = item ? idFor(item) : null

      if (!item) {
        if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
          state.selected.clear()
          state.lastClicked = null
          commitSelection()
        }
        state.marqueeBase = new Set(state.selected)
        state.marqueeStart = point(ev)
      }
    }

    function onPointerMove(ev) {
      if (!state.isMouseDown) return
      const dx = ev.clientX - state.downPos.x
      const dy = ev.clientY - state.downPos.y
      const dist = Math.hypot(dx, dy)

      if (state.marqueeStart) {
        updateMarquee(ev)
        return
      }

      if (state.downItem && !state.isDragging && dist > threshold && o.onReorder) beginDrag()
      if (state.isDragging) updateDrag(ev)
    }

    function updateMarquee(ev) {
      const cur = point(ev)
      const x1 = Math.min(state.marqueeStart.x, cur.x)
      const y1 = Math.min(state.marqueeStart.y, cur.y)
      const x2 = Math.max(state.marqueeStart.x, cur.x)
      const y2 = Math.max(state.marqueeStart.y, cur.y)
      if (!state.marquee) {
        state.marquee = ui.h('div', 'aeditor-ui-grid-marquee')
        container.appendChild(state.marquee)
      }
      state.marquee.style.left = x1 + 'px'
      state.marquee.style.top = y1 + 'px'
      state.marquee.style.width = (x2 - x1) + 'px'
      state.marquee.style.height = (y2 - y1) + 'px'

      const rect = container.getBoundingClientRect()
      const next = new Set(state.marqueeBase)
      itemsList().forEach(function (el) {
        const r = el.getBoundingClientRect()
        const cx = r.left - rect.left + container.scrollLeft + r.width / 2
        const cy = r.top - rect.top + container.scrollTop + r.height / 2
        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) next.add(idFor(el))
        else if (!(ev.ctrlKey || ev.metaKey)) next.delete(idFor(el))
      })
      state.selected = next
      paintSelection()
    }

    function beginDrag() {
      state.isDragging = true
      if (!state.selected.has(state.downId)) {
        setSingle(state.downId)
        state.lastClicked = state.downId
      }
      itemsList().forEach(function (el) {
        if (state.selected.has(idFor(el))) el.classList.add(draggingClass)
      })
      state.ghost = ui.h('div', 'aeditor-ui-grid-drag-ghost', { text: ghostText() })
      document.body.appendChild(state.ghost)
      state.dropIndicator = ui.h('div', 'aeditor-ui-grid-drop-indicator')
      container.appendChild(state.dropIndicator)
    }

    function ghostText() {
      if (o.ghostText) return o.ghostText(Array.from(state.selected))
      return state.selected.size > 1 ? state.selected.size + ' items' : (state.downId || '')
    }

    function updateDrag(ev) {
      state.ghost.style.left = ev.clientX + 'px'
      state.ghost.style.top = ev.clientY + 'px'
      const candidates = itemsList().filter(function (el) { return !state.selected.has(idFor(el)) })
      let bestIdx = candidates.length
      let bestDist = Infinity
      let bestRect = null
      let bestSide = 'before'
      candidates.forEach(function (el, i) {
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const d = Math.hypot(ev.clientX - cx, ev.clientY - cy)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
          bestRect = r
          bestSide = ev.clientX < cx ? 'before' : 'after'
        }
      })
      if (!bestRect) {
        state.dropIndicator.style.display = 'none'
        state.dropTargetId = null
        state.dropSide = null
        return
      }
      const pRect = container.getBoundingClientRect()
      const x = bestSide === 'before' ? bestRect.left : bestRect.right
      state.dropIndicator.style.display = 'block'
      state.dropIndicator.style.left = (x - pRect.left + container.scrollLeft - 1) + 'px'
      state.dropIndicator.style.top = (bestRect.top - pRect.top + container.scrollTop) + 'px'
      state.dropIndicator.style.width = '2px'
      state.dropIndicator.style.height = bestRect.height + 'px'
      state.dropTargetId = candidates[bestIdx] ? idFor(candidates[bestIdx]) : null
      state.dropSide = bestSide
    }

    function endPointer(ev) {
      if (!state.isMouseDown) return
      state.isMouseDown = false
      try { container.releasePointerCapture(state.pointerId) } catch (_) {}
      state.pointerId = null

      if (state.marquee) {
        state.marquee.remove()
        state.marquee = null
        state.marqueeStart = null
        state.marqueeBase = null
        commitSelection()
        return
      }

      if (state.isDragging) {
        const dragged = Array.from(state.selected)
        const targetId = state.dropTargetId
        const side = state.dropSide
        cleanupArtifacts()
        if (o.onReorder) o.onReorder(dragged, targetId, side)
        return
      }

      if (state.downItem) selectPointerUp(ev)
    }

    function selectPointerUp(ev) {
      const id = state.downId
      if (ev.ctrlKey || ev.metaKey) {
        if (state.selected.has(id)) state.selected.delete(id)
        else state.selected.add(id)
        state.lastClicked = id
      } else if (ev.shiftKey && state.lastClicked) {
        const items = itemsList()
        const lastIdx = items.findIndex(function (el) { return idFor(el) === state.lastClicked })
        const curIdx = items.findIndex(function (el) { return idFor(el) === id })
        if (lastIdx >= 0 && curIdx >= 0) {
          state.selected.clear()
          const from = Math.min(lastIdx, curIdx)
          const to = Math.max(lastIdx, curIdx)
          for (let i = from; i <= to; i++) state.selected.add(idFor(items[i]))
        }
      } else {
        setSingle(id)
        state.lastClicked = id
        commitSelection()
        return
      }
      commitSelection()
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', endPointer)
    container.addEventListener('pointercancel', endPointer)
    paintSelection()

    return {
      clearSelection: function () {
        state.selected.clear()
        state.lastClicked = null
        commitSelection()
      },
      selectOnly: function (id) {
        state.selected.clear()
        if (id) state.selected.add(id)
        state.lastClicked = id
        commitSelection()
      },
      getSelection: function () { return Array.from(state.selected) },
      dispose: function () {
        container.removeEventListener('pointerdown', onPointerDown)
        container.removeEventListener('pointermove', onPointerMove)
        container.removeEventListener('pointerup', endPointer)
        container.removeEventListener('pointercancel', endPointer)
        try { if (state.pointerId != null) container.releasePointerCapture(state.pointerId) } catch (_) {}
        state.pointerId = null
        cleanupArtifacts()
      },
    }
  }
})(window.aeditor = window.aeditor || {})
