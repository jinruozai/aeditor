/**
 * CardStyle editor — main dock panel. Toolbar + canvas. The canvas
 * renders the cardStyle's root via EF.ui.renderUITree and accepts drops
 * of palette components to add new TreeNodes.
 *
 * The panel binds to a styleKey via panel props (set by the cardstyle-list
 * tile click); changing styleKey is handled by opening a different panel.
 *
 * Toolbar:
 *   [name] · [size info] · preview source [▾]
 *
 * Canvas:
 *   - sized to root.props.width × root.props.height
 *   - dropzone for application/ef.component+json
 *   - clicking a child marks it selected (for inspector)
 */
(function () {
  'use strict';

  var ui = EF.ui;
  var nextId = 1;
  function uid(prefix) { return (prefix || 'n') + '-' + (nextId++) + '-' + Date.now().toString(36); }

  function findNode(root, id, parent, idx) {
    if (!root) return null;
    if (root.id === id) return { node: root, parent: parent, index: idx };
    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) {
      var hit = findNode(kids[i], id, root, i);
      if (hit) return hit;
    }
    return null;
  }

  // Build a fresh TreeNode from a component name. Containers start empty
  // and inherit a sensible default size from defaultProps.
  function nodeFromComponent(name) {
    var spec = EF.resolveComponent(name);
    return {
      id:        uid(name),
      type:      name,
      props:     Object.assign({}, spec.defaultProps || {}),
      bindings:  {},
      children:  spec.acceptsChildren ? [] : [],
      // Default placement — the absolute container's child slots interpret
      // layout; flex containers ignore it.
      layout:    { anchor: 'tl', x: 8, y: 8, w: 80, h: 24, unit: 'px' },
    };
  }

  function factory(propsSig, ctx) {
    var root = ui.h('div', 'gde-cs-editor');
    var styleKey = (propsSig.peek() || {}).styleKey;

    var bar = ui.h('div', 'gde-cs-editor-bar');
    var nameEl = ui.h('div', 'gde-cs-editor-name', { text: '' });
    var sizeEl = ui.h('div', 'gde-cs-editor-size', { text: '' });
    bar.appendChild(nameEl); bar.appendChild(sizeEl);

    // Zoom — applied to canvas via CSS transform. Range chosen wide enough
    // to peek at small text + back out to layout overview without becoming
    // a scrubbable axis (numberInput is a deliberate two-click affair).
    var zoom = EF.signal(100);
    var zoomEl = ui.numberInput({ value: zoom, min: 25, max: 400, step: 25, precision: 0 });
    var zoomWrap = ui.h('div', 'gde-cs-editor-zoom');
    zoomWrap.appendChild(ui.h('span', 'gde-cs-editor-zoom-label', { text: 'Zoom %' }));
    zoomWrap.appendChild(zoomEl);
    bar.appendChild(zoomWrap);

    root.appendChild(bar);

    var stage = ui.h('div', 'gde-cs-stage');
    root.appendChild(stage);

    var canvas = ui.h('div', 'gde-cs-canvas');
    stage.appendChild(canvas);
    EF.effect(function () {
      var z = Math.max(25, Math.min(400, Number(zoom()) || 100)) / 100;
      canvas.style.transform = 'scale(' + z + ')';
      canvas.style.transformOrigin = 'center';
    });

    // Wheel / trackpad-pinch → zoom. Step is proportional to current zoom
    // so the perceived speed stays constant at any level (logarithmic
    // feel — many editors do the same). preventDefault stops the page
    // from scrolling underneath us; the stage doesn't need natural scroll
    // because zoom is the primary interaction here.
    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var current = Number(zoom.peek()) || 100;
      var step = Math.max(2, current * 0.1);          // 10% of current, floored
      var next = current + Math.sign(-ev.deltaY) * step;
      zoom.set(Math.max(25, Math.min(400, Math.round(next))));
    }, { passive: false });

    // Sample-row signal — uses the first table's first entity if any
    // exists, otherwise just '#sample' so bindings resolve to undefined
    // (and the renderer paints blanks). The cardstyle is meant to work
    // against any compatible struct; the editor doesn't bind to a
    // specific table.
    var sampleSig = EF.derived(function () {
      var tm = State.tableMap();
      var keys = Object.keys(tm);
      for (var i = 0; i < keys.length; i++) {
        var t = tm[keys[i]];
        if (t && t.id && t.id.length) {
          var firstId = t.id[0];
          var data = State.gameData();
          return Object.assign({ id: firstId }, data[firstId] || {});
        }
      }
      return { id: '#sample' };
    });

    function rerender() {
      var cs = State.projectCardStyles()[styleKey];
      canvas.innerHTML = '';
      if (!cs) {
        nameEl.textContent = '(missing cardStyle: ' + styleKey + ')';
        sizeEl.textContent = '';
        return;
      }
      nameEl.textContent = cs.name || styleKey;
      var w = (cs.root && cs.root.props && cs.root.props.width) || 120;
      var h = (cs.root && cs.root.props && cs.root.props.height) || 120;
      sizeEl.textContent = w + ' × ' + h;
      if (!cs.root) {
        canvas.appendChild(ui.h('div', 'gde-cs-canvas-empty', {
          text: 'Drop a Layout component here to begin.',
        }));
        return;
      }
      var inner = ui.renderUITree(cs.root, { data: sampleSig });
      // Mark each rendered child with its node id so click → select works.
      annotateIds(inner, cs.root);
      canvas.appendChild(inner);
    }

    // Tag exactly one DOM element per TreeNode with data-node-id. For
    // absolute children that's the slot wrapper (it owns the layout — drag
    // and resize affect it). For vbox / hbox / leaf children that's the
    // editor element itself. Tagging two elements caused findSlot to pick
    // the wrong one and handles never mounted.
    function annotateIds(rootEl, rootNode) {
      if (!rootNode) return;
      rootEl.dataset.nodeId = rootNode.id;
      walkChildrenIds(rootEl, rootNode);
    }
    function walkChildrenIds(domEl, treeNode) {
      var spec; try { spec = EF.resolveComponent(treeNode.type); } catch (_) {}
      if (!spec || !spec.acceptsChildren || !treeNode.children) return;
      if (treeNode.type === 'absolute') {
        var slots = Array.from(domEl.querySelectorAll(':scope > .ef-ui-abs-slot'));
        slots.forEach(function (slot, i) {
          var childNode = treeNode.children[i];
          if (!childNode) return;
          slot.dataset.nodeId = childNode.id;
          // Recurse into the inner editor for grand-children.
          if (slot.firstElementChild) walkChildrenIds(slot.firstElementChild, childNode);
        });
      } else {
        var kids = Array.from(domEl.children);
        kids.forEach(function (kidEl, i) {
          var childNode = treeNode.children[i];
          if (!childNode) return;
          kidEl.dataset.nodeId = childNode.id;
          walkChildrenIds(kidEl, childNode);
        });
      }
    }

    // Plain / ctrl-cmd / shift click parity with ui.list & ui.tree. Range
    // ordering uses a DFS-preorder of the cardStyle tree (the same order
    // children paint in, so a "shift over visible nodes" feel maps
    // intuitively to the array slice).
    var anchorId = null;
    canvas.addEventListener('click', function (ev) {
      // The pointerup that ends a drag fires a click immediately after.
      // dragSuppressClick is set right before we commit and cleared on the
      // next tick, so clicks induced by drags don't reshape the selection.
      if (dragSuppressClick) return;
      var t = ev.target;
      var clickedId = null;
      while (t && t !== canvas) {
        if (t.dataset && t.dataset.nodeId) { clickedId = t.dataset.nodeId; break; }
        t = t.parentElement;
      }
      if (!clickedId) {
        // Click on canvas blank deselects everything. The cardStyle's
        // own meta is editable from the cardstyle-list panel, not here.
        State.setSelection(null);
        anchorId = null;
        return;
      }
      var sel = State.selection();
      var cur = (sel && sel.kind === 'card_component' && sel.styleKey === styleKey)
        ? (sel.nodeIds || []) : [];
      var next;
      if (ev.shiftKey && anchorId) {
        var order = collectIds();
        var i = order.indexOf(anchorId), j = order.indexOf(clickedId);
        if (i < 0 || j < 0) { next = [clickedId]; anchorId = clickedId; }
        else { var lo = Math.min(i, j), hi = Math.max(i, j); next = order.slice(lo, hi + 1); }
      } else if (ev.metaKey || ev.ctrlKey) {
        var idx = cur.indexOf(clickedId);
        next = idx >= 0 ? cur.filter(function (x) { return x !== clickedId; }) : cur.concat([clickedId]);
        anchorId = clickedId;
      } else {
        next = [clickedId];
        anchorId = clickedId;
      }
      State.setSelection({ kind: 'card_component', styleKey: styleKey, nodeIds: next });
    });

    function collectIds() {
      var cs = State.projectCardStyles()[styleKey]; if (!cs || !cs.root) return [];
      var out = [];
      (function walk(n) { if (!n) return; out.push(n.id); (n.children || []).forEach(walk); })(cs.root);
      return out;
    }

    // Drop palette components onto canvas. Find target node by hit-testing
    // ancestors with dataset.nodeId; fall back to root.
    canvas.addEventListener('dragover', function (ev) {
      var ok = ev.dataTransfer && Array.from(ev.dataTransfer.types).indexOf('application/ef.component+json') >= 0;
      if (ok) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; }
    });
    canvas.addEventListener('drop', function (ev) {
      var raw = ev.dataTransfer && ev.dataTransfer.getData('application/ef.component+json');
      if (!raw) return;
      ev.preventDefault();
      var payload = null; try { payload = JSON.parse(raw); } catch (_) { return; }
      if (!payload || !payload.name) return;

      var cs = State.projectCardStyles()[styleKey]; if (!cs) return;
      var clone = JSON.parse(JSON.stringify(cs));
      // Empty cardStyle: drop becomes the root.
      if (!clone.root) {
        clone.root = nodeFromComponent(payload.name);
        delete clone.root.layout;  // root has no parent layout
        State.upsertCardStyle(styleKey, clone);
        return;
      }
      // Find the most specific accepting ancestor under cursor.
      var targetId = clone.root.id;
      var t = ev.target;
      while (t && t !== canvas) {
        if (t.dataset && t.dataset.nodeId) {
          var hit = findNode(clone.root, t.dataset.nodeId, null, -1);
          if (hit) {
            var s; try { s = EF.resolveComponent(hit.node.type); } catch (_) {}
            if (s && s.acceptsChildren) { targetId = hit.node.id; break; }
          }
        }
        t = t.parentElement;
      }
      var hit2 = findNode(clone.root, targetId, null, -1);
      if (!hit2) return;
      hit2.node.children = hit2.node.children || [];
      hit2.node.children.push(nodeFromComponent(payload.name));
      State.upsertCardStyle(styleKey, clone);
    });

    // ── WYSIWYG drag / resize ─────────────────────────────────────
    // Each render rebuilds slot elements, so we wire drag handlers per
    // node fresh each time. Only nodes inside an `absolute` container
    // (i.e. with a `layout` field carrying x/y/anchor/unit) participate;
    // flex children fall through to the click handler.
    //
    // First click on a node = select. Second click on the already-selected
    // node initiates drag. This matches Figma/Godot/the rest-of-the-world
    // muscle memory and keeps simple selection clicks free of jitter.
    var dragSuppressClick = false;

    // Each TreeNode has exactly one DOM element tagged with data-node-id;
    // for absolute children this IS the slot wrapper.
    function findSlot(nodeId) {
      var el = canvas.querySelector('[data-node-id="' + cssEscape(nodeId) + '"]');
      if (!el || !el.classList.contains('ef-ui-abs-slot')) return null;
      return el;
    }
    function cssEscape(s) { return String(s).replace(/(["\\])/g, '\\$1'); }
    function getZoom() {
      var m = /scale\(([\d.]+)\)/.exec(canvas.style.transform || '');
      return m ? parseFloat(m[1]) : 1;
    }

    function applySelectionAffordances() {
      // Clear stale handle wrappers + highlight class.
      Array.from(canvas.querySelectorAll('.gde-cs-handles')).forEach(function (h) { h.remove(); });
      Array.from(canvas.querySelectorAll('[data-node-id]')).forEach(function (el) {
        el.classList.remove('is-selected-node');
      });
      var sel = State.selection();
      var ids = (sel && sel.kind === 'card_component' && sel.styleKey === styleKey)
        ? (sel.nodeIds || []) : [];
      ids.forEach(function (id) {
        var inner = canvas.querySelector('[data-node-id="' + cssEscape(id) + '"]');
        if (inner) inner.classList.add('is-selected-node');
      });
      // Single-select with absolute layout → mount 8 resize handles.
      if (ids.length === 1) mountHandles(ids[0]);
    }

    function mountHandles(nodeId) {
      var slot = findSlot(nodeId);
      if (!slot) return;
      var wrap = ui.h('div', 'gde-cs-handles');
      ['n','s','e','w','ne','nw','se','sw'].forEach(function (h) {
        var d = ui.h('div', 'gde-cs-handle gde-cs-handle-' + h);
        d.dataset.handle = h;
        wrap.appendChild(d);
      });
      slot.appendChild(wrap);
      // Resize via handles
      wrap.addEventListener('pointerdown', function (ev) {
        if (!ev.target || !ev.target.dataset.handle) return;
        ev.stopPropagation(); ev.preventDefault();
        startResize(ev, slot, nodeId, ev.target.dataset.handle);
      });
      // Move via the slot body (only when the node is already selected,
      // which it is here since this handle wrapper is only mounted for
      // single-selection).
      slot.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest && ev.target.closest('.gde-cs-handle')) return;
        ev.preventDefault();
        startMove(ev, slot, nodeId);
      });
    }

    // Move + resize share the visual-only / commit-on-up shape: while
    // dragging we mutate slot.style directly so we don't trip a State
    // re-render every frame. State writes happen once on pointerup.
    function startMove(ev, slot, nodeId) {
      var cs = State.projectCardStyles()[styleKey];
      var hit = findNode(cs && cs.root, nodeId, null, -1);
      if (!hit || !hit.node.layout) return;
      var start = JSON.parse(JSON.stringify(hit.node.layout));
      var sx = ev.clientX, sy = ev.clientY;
      var z = getZoom();
      function move(e) {
        var dx = (e.clientX - sx) / z;
        var dy = (e.clientY - sy) / z;
        previewLayout(slot, withMove(start, dx, dy));
      }
      function up(e) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup',   up);
        var dx = (e.clientX - sx) / z;
        var dy = (e.clientY - sy) / z;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        dragSuppressClick = true;
        commitLayout(nodeId, withMove(start, Math.round(dx), Math.round(dy)));
        setTimeout(function () { dragSuppressClick = false; }, 0);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup',   up);
    }
    function startResize(ev, slot, nodeId, handle) {
      var cs = State.projectCardStyles()[styleKey];
      var hit = findNode(cs && cs.root, nodeId, null, -1);
      if (!hit || !hit.node.layout) return;
      var start = JSON.parse(JSON.stringify(hit.node.layout));
      var sx = ev.clientX, sy = ev.clientY;
      var z = getZoom();
      function move(e) {
        var dx = (e.clientX - sx) / z;
        var dy = (e.clientY - sy) / z;
        previewLayout(slot, withResize(start, dx, dy, handle));
      }
      function up(e) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup',   up);
        var dx = (e.clientX - sx) / z;
        var dy = (e.clientY - sy) / z;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        dragSuppressClick = true;
        commitLayout(nodeId, withResize(start, Math.round(dx), Math.round(dy), handle));
        setTimeout(function () { dragSuppressClick = false; }, 0);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup',   up);
    }

    // Translation in (x,y) for a layout — meaning depends on anchor
    // because anchored corners measure offsets in different directions.
    function withMove(layout, dx, dy) {
      var a = layout.anchor || 'tl';
      var nx = layout.x || 0, ny = layout.y || 0;
      // Mapping: when the anchor side is right/bottom the offset grows
      // *inward*, so a positive screen delta has to subtract from x/y.
      if (a === 'tr') { nx -= dx; ny += dy; }
      else if (a === 'bl') { nx += dx; ny -= dy; }
      else if (a === 'br') { nx -= dx; ny -= dy; }
      else { nx += dx; ny += dy; }            // tl / c
      return Object.assign({}, layout, { x: nx, y: ny });
    }
    function withResize(layout, dx, dy, h) {
      // Each handle adjusts one or two of {x,y,w,h} depending on which
      // side it represents. We only resize from sides that don't move
      // the anchor corner, so for anchor='tl' (the common case) e/se/s
      // grow w/h, n/nw/w shrink-and-translate. For other anchors the
      // mapping inverts symmetrically.
      var a = layout.anchor || 'tl';
      var w = layout.w || 0, hh = layout.h || 0;
      var x = layout.x || 0, y = layout.y || 0;
      var west  = h.indexOf('w') >= 0;
      var east  = h.indexOf('e') >= 0;
      var north = h.indexOf('n') >= 0;
      var south = h.indexOf('s') >= 0;
      // Width
      if (east)  { (a === 'tr' || a === 'br') ? (x -= dx, w += dx) : (w += dx); }
      if (west)  { (a === 'tl' || a === 'bl' || a === 'c') ? (x += dx, w -= dx) : (w -= dx); }
      // Height
      if (south) { (a === 'bl' || a === 'br') ? (y -= dy, hh += dy) : (hh += dy); }
      if (north) { (a === 'tl' || a === 'tr' || a === 'c') ? (y += dy, hh -= dy) : (hh -= dy); }
      // Floor at 1px so handles can't invert
      if (w < 1)  w = 1;
      if (hh < 1) hh = 1;
      return Object.assign({}, layout, { x: x, y: y, w: w, h: hh });
    }

    // Inline-style preview during drag. Mirrors what absolute.js's
    // appendChild does, just operates on an existing DOM element.
    function previewLayout(slot, layout) {
      var u = layout.unit || 'px';
      var cssV = function (v) { return u === 'percent' ? (v * 100) + '%' : v + 'px'; };
      slot.style.left = ''; slot.style.right = '';
      slot.style.top  = ''; slot.style.bottom = '';
      slot.style.transform = '';
      var a = layout.anchor || 'tl';
      var x = layout.x || 0, y = layout.y || 0;
      if (a === 'tl') { slot.style.left  = cssV(x); slot.style.top    = cssV(y); }
      else if (a === 'tr') { slot.style.right = cssV(x); slot.style.top    = cssV(y); }
      else if (a === 'bl') { slot.style.left  = cssV(x); slot.style.bottom = cssV(y); }
      else if (a === 'br') { slot.style.right = cssV(x); slot.style.bottom = cssV(y); }
      else if (a === 'c')  { slot.style.left  = '50%';   slot.style.top    = '50%'; slot.style.transform = 'translate(-50%, -50%)'; }
      if (layout.w != null) slot.style.width  = cssV(layout.w);
      if (layout.h != null) slot.style.height = cssV(layout.h);
    }
    function commitLayout(nodeId, layout) {
      var cs = State.projectCardStyles()[styleKey]; if (!cs) return;
      var clone = JSON.parse(JSON.stringify(cs));
      var hit = findNode(clone.root, nodeId, null, -1);
      if (!hit) return;
      hit.node.layout = layout;
      State.upsertCardStyle(styleKey, clone);
    }

    EF.effect(rerender);
    ctx.bus.on('cardstyles:changed', rerender);
    // selection:changed → rebuild affordances (highlight + handles).
    // cardstyles:changed must ALSO re-run them: rerender above wipes the
    // canvas (which destroys our handle DOM), so we need to remount onto
    // the freshly-rendered slot. Order matters — rerender is subscribed
    // first so canvas is already rebuilt by the time affordances fire.
    ctx.bus.on('selection:changed',  applySelectionAffordances);
    ctx.bus.on('cardstyles:changed', applySelectionAffordances);
    EF.effect(applySelectionAffordances);

    // When activeCardStyle changes externally (e.g. user clicked a tile in
    // cardstyle-list), keep this panel pointed at its own styleKey — list
    // opens a different panel for a different key, so we just stay put.
    return root;
  }

  EF.registerComponent('gde-cardstyle-editor', {
    defaults: function () { return { title: 'CardStyle', icon: 'columns' }; },
    factory:  factory,
  });
})();
