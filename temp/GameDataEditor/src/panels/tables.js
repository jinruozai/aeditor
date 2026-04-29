/**
 * Tables panel — merged table list + entity list, presented as a two-level
 * tree. Replaces the former split between `gde-tablemap` and `gde-gamedata`.
 *
 * Layout:
 *   ▸ items/weapons (14)        ← table row (depth=0), entity count badge
 *       sword_iron                ← entity row (depth=1), label = name || id
 *       sword_steel
 *   ▸ items/armor (3)
 *   ▾ npcs (2)
 *       hero_001
 *       villain_boss
 *
 * Behavior (preserving the old widgets' semantics):
 *   · Table single-click → openTable(pk, { transient: true })
 *   · Table double-click → openTable(pk, { transient: false })   (pin)
 *   · Entity single-click → EF.bus.emit('nav:goto', {pathKey, id})
 *   · Context menu on table: edit struct / rename / delete
 *   · Active table + currently-selected entity reflected via derived signal
 *   · Toolbar: filter input + "add table" button
 *
 * All state is driven by State.* signals — no local cache beyond expansion
 * state (internal to the tree). tree items rebuild on tables:changed or any
 * gameData write.
 */
(function () {
  'use strict';

  var ui = EF.ui;

  function createPanel(propsSig, ctx) {
    var props = propsSig.peek() || {};
    var root = document.createElement('div');
    root.className = 'gde-tables';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

    // ── Toolbar ────────────────────────────────────────────────────
    // Layout: [search input] [⌃/⌄ expand-all toggle] [+ add table]
    // The expand-toggle's icon derives from the signal; no imperative
    // state dancing inside onClick.
    var bar = document.createElement('div');
    bar.className = 'gde-tm-toolbar';

    var searchSig      = EF.signal('');
    var placeholderSig = EF.signal('');
    // Owned here (not internal to the tree) so the toolbar button can
    // read + write it directly. Tree also consumes this via `expanded:`.
    var expandedSig    = EF.signal(new Set());
    // ── Tree data ──────────────────────────────────────────────────
    // itemsSig is rebuilt whenever tableMap or gameData change. Node ids
    // are prefixed ("t:<pk>" / "e:<id>") so the two namespaces don't
    // collide inside the tree's flat id map.
    var itemsSig = EF.signal([]);

    function buildItems() {
      var tm = State.tableMap();
      var gd = State.gameData(); void gd;  // subscription only; labels via helper
      var names = Object.keys(tm).sort();
      return names.map(function (pk) {
        var ids = (tm[pk].id || []).slice();
        var children = ids.map(function (id) {
          // Label comes from the single source of truth (respects each
          // table's struct_def.id.ref_name contract); fall back to id
          // when nothing matches.
          var info = State.resolveEntityDisplay(id);
          return {
            id: 'e:' + id,
            label: info ? info.name : id,
            icon: 'file',
            kind: 'entity',
            pk: pk,
            entityId: id,
          };
        });
        return {
          id: 't:' + pk,
          label: pk,
          icon: 'table',
          kind: 'table',
          pk: pk,
          count: ids.length,
          children: children,
        };
      });
    }

    // Single effect covers tables:changed, rename, add, delete, as well as
    // any setEntityField write (gameData.set) — we just read both signals
    // and write a fresh items array. The tree diffs per-id so unchanged
    // subtrees are not re-rendered.
    EF.effect(function () { itemsSig.set(buildItems()); });

    // ── Selection (plain signal + one-way sync from State) ──────────
    // Previous approach used EF.derived on top of State.selection +
    // State.activeTable, with card_data taking priority. That conflated
    // two orthogonal concerns (which-table-tab is open vs. which-entity
    // is being edited in the inspector) and made clicks on top-level
    // table rows after an entity selection appear to do nothing — the
    // derived read the stale card_data id and kept the highlight frozen
    // on an invisible row.
    //
    // New model: `selectedSig` is a plain signal that IS the tree's
    // selection (array per ui.tree contract; this component is single-select
    // so length ≤ 1). An effect syncs it *from* State. handleSelect drives
    // State mutations (which then flow back through this same effect —
    // structural dedupe keeps it stable).
    var selectedSig = EF.signal([]);
    EF.effect(function () {
      var sel = State.selection();
      var active = State.activeTable();
      var want;
      if (sel && sel.kind === 'card_data') {
        if (sel.items && sel.items.length) {
          selectedSig.set(sel.items.map(function (it) { return 'e:' + it.id; }));
        } else {
          var ids = sel.ids && sel.ids.length ? sel.ids : (sel.id ? [sel.id] : []);
          selectedSig.set(ids.map(function (id) { return 'e:' + id; }));
        }
        return;
      }
      if (sel && sel.kind === 'table_meta_many' && sel.pathKeys) {
        selectedSig.set(sel.pathKeys.map(function (pk) { return 't:' + pk; }));
        return;
      }
      if      (sel && sel.kind === 'table_meta' && sel.pathKey) want = 't:' + sel.pathKey;
      else if (active)                                          want = 't:' + active;
      else                                                      want = null;
      selectedSig.set(want ? [want] : []);
    });

    // ── Expand/collapse-all toolbar state ──────────────────────────
    // "All collapsed" ↔ "at least one table expanded" drives the icon.
    // We consider the toggle "expanded" when every *table* id is in the
    // expanded set (entities don't have children, so they don't count).
    var allExpandedSig = EF.derived(function () {
      var exp = expandedSig();
      var items = itemsSig();
      if (!items.length) return false;
      for (var i = 0; i < items.length; i++) {
        if (!exp.has(items[i].id)) return false;
      }
      return true;
    });
    var toggleIconSig = EF.derived(function () {
      return allExpandedSig() ? 'chevron-up' : 'chevron-down';
    });

    var searchInput = ui.input({ value: searchSig, placeholder: placeholderSig });
    searchInput.style.cssText = 'flex:1 1 auto;min-width:0;';
    var toggleAllBtn = ui.iconButton({
      icon: toggleIconSig, kind: 'ghost', title: 'Expand / collapse all',
      onClick: function () {
        if (allExpandedSig.peek()) {
          expandedSig.set(new Set());
        } else {
          var items = itemsSig.peek();
          var next = new Set();
          for (var i = 0; i < items.length; i++) next.add(items[i].id);
          expandedSig.set(next);
        }
      },
    });
    var addBtn = ui.iconButton({
      icon: 'plus', kind: 'primary', title: 'Add table',
      onClick: function () { handleAddTable(); },
    });
    bar.appendChild(searchInput);
    bar.appendChild(toggleAllBtn);
    bar.appendChild(addBtn);

    // ── Node lookup (flat-scan over items; depth ≤ 2) ─────────────
    function findNode(id) {
      var items = itemsSig.peek();
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === id) return items[i];
        var kids = items[i].children;
        if (kids) for (var j = 0; j < kids.length; j++) if (kids[j].id === id) return kids[j];
      }
      return null;
    }

    // ── Click dispatch ─────────────────────────────────────────────
    function handleSelect(ids) {
      var nodes = (ids || []).map(findNode).filter(Boolean);
      if (!nodes.length) { State.setSelection(null); return; }
      var last = nodes[nodes.length - 1];
      var tables = nodes.filter(function (n) { return n.kind === 'table'; });
      var entities = nodes.filter(function (n) { return n.kind === 'entity'; });

      if (entities.length && entities.length === nodes.length) {
        var pk = entities[0].pk;
        var sameTable = entities.every(function (n) { return n.pk === pk; });
        var entityIds = entities.map(function (n) { return n.entityId; });
        var refs = entities.map(function (n) { return { pathKey: n.pk, id: n.entityId }; });
        State.setSelection({
          kind: 'card_data',
          pathKey: sameTable ? pk : last.pk,
          ids: sameTable ? entityIds : null,
          items: refs,
          id: last.entityId,
          lastId: last.entityId,
        });
        State.openTable(last.pk, { transient: true });
        EF.bus.emit('ui:openTable', { pathKey: last.pk });
        return;
      }

      if (tables.length && tables.length === nodes.length) {
        var pathKeys = tables.map(function (n) { return n.pk; });
        if (pathKeys.length > 1) {
          State.setSelection({ kind: 'table_meta_many', pathKeys: pathKeys, pathKey: last.pk });
        } else {
          State.setSelection({ kind: 'table_meta', pathKey: last.pk });
        }
        // Table click = open table tab + make Inspector show the table's
        // own property form (kind='table_meta'). This also implicitly
        // clears any previous card_data selection, which tabledata.js
        // listens to and uses to drop its local card selection highlights.
        State.openTable(last.pk, { transient: true });
        EF.bus.emit('ui:openTable', { pathKey: last.pk });
        return;
      }

      // A table/entity range is ambiguous as an edit target. Use the
      // last clicked row as the semantic selection, matching desktop editors.
      if (last.kind === 'entity') {
        State.setSelection({ kind: 'card_data', pathKey: last.pk, ids: [last.entityId], id: last.entityId, lastId: last.entityId });
        State.openTable(last.pk, { transient: true });
      } else {
        State.setSelection({ kind: 'table_meta', pathKey: last.pk });
        State.openTable(last.pk, { transient: true });
      }
    }

    // Rename/delete used to live in a tree-row context menu. Both are
    // now in the Inspector's table_meta form. Only the "add table"
    // entry point stays here — it's a sidebar-level action, not tied
    // to any specific row.
    function handleAddTable() {
      EF.ui.prompt({
        title:       t('tablemap.new_table_prompt'),
        default:     'new_table', placeholder: 'data/my_table',
        okLabel:     t('common.ok'), cancelLabel: t('common.cancel'),
      }).then(function (name) {
        if (!name) return;
        try {
          State.addTable(name, {});
          State.openTable(name, { transient: false });
          State.log('info', 'Added table: ' + name);
        } catch (e) { State.log('error', String(e.message || e)); }
      });
    }

    // Context menu is intentionally empty on the table tree — rename /
    // delete / edit struct now live in the Inspector's table_meta form
    // (reached by single-clicking a table row). Keeping them in two
    // places would mean two rename flows and two delete flows; the
    // property panel is the one source of truth.

    // ── Tree construction ─────────────────────────────────────────
    // Depth 0 (tables) gets a count badge via trailingSlot. Entities
    // have no trailing. Default all collapsed — the point of the merge
    // is that tables act as collapsible groups.
    var tree = ui.tree({
      items:    itemsSig,
      selected: selectedSig,
      multi:    true,
      expanded: expandedSig,
      search:   searchSig,
      searchBehavior: 'filter',
      onSelect:       handleSelect,
      // Single click: tables select-and-expand (standard tree behavior
      // *plus* top-level selection); entities just select. No special
      // dblclick semantics — tables open + expand on first click.
      onRowClick: function (node) {
        return node.kind === 'table' ? 'select-and-toggle' : 'select';
      },
      // Entity rows are drag sources — drop into a ref_id field or any
      // other consumer that accepts application/ef.entity+json. Tables
      // aren't draggable (they have no out-of-tree identity).
      rowDragSource: function (node) {
        if (node.kind !== 'entity') return null;
        return {
          'application/ef.entity+json': JSON.stringify({ id: node.entityId }),
          'text/plain': node.entityId,
        };
      },
      trailingSlot: function (node) {
        if (node.kind !== 'table') return null;
        var b = document.createElement('span');
        b.className = 'gde-tbl-count';
        b.textContent = String(node.count);
        return b;
      },
    });
    tree.style.cssText = 'flex:1 1 0;height:auto;border:none;border-radius:0;';

    root.appendChild(bar);
    root.appendChild(tree);

    // ── i18n ──────────────────────────────────────────────────────
    function applyLocale() {
      placeholderSig.set(t('tablemap.search_placeholder'));
      var addTip = t('tablemap.add_tooltip');
      addBtn.title = addTip;
      addBtn.setAttribute('aria-label', addTip);
      var pt = t('panel.tablemap');
      if (ctx.panel && ctx.panel.title() !== pt) ctx.panel.setTitle(pt);
    }
    var offLocale = I18N.onChange(applyLocale);
    ctx.onCleanup(offLocale);
    applyLocale();

    return root;
  }

  EF.registerComponent('gde-tables', {
    factory: createPanel,
    defaults: function () { return { title: 'Tables', icon: 'table', props: {} }; },
  });
})();
