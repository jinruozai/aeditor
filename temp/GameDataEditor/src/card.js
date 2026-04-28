/**
 * Card rendering + grid interactions.
 *
 * Card content is described by a project-level cardStyle (a UI tree) —
 * State.projectCardStyles[<key>].root. The table picks a key via
 * tableMap[pk].card_style; missing key → 'default'. Each card renders
 * via EF.ui.renderUITree(root, { data: entitySig }), with bindings
 * pulling fields off the entity reactively.
 *
 * Exposed:
 *   Card.render(entity, id, pathKey) → HTMLElement
 *   Card.attachGrid(container, opts)  — selection / marquee / drag-sort
 */
(function () {
  'use strict';

  function render(entity, id, pathKey) {
    var card = document.createElement('div');
    card.className = 'gde-card';
    card.dataset.id = id;

    var cs = State.resolveCardStyleForTable(pathKey);
    if (!cs || !cs.root) return card;   // empty card — explicit by design

    // The card's outer dimensions match the cardStyle's root size so the
    // grid track is exactly the card and the inner absolute container
    // fills it edge-to-edge — no aspect-ratio mismatch, no transparent
    // frame, no clipped overflow.
    var rp = cs.root.props || {};
    if (rp.width  != null) card.style.width  = (typeof rp.width  === 'number' ? rp.width  + 'px' : rp.width);
    if (rp.height != null) card.style.height = (typeof rp.height === 'number' ? rp.height + 'px' : rp.height);

    var entitySig = EF.signal(entity || {});
    card.__efEntitySig = entitySig;     // tabledata can update without rebuild

    var inner = EF.ui.renderUITree(cs.root, { data: entitySig });
    inner.classList.add('gde-card-inner');
    card.appendChild(inner);
    return card;
  }

  // -----------------------------
  // Grid interaction (unchanged from prior — pure DOM/pointer logic)
  // -----------------------------
  function attachGrid(container, opts) {
    var state = {
      selected: new Set(),
      lastClicked: null,
      isMouseDown: false,
      downPos: null,
      downTarget: null,
      downTargetId: null,
      marquee: null,
      marqueeStart: null,
      marqueeBaseSel: null,
      isDragging: false,
      ghost: null,
      dropIndicator: null,
      dropIndex: -1,
    };

    function cardAt(ev) {
      var el = ev.target;
      while (el && el !== container) {
        if (el.classList && el.classList.contains('gde-card')) return el;
        el = el.parentElement;
      }
      return null;
    }
    function cardsList() { return Array.from(container.querySelectorAll('.gde-card')); }
    function commitSelection() {
      cardsList().forEach(function (c) {
        c.classList.toggle('is-selected', state.selected.has(c.dataset.id));
      });
      if (opts.onSelect) opts.onSelect(Array.from(state.selected), state.lastClicked);
    }
    function setSingle(id) {
      state.selected.clear();
      if (id) state.selected.add(id);
      commitSelection();
    }

    container.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      try { container.setPointerCapture(ev.pointerId); } catch (_) {}
      state.pointerId = ev.pointerId;
      var card = cardAt(ev);
      state.isMouseDown = true;
      state.downPos = { x: ev.clientX, y: ev.clientY };
      state.downTarget = card;
      state.downTargetId = card ? card.dataset.id : null;
      state.isDragging = false;

      if (!card) {
        if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
          state.selected.clear();
          state.lastClicked = null;
          commitSelection();
        }
        state.marqueeBaseSel = new Set(state.selected);
        var rect = container.getBoundingClientRect();
        state.marqueeStart = {
          x: ev.clientX - rect.left + container.scrollLeft,
          y: ev.clientY - rect.top + container.scrollTop,
        };
      }
    });

    container.addEventListener('pointermove', function (ev) {
      if (!state.isMouseDown) return;
      var dx = ev.clientX - state.downPos.x;
      var dy = ev.clientY - state.downPos.y;
      var dist = Math.hypot(dx, dy);

      if (state.marqueeStart) {
        if (!state.marquee) {
          state.marquee = document.createElement('div');
          state.marquee.className = 'gde-marquee';
          container.appendChild(state.marquee);
        }
        var rect = container.getBoundingClientRect();
        var cx = ev.clientX - rect.left + container.scrollLeft;
        var cy = ev.clientY - rect.top + container.scrollTop;
        var x1 = Math.min(state.marqueeStart.x, cx);
        var y1 = Math.min(state.marqueeStart.y, cy);
        var x2 = Math.max(state.marqueeStart.x, cx);
        var y2 = Math.max(state.marqueeStart.y, cy);
        state.marquee.style.left = x1 + 'px';
        state.marquee.style.top = y1 + 'px';
        state.marquee.style.width = (x2 - x1) + 'px';
        state.marquee.style.height = (y2 - y1) + 'px';
        var next = new Set(state.marqueeBaseSel);
        cardsList().forEach(function (c) {
          var cr = c.getBoundingClientRect();
          var ccx = cr.left - rect.left + container.scrollLeft + cr.width / 2;
          var ccy = cr.top - rect.top + container.scrollTop + cr.height / 2;
          if (ccx >= x1 && ccx <= x2 && ccy >= y1 && ccy <= y2) next.add(c.dataset.id);
          else if (!(ev.ctrlKey || ev.metaKey)) next.delete(c.dataset.id);
        });
        state.selected = next;
        commitSelection();
        return;
      }

      if (state.downTarget && !state.isDragging && dist > 5) {
        state.isDragging = true;
        if (!state.selected.has(state.downTargetId)) {
          setSingle(state.downTargetId);
          state.lastClicked = state.downTargetId;
        }
        cardsList().forEach(function (c) {
          if (state.selected.has(c.dataset.id)) c.classList.add('is-dragging');
        });
        var g = document.createElement('div');
        g.className = 'gde-drag-ghost';
        g.textContent = state.selected.size > 1
          ? state.selected.size + ' items' : state.downTargetId;
        document.body.appendChild(g);
        state.ghost = g;
        var ind = document.createElement('div');
        ind.className = 'gde-drop-indicator';
        container.appendChild(ind);
        state.dropIndicator = ind;
      }
      if (state.isDragging) {
        state.ghost.style.left = ev.clientX + 'px';
        state.ghost.style.top = ev.clientY + 'px';
        var cards = cardsList().filter(function (c) { return !state.selected.has(c.dataset.id); });
        var rect = container.getBoundingClientRect();
        var bestIdx = cards.length, bestDist = Infinity, bestRect = null, bestSide = 'before';
        cards.forEach(function (c, i) {
          var r = c.getBoundingClientRect();
          var cx = r.left + r.width / 2;
          var cy = r.top + r.height / 2;
          var d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
          if (d < bestDist) {
            bestDist = d; bestIdx = i; bestRect = r;
            bestSide = (ev.clientX < cx) ? 'before' : 'after';
          }
        });
        if (bestRect) {
          var pRect = container.getBoundingClientRect();
          var ix = bestSide === 'before' ? bestRect.left : bestRect.right;
          state.dropIndicator.style.display = 'block';
          state.dropIndicator.style.left = (ix - pRect.left + container.scrollLeft - 1) + 'px';
          state.dropIndicator.style.top = (bestRect.top - pRect.top + container.scrollTop) + 'px';
          state.dropIndicator.style.width = '2px';
          state.dropIndicator.style.height = bestRect.height + 'px';
          state.dropIndex = bestSide === 'before' ? bestIdx : bestIdx + 1;
          state.dropTargetId = cards[bestIdx] ? cards[bestIdx].dataset.id : null;
          state.dropSide = bestSide;
        } else {
          state.dropIndicator.style.display = 'none';
          state.dropIndex = -1;
        }
      }
    });

    function endPointer(ev) {
      if (!state.isMouseDown) return;
      state.isMouseDown = false;
      try { container.releasePointerCapture(state.pointerId); } catch (_) {}
      state.pointerId = null;

      if (state.marquee) {
        state.marquee.remove();
        state.marquee = null;
        state.marqueeStart = null;
        state.marqueeBaseSel = null;
        return;
      }

      if (state.isDragging) {
        var draggedIds = Array.from(state.selected);
        cardsList().forEach(function (c) { c.classList.remove('is-dragging'); });
        if (state.ghost) { state.ghost.remove(); state.ghost = null; }
        if (state.dropIndicator) { state.dropIndicator.remove(); state.dropIndicator = null; }
        state.isDragging = false;
        if (opts.onReorder && state.dropTargetId !== undefined) {
          opts.onReorder(draggedIds, state.dropTargetId, state.dropSide);
        }
        state.dropTargetId = null;
        state.dropSide = null;
        return;
      }

      if (state.downTarget) {
        var id = state.downTargetId;
        if (ev.ctrlKey || ev.metaKey) {
          if (state.selected.has(id)) state.selected.delete(id);
          else state.selected.add(id);
          state.lastClicked = id;
        } else if (ev.shiftKey && state.lastClicked) {
          var cards = cardsList();
          var lastIdx = cards.findIndex(function (c) { return c.dataset.id === state.lastClicked; });
          var curIdx = cards.findIndex(function (c) { return c.dataset.id === id; });
          if (lastIdx >= 0 && curIdx >= 0) {
            state.selected.clear();
            var from = Math.min(lastIdx, curIdx), to = Math.max(lastIdx, curIdx);
            for (var i = from; i <= to; i++) state.selected.add(cards[i].dataset.id);
          }
        } else {
          setSingle(id);
          state.lastClicked = id;
          commitSelection();
          return;
        }
        commitSelection();
      }
    }
    container.addEventListener('pointerup',     endPointer);
    container.addEventListener('pointercancel', endPointer);

    return {
      clearSelection: function () {
        state.selected.clear();
        state.lastClicked = null;
        commitSelection();
      },
      selectOnly: function (id) { setSingle(id); state.lastClicked = id; },
      getSelection: function () { return Array.from(state.selected); },
    };
  }

  window.Card = { render: render, attachGrid: attachGrid };
})();
