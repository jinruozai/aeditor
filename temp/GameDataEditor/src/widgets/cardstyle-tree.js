/**
 * CardStyle node tree — left dock panel that shows the active cardStyle's
 * tree (root → descendants). Subscribes to State.activeCardStyle.
 *
 * Selection in the tree → State.setSelection({kind:'card_component',
 * styleKey, nodeId(s)}) so Inspector reflects the chosen node(s).
 *
 * Empty state when no cardStyle is active.
 *
 * Drag-reparent + multi-select are inherited from ui.tree.
 */
(function () {
  'use strict';

  var ui = EF.ui;

  // Walk a TreeNode → flat ui.tree input (id/label/icon/children).
  function flatten(node) {
    if (!node) return [];
    return [toTreeRow(node)];
  }
  function toTreeRow(n) {
    var spec = null;
    try { spec = EF.resolveComponent(n.type); } catch (_) {}
    var label = n.type;
    var bound = n.bindings && Object.keys(n.bindings).length;
    if (bound) {
      var b = n.bindings[Object.keys(n.bindings)[0]];
      label = n.type + ' · ' + (b && b.field ? '🔗 ' + b.field : '');
    }
    return {
      id:       n.id,
      label:    label,
      icon:     (spec && spec.icon) || 'square',
      children: (n.children || []).map(toTreeRow),
    };
  }

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

  function factory(_propsSig, ctx) {
    var root = ui.h('div', 'gde-cs-tree');

    var header = ui.h('div', 'gde-cs-tree-header');
    var titleEl = ui.h('span', 'gde-cs-tree-title', { text: '(no cardStyle selected)' });
    header.appendChild(titleEl);
    root.appendChild(header);

    var empty = ui.h('div', 'gde-cs-tree-empty', {
      text: 'Select a cardStyle on the left, or drag a component into the editor.',
    });

    var itemsSig    = EF.signal([]);
    var selectedSig = EF.signal([]);
    var expandedSig = EF.signal(new Set());

    var tree = ui.tree({
      items:    itemsSig,
      selected: selectedSig,
      expanded: expandedSig,
      multi:    true,
      defaultExpanded: 'all',
      onSelect: function (ids) {
        var key = State.activeCardStyle.peek();
        if (!key) return;
        if (!ids || !ids.length) State.setSelection({ kind: 'card_style', key: key });
        else State.setSelection({ kind: 'card_component', styleKey: key, nodeIds: ids });
      },
      contextMenu: function (node) {
        return [
          { label: 'Delete', danger: true, onSelect: function () { deleteNode(node.id); } },
        ];
      },
      dnd: {
        // 'inside' is only allowed when the target component is a container.
        // Without this, dragging onto a leaf would corrupt the tree (leaves
        // never grow children at runtime).
        dropZones: function (targetNode) {
          var spec = null;
          try { spec = EF.resolveComponent(targetNode.type); } catch (_) {}
          var zones = ['before', 'after'];
          if (spec && spec.acceptsChildren) zones.push('inside');
          return zones;
        },
        onDrop: function (targetNode, position, dragData) {
          reparent(dragData.payload, targetNode.id, position);
        },
      },
    });
    tree.style.cssText = 'flex:1 1 0;';

    function refresh() {
      var key = State.activeCardStyle();
      var cs = State.projectCardStyles();
      var def = key ? cs[key] : null;
      titleEl.textContent = def ? (def.name || key) : '(no cardStyle selected)';
      if (!def || !def.root) {
        if (root.contains(tree)) root.removeChild(tree);
        if (!root.contains(empty)) root.appendChild(empty);
        itemsSig.set([]);
        return;
      }
      if (root.contains(empty)) root.removeChild(empty);
      if (!root.contains(tree)) root.appendChild(tree);
      itemsSig.set(flatten(def.root));
      // Sync selection from State
      var sel = State.selection();
      if (sel && sel.kind === 'card_component' && sel.styleKey === key) {
        var ids = sel.nodeIds || (sel.nodeId ? [sel.nodeId] : []);
        selectedSig.set(ids);
      } else {
        selectedSig.set([]);
      }
    }

    // Move srcIds into target relative to the targetId. Cut first (so target
     // index stays valid for in-tree moves), then splice in. Cycle prevention
     // (dropping a parent into its descendant) is enforced upstream by
     // tree-dnd; we just write what comes through.
    function reparent(srcIds, targetId, position) {
      var key = State.activeCardStyle.peek();
      if (!key) return;
      var cs = State.projectCardStyles()[key];
      if (!cs || !cs.root) return;
      // Don't allow dropping the root or making the root a child of someone.
      if (srcIds.indexOf(cs.root.id) >= 0) return;
      var clone = JSON.parse(JSON.stringify(cs));
      var moving = [];
      // Cut in reverse so multiple cuts under the same parent stay correct.
      var ordered = orderByDepth(clone.root, srcIds);
      ordered.forEach(function (id) {
        var hit = findNode(clone.root, id, null, -1);
        if (hit && hit.parent) {
          moving.unshift(hit.parent.children.splice(hit.index, 1)[0]);
        }
      });
      var dst = findNode(clone.root, targetId, null, -1);
      if (!dst) return;
      if (position === 'inside') {
        dst.node.children = dst.node.children || [];
        Array.prototype.push.apply(dst.node.children, moving);
      } else if (position === 'before' && dst.parent) {
        Array.prototype.splice.apply(dst.parent.children, [dst.index, 0].concat(moving));
      } else if (position === 'after' && dst.parent) {
        Array.prototype.splice.apply(dst.parent.children, [dst.index + 1, 0].concat(moving));
      } else {
        // No valid spot (e.g. before/after the root) — abort, restore.
        return;
      }
      State.upsertCardStyle(key, clone);
    }
    // Order ids by descending depth so we cut leaves before their parents
    // when both are in the moving set (otherwise the parent cut detaches
    // the descendant before we get to it).
    function orderByDepth(root, ids) {
      var depths = {};
      function walk(n, d) {
        depths[n.id] = d;
        (n.children || []).forEach(function (c) { walk(c, d + 1); });
      }
      walk(root, 0);
      return ids.slice().sort(function (a, b) { return (depths[b]||0) - (depths[a]||0); });
    }

    function deleteNode(id) {
      var key = State.activeCardStyle.peek();
      if (!key) return;
      var cs = State.projectCardStyles();
      var def = cs[key]; if (!def) return;
      // Don't allow deleting the root via the context menu — that would
      // leave an inconsistent CardStyleDef. Use the inspector's "clear root"
      // affordance for that.
      if (def.root && def.root.id === id) {
        State.log('warn', 'Use the inspector to clear the root node.');
        return;
      }
      var clone = JSON.parse(JSON.stringify(def));
      var hit = findNode(clone.root, id, null, -1);
      if (!hit || !hit.parent) return;
      hit.parent.children.splice(hit.index, 1);
      State.upsertCardStyle(key, clone);
    }

    EF.effect(refresh);
    ctx.bus.on('cardstyles:changed', refresh);
    ctx.bus.on('selection:changed',  refresh);

    return root;
  }

  EF.registerComponent('gde-cardstyle-tree', {
    defaults: function () { return { title: 'Object Tree', icon: 'list' }; },
    factory:  factory,
  });
})();
