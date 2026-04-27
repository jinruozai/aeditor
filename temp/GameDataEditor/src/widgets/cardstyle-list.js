/**
 * CardStyle list — left dock panel showing every project cardStyle as a
 * tile (name + small live preview rendered with the actual cardStyle root).
 *
 * Click a tile → activeCardStyle.set + selection.set + open transient
 * editor panel in the center dock. Double-click pins it.
 * Right-click context menu: Rename / Duplicate / Delete (Default protected).
 *
 * Add button (+) creates a new empty style with an absolute root, opens it
 * pinned in the editor, and selects it.
 */
(function () {
  'use strict';

  var ui = EF.ui;
  var nextId = 1;
  function uid(prefix) { return (prefix || 'n') + '-' + (nextId++) + '-' + Date.now().toString(36); }

  function emptyRoot() {
    return {
      id: uid('root'),
      type: 'absolute',
      props: { width: 120, height: 120, background: 'var(--ef-bg-2)', borderRadius: 4 },
      bindings: {},
      children: [],
    };
  }

  function suggestKey(existing) {
    for (var i = 1; i < 1000; i++) {
      var k = 'card-' + i;
      if (!existing[k]) return k;
    }
    return 'card-' + Date.now();
  }

  function factory(_propsSig, ctx) {
    var root = ui.h('div', 'gde-cs-list');

    var bar = ui.h('div', 'gde-cs-list-bar');
    var addBtn = ui.iconButton({
      icon: 'plus', kind: 'primary', title: 'Add cardStyle',
      onClick: function () {
        var cs = State.projectCardStyles();
        var key = suggestKey(cs);
        State.upsertCardStyle(key, { name: 'New style', root: emptyRoot() });
        select(key, true);
      },
    });
    bar.appendChild(addBtn);
    root.appendChild(bar);

    var grid = ui.h('div', 'gde-cs-list-grid');
    root.appendChild(grid);

    function select(key, pin) {
      State.activeCardStyle.set(key);
      State.setSelection({ kind: 'card_style', key: key });
      // Ensure an editor tab exists in the center dock; preview-mode (transient)
      // on first single click, pinned on double click.
      ensureEditorTab(key, !!pin);
    }

    function ensureEditorTab(key, pin) {
      var handle = (window.__gde && window.__gde.handle) || null;
      if (!handle) return;
      var tree = handle.tree();
      var centerDockId = null;
      var existingPanelId = null;
      (function walk(n) {
        if (!n) return;
        if (n.type === 'dock' && n.name === 'center') {
          centerDockId = n.id;
          for (var i = 0; i < n.panels.length; i++) {
            var p = n.panels[i];
            if (p.widget === 'gde-cardstyle-editor' && p.props && p.props.styleKey === key) {
              existingPanelId = p.id;
              break;
            }
          }
        } else if (n.type === 'split') {
          n.children.forEach(walk);
        }
      })(tree);
      if (!centerDockId) return;
      if (existingPanelId) {
        handle.activatePanel(existingPanelId);
        if (pin) handle.promotePanel ? handle.promotePanel(existingPanelId) : null;
      } else {
        var ret = handle.addPanel(centerDockId, {
          widget: 'gde-cardstyle-editor',
          title:  (State.projectCardStyles()[key] || {}).name || key,
          icon:   'columns',
          props:  { styleKey: key },
        }, pin ? {} : { transient: true });
        handle.activatePanel(ret.panelId);
      }
    }

    function buildTile(key, def) {
      var tile = ui.h('div', 'gde-cs-tile');
      tile.dataset.key = key;
      EF.effect(function () {
        var sel = State.selection();
        var active = sel && sel.kind === 'card_style' && sel.key === key;
        EF.untracked(function () { tile.classList.toggle('is-active', !!active); });
      });

      // Mini live preview — renderUITree with an empty data signal so
      // bindings show blanks; the user gets the structural feel.
      var previewWrap = ui.h('div', 'gde-cs-tile-preview');
      if (def && def.root) {
        try {
          var sample = EF.signal({ id: '#sample', name: 'Sample' });
          var p = ui.renderUITree(def.root, { data: sample });
          previewWrap.appendChild(p);
        } catch (e) { /* malformed tree — silent */ }
      }
      tile.appendChild(previewWrap);

      var nameEl = ui.h('div', 'gde-cs-tile-name', { text: def.name || key });
      tile.appendChild(nameEl);

      tile.addEventListener('click',    function () { select(key, false); });
      tile.addEventListener('dblclick', function () { select(key, true); });

      tile.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        var items = [
          { label: 'Rename',    onSelect: function () { renameStyle(key); } },
          { label: 'Duplicate', onSelect: function () { duplicateStyle(key); } },
          { type: 'divider' },
          { label: 'Delete', danger: true, disabled: key === 'default',
            onSelect: function () { deleteStyle(key); } },
        ];
        ui.contextMenu({ x: ev.clientX, y: ev.clientY }, items);
      });

      return tile;
    }

    function renameStyle(key) {
      ui.prompt({ title: 'Rename cardStyle', message: 'New key', default: key })
        .then(function (nk) {
          if (!nk || nk === key) return;
          if (key === 'default') { State.log('warn', 'Cannot rename built-in default'); return; }
          try { State.renameCardStyle(key, nk); }
          catch (e) { State.log('error', String(e.message || e)); }
        });
    }
    function duplicateStyle(key) {
      var cs = State.projectCardStyles();
      var src = cs[key]; if (!src) return;
      var nk = suggestKey(cs);
      var clone = JSON.parse(JSON.stringify(src));
      clone.name = (src.name || key) + ' (copy)';
      retagIds(clone.root);
      State.upsertCardStyle(nk, clone);
      select(nk, true);
    }
    function deleteStyle(key) {
      ui.confirm({ title: 'Delete cardStyle', message: 'Delete "' + key + '"? Tables using it fall back to default.', danger: true, okLabel: 'Delete' })
        .then(function (ok) {
          if (!ok) return;
          try { State.deleteCardStyle(key); }
          catch (e) { State.log('error', String(e.message || e)); }
        });
    }
    function retagIds(node) {
      if (!node) return;
      node.id = uid(node.type);
      (node.children || []).forEach(retagIds);
    }

    function paint() {
      grid.innerHTML = '';
      var cs = State.projectCardStyles();
      Object.keys(cs).forEach(function (k) { grid.appendChild(buildTile(k, cs[k])); });
    }

    EF.effect(paint);
    ctx.bus.on('cardstyles:changed', paint);
    ctx.bus.on('selection:changed',  function () {
      // Just re-flag the active tile; cheap.
      var sel = State.selection();
      var activeKey = (sel && sel.kind === 'card_style') ? sel.key : null;
      Array.from(grid.children).forEach(function (t) {
        t.classList.toggle('is-active', t.dataset.key === activeKey);
      });
    });

    return root;
  }

  EF.registerComponent('gde-cardstyle-list', {
    defaults: function () { return { title: 'Card Styles', icon: 'columns' }; },
    factory:  factory,
  });
})();
