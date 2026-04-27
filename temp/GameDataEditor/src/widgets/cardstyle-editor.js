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

    function annotateIds(domEl, treeNode) {
      if (!treeNode) return;
      domEl.dataset.nodeId = treeNode.id;
      var spec; try { spec = EF.resolveComponent(treeNode.type); } catch (_) {}
      if (spec && spec.acceptsChildren && treeNode.children) {
        // For absolute the renderer wraps each child in `.ef-ui-abs-slot`;
        // for vbox/hbox the children are direct. Handle both.
        var slots = (treeNode.type === 'absolute')
          ? Array.from(domEl.querySelectorAll(':scope > .ef-ui-abs-slot'))
          : Array.from(domEl.children);
        slots.forEach(function (slot, i) {
          var childNode = treeNode.children[i];
          if (!childNode) return;
          var childEl = (treeNode.type === 'absolute') ? slot.firstElementChild : slot;
          if (childEl) annotateIds(childEl, childNode);
          // Also tag the slot wrapper so clicking the empty area still works.
          if (treeNode.type === 'absolute') slot.dataset.nodeId = childNode.id;
        });
      }
    }

    canvas.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== canvas) {
        if (t.dataset && t.dataset.nodeId) {
          State.setSelection({ kind: 'card_component', styleKey: styleKey, nodeIds: [t.dataset.nodeId] });
          return;
        }
        t = t.parentElement;
      }
      // Click on canvas blank → select cardStyle root meta
      State.setSelection({ kind: 'card_style', key: styleKey });
    });

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

    EF.effect(rerender);
    ctx.bus.on('cardstyles:changed', rerender);
    ctx.bus.on('selection:changed',  function () {
      // Highlight selected node's element with .is-selected-node
      var sel = State.selection();
      var ids = (sel && sel.kind === 'card_component' && sel.styleKey === styleKey)
        ? (sel.nodeIds || []) : [];
      Array.from(canvas.querySelectorAll('[data-node-id]')).forEach(function (el) {
        el.classList.toggle('is-selected-node', ids.indexOf(el.dataset.nodeId) >= 0);
      });
    });

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
