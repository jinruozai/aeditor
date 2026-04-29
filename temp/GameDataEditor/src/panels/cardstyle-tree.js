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
    try { spec = EF.resolveComponent(n.component); } catch (_) {}
    var label = n.component;
    var bound = n.bindings && Object.keys(n.bindings).length;
    if (bound) {
      var b = n.bindings[Object.keys(n.bindings)[0]];
      label = n.component + ' · ' + (b && b.field ? '🔗 ' + b.field : '');
    }
    return {
      id:       n.id,
      label:    label,
      icon:     (spec && spec.icon) || 'square',
      // Preserve the component name so consumers like contextMenu(node)
      // can re-resolve the spec (acceptsChildren etc).
      component: n.component,
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

  var nextId = 1;
  function uid(prefix) { return (prefix || 'n') + '-' + (nextId++) + '-' + Date.now().toString(36); }

  // Module-local node clipboard. Holds JSON-serialized TreeNode objects
  // so paste works across cardStyles too — every TreeNode is the same
  // shape regardless of which cardStyle it came from. Paste deep-clones
  // and rewrites every id with uid() so duplicates don't collide.
  var clipboard = EF.signal([]);
  function retagIds(node) {
    if (!node) return;
    node.id = uid(node.component);
    (node.children || []).forEach(retagIds);
  }
  function cloneAndRetag(node) {
    var c = JSON.parse(JSON.stringify(node));
    retagIds(c);
    return c;
  }

  function factory(_propsSig, ctx) {
    var root = ui.h('div', 'gde-cs-tree');

    // ── Header: title + filter input + add button ──────────────────
    var header = ui.h('div', 'gde-cs-tree-header');
    var titleEl = ui.h('span', 'gde-cs-tree-title', { text: '(no cardStyle selected)' });
    header.appendChild(titleEl);
    root.appendChild(header);

    var bar = ui.h('div', 'gde-cs-tree-bar');
    var filterSig = EF.signal('');
    var search = ui.input({ value: filterSig, placeholder: 'Filter…' });
    search.style.cssText = 'flex:1 1 auto;min-width:0;';
    var addBtn = ui.iconButton({
      icon: 'plus', kind: 'primary', size: 'sm', title: 'Add component',
      onClick: function (ev) { showAddMenu(ev); },
    });
    bar.appendChild(search); bar.appendChild(addBtn);
    root.appendChild(bar);

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
      search:   filterSig,
      searchBehavior: 'filter',
      multi:    true,
      defaultExpanded: 'all',
      onSelect: function (ids) {
        var key = State.activeCardStyle.peek();
        if (!key) return;
        if (!ids || !ids.length) State.setSelection({ kind: 'card_style', key: key });
        else State.setSelection({ kind: 'card_component', styleKey: key, nodeIds: ids });
      },
      contextMenu: function (node) {
        var spec = null; try { spec = EF.resolveComponent(node.component); } catch (_) {}
        var canPaste = (clipboard.peek() || []).length > 0;
        return [
          { label: 'Copy', icon: 'copy', onSelect: function () { copyNodes(); } },
          { label: 'Paste as sibling', disabled: !canPaste,
            onSelect: function () { pasteAsSibling(node.id); } },
          { label: 'Paste as child', disabled: !canPaste || !(spec && spec.acceptsChildren),
            onSelect: function () { pasteAsChild(node.id); } },
          { type: 'divider' },
          { label: 'Delete', danger: true, onSelect: function () { deleteNode(node.id); } },
        ];
      },
      dnd: {
        // 'inside' is only allowed when the target component is a container.
        // Without this, dragging onto a leaf would corrupt the tree (leaves
        // never grow children at runtime).
        dropZones: function (targetNode) {
          var spec = null;
          try { spec = EF.resolveComponent(targetNode.component); } catch (_) {}
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

    // The local selectedSig (the one ui.tree writes only when no onSelect
    // is provided) is read-only here — our onSelect routes through State.
    // So always source the live selection from State.selection().
    function currentSelectedIds() {
      var key = State.activeCardStyle.peek();
      var sel = State.selection();
      if (!sel || sel.kind !== 'card_component' || sel.styleKey !== key) return [];
      return sel.nodeIds || [];
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
      State.mutateCardStyle(key, function (clone) {
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
        if (!dst) return false;
        if (position === 'inside') {
          dst.node.children = dst.node.children || [];
          Array.prototype.push.apply(dst.node.children, moving);
        } else if (position === 'before' && dst.parent) {
          Array.prototype.splice.apply(dst.parent.children, [dst.index, 0].concat(moving));
        } else if (position === 'after' && dst.parent) {
          Array.prototype.splice.apply(dst.parent.children, [dst.index + 1, 0].concat(moving));
        } else {
          return false;
        }
      });
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

    // Build an add-component menu listing every registered component
    // grouped by category. Picking one inserts a fresh node under the
    // currently selected node (if it's a container or its parent if not),
    // or as a root if the cardStyle is empty.
    var ADD_CATS = ['layout', 'display', 'base', 'form', 'editor'];
    function showAddMenu(ev) {
      var key = State.activeCardStyle.peek();
      if (!key) { State.log('warn', 'Pick a cardStyle first.'); return; }
      var rect = ev.target.getBoundingClientRect();
      var groups = {};
      EF.listComponents().forEach(function (c) {
        if (!c.category || ADD_CATS.indexOf(c.category) < 0) return;
        (groups[c.category] = groups[c.category] || []).push(c);
      });
      var items = [];
      ADD_CATS.forEach(function (cat) {
        var entries = (groups[cat] || []).sort(function (a, b) {
          return (a.label || a.name).localeCompare(b.label || b.name);
        });
        if (!entries.length) return;
        entries.forEach(function (spec) {
          items.push({
            label: spec.label || spec.name,
            value: spec.name,
            icon:  spec.icon  || 'square',
            group: cat,
            onSelect: function () { addComponent(spec.name); },
          });
        });
      });
      ui.searchMenu({
        anchor: ev.target,
        items: items,
        placeholder: 'Search components...',
        side: 'right',
        align: 'start',
        width: 300,
        maxHeight: 520,
      });
    }
    function addComponent(name) {
      var key = State.activeCardStyle.peek();
      if (!key) return;
      var spec = EF.resolveComponent(name);
      var newNode = {
        id:        uid(name),
        component: name,
        props:     Object.assign({}, spec.defaultProps || {}),
        bindings:  {},
        children:  [],
        layout: {
          aMin: { x: 0, y: 0 }, aMax: { x: 0, y: 0 },
          oMin: { x: 8, y: 8 }, oMax: { x: 88, y: 32 },
        },
      };
      var selectedNodeId = null;
      State.mutateCardStyle(key, function (clone) {
        if (!clone.root) {
          delete newNode.layout;
          clone.root = newNode;
          selectedNodeId = newNode.id;
          return;
        }
        // Otherwise: insert under the current selection if it's a container,
        // else as the next sibling of the selection, else as a child of the
        // root.
        var selIds = currentSelectedIds() || [];
        var anchorId = selIds[selIds.length - 1] || clone.root.id;
        var hit = findNode(clone.root, anchorId, null, -1);
        var anchorSpec = null;
        try { anchorSpec = hit && EF.resolveComponent(hit.node.component); } catch (_) {}
        if (hit && anchorSpec && anchorSpec.acceptsChildren) {
          hit.node.children = hit.node.children || [];
          hit.node.children.push(newNode);
        } else if (hit && hit.parent) {
          hit.parent.children.splice(hit.index + 1, 0, newNode);
        } else {
          clone.root.children = clone.root.children || [];
          clone.root.children.push(newNode);
        }
        selectedNodeId = newNode.id;
      });
      if (selectedNodeId) State.setSelection({ kind: 'card_component', styleKey: key, nodeIds: [selectedNodeId] });
    }

    // Copy the current tree-multi-selection (or fall back to the right-
    // clicked node if nothing is multi-selected) into the module clipboard.
    // We snapshot `JSON.stringify` payloads so the clipboard survives later
    // edits to the source cardStyle. Root cannot be copied — copying root
    // and pasting back would overwrite or duplicate the entire style.
    function copyNodes() {
      var key = State.activeCardStyle.peek();
      if (!key) return;
      var cs = State.projectCardStyles()[key]; if (!cs || !cs.root) return;
      var ids = (currentSelectedIds() || []).filter(function (id) { return id !== cs.root.id; });
      if (!ids.length) { State.log('warn', 'Nothing to copy (root cannot be copied).'); return; }
      var payloads = ids.map(function (id) {
        var hit = findNode(cs.root, id, null, -1);
        return hit ? JSON.parse(JSON.stringify(hit.node)) : null;
      }).filter(Boolean);
      clipboard.set(payloads);
      State.log('info', 'Copied ' + payloads.length + ' node(s).');
    }
    function pasteAsSibling(targetId) {
      var key = State.activeCardStyle.peek(); if (!key) return;
      var cs = State.projectCardStyles()[key]; if (!cs || !cs.root) return;
      if (cs.root.id === targetId) { return pasteAsChild(targetId); }
      var clip = clipboard.peek() || [];
      if (!clip.length) return;
      var fresh = clip.map(cloneAndRetag);
      var changed = State.mutateCardStyle(key, function (clone) {
        var hit = findNode(clone.root, targetId, null, -1);
        if (!hit || !hit.parent) return false;
        Array.prototype.splice.apply(hit.parent.children, [hit.index + 1, 0].concat(fresh));
      });
      if (!changed) return;
      State.setSelection({ kind: 'card_component', styleKey: key, nodeIds: fresh.map(function (n) { return n.id; }) });
    }
    function pasteAsChild(targetId) {
      var key = State.activeCardStyle.peek(); if (!key) return;
      var cs = State.projectCardStyles()[key]; if (!cs || !cs.root) return;
      var clip = clipboard.peek() || [];
      if (!clip.length) return;
      var fresh = clip.map(cloneAndRetag);
      var changed = State.mutateCardStyle(key, function (clone) {
        var hit = findNode(clone.root, targetId, null, -1);
        if (!hit) return false;
        var spec = null; try { spec = EF.resolveComponent(hit.node.component); } catch (_) {}
        if (!spec || !spec.acceptsChildren) return false;
        hit.node.children = hit.node.children || [];
        Array.prototype.push.apply(hit.node.children, fresh);
      });
      if (!changed) return;
      State.setSelection({ kind: 'card_component', styleKey: key, nodeIds: fresh.map(function (n) { return n.id; }) });
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
      State.mutateCardStyle(key, function (clone) {
        var hit = findNode(clone.root, id, null, -1);
        if (!hit || !hit.parent) return false;
        hit.parent.children.splice(hit.index, 1);
      });
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
