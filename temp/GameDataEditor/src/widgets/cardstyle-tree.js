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
