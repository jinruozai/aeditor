/**
 * Table Data panel widget — cards + list, selection, drag-sort, sort dropdown.
 * Props: { pathKey }
 */
(function () {
  'use strict';

  function createPanel(propsSig, ctx) {
    var props = propsSig.peek() || {};
    var ui = EF.ui;
    var pathKey = props.pathKey;
    var root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;';

    // ── Toolbar (built entirely on EF.ui.*) ────────────────────────
    // Signals feed the reactive props of each control.
    var addTitleSig   = EF.signal('Add');
    var delTitleSig   = EF.signal('Delete');
    var delDisabledSig = EF.signal(true);           // hide-in-practice via disabled+opacity
    var modeIconSig   = EF.signal('▦');
    var modeTitleSig  = EF.signal('Cards / List');
    var sizeSig       = EF.signal(140);             // cardSize
    var sortFieldSig  = EF.signal('');
    var sortOrderSig  = EF.signal('asc');
    // ui.select reads `options` at click time, so a plain array that we
    // mutate-in-place is all we need (and signals don't work anyway since
    // select doesn't subscribe to them).
    var sortFieldOpts = [{ value: '', label: '—' }];
    var sortOrderOpts = [
      { value: 'asc',  label: 'Asc' },
      { value: 'desc', label: 'Desc' },
    ];

    var addBtn = ui.iconButton({
      icon:    'plus',
      title:   addTitleSig,
      kind:    'primary',
      onClick: function () { handleAdd(); },
    });
    var delBtn = ui.iconButton({
      icon:     'trash',
      title:    delTitleSig,
      kind:     'danger',
      disabled: delDisabledSig,
      onClick:  function () { handleDelete(); },
    });
    // Mode toggle: icon swaps between 'grid' (cards) and 'list' via signal.
    var modeBtn = ui.iconButton({
      icon:    modeIconSig,
      title:   modeTitleSig,
      onClick: function () { toggleMode(); },
    });

    var sizeInput = ui.numberInput({
      value: sizeSig,
      min:   80, max: 240, step: 10, precision: 0,
    });
    // Width for a 3-digit number + both step buttons; flex-shrink:0 so a
    // narrow toolbar doesn't squeeze the input into an unusable sliver.
    sizeInput.style.width = '96px';
    sizeInput.style.flexShrink = '0';

    var countLabel = document.createElement('span'); countLabel.className = 'gde-hint';

    // ui.select defaults to width:100% (meant for form rows). In a flex
    // toolbar that reads as "eat all remaining space". Cap each select to
    // what its label actually needs and prevent flex shrinking below that.
    var sortFieldSel = ui.select({ value: sortFieldSig, options: sortFieldOpts });
    var sortOrderSel = ui.select({ value: sortOrderSig, options: sortOrderOpts });
    sortFieldSel.style.width = '120px';
    sortFieldSel.style.flexShrink = '0';
    sortOrderSel.style.width = '80px';
    sortOrderSel.style.flexShrink = '0';

    var spacer = document.createElement('div'); spacer.className = 'gde-spacer';

    // Toolbar layout: [add/del] │ [sort field/order] · count · [size] │ [mode →]
    function divider() { return ui.divider({ orientation: 'vertical' }); }
    var bar = document.createElement('div');
    bar.className = 'gde-panel-toolbar';
    bar.appendChild(addBtn); bar.appendChild(delBtn);
    bar.appendChild(divider());
    bar.appendChild(sortFieldSel); bar.appendChild(sortOrderSel);
    bar.appendChild(countLabel);
    bar.appendChild(sizeInput);
    bar.appendChild(spacer);
    bar.appendChild(modeBtn);

    // Body: cards or list
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;position:relative;';
    root.appendChild(bar); root.appendChild(body);

    var STORE = 'gde.table.' + pathKey;
    var state = (function () {
      try { return JSON.parse(localStorage.getItem(STORE) || '') || {}; } catch (_) { return {}; }
    })();
    var mode = state.mode || 'card';
    // Seed signals from persisted state. framework wraps widget.create in
    // EF.untracked so these plain writes don't pollute the reconcile effect.
    sizeSig.set(state.cardSize || 140);
    sortFieldSig.set(state.sortField || '');
    sortOrderSig.set(state.sortOrder || 'asc');

    function save() {
      try {
        localStorage.setItem(STORE, JSON.stringify({
          mode:      mode,
          cardSize:  sizeSig.peek(),
          sortField: sortFieldSig.peek(),
          sortOrder: sortOrderSig.peek(),
        }));
      } catch (_) {}
    }

    var selectedIds = new Set();
    var lastClicked = null;
    var gridHandle = null;

    function table() { return State.tableMap()[pathKey]; }
    function gd() { return State.gameData(); }

    function sortedIds() {
      var t = table(); if (!t) return [];
      var ids = t.id.slice();
      var sortField = sortFieldSig.peek();
      var sortOrder = sortOrderSig.peek();
      if (sortField) {
        var data = gd();
        var dir = sortOrder === 'desc' ? -1 : 1;
        ids.sort(function (a, b) {
          var va = data[a] && data[a][sortField];
          var vb = data[b] && data[b][sortField];
          if (va == null && vb == null) return 0;
          if (va == null) return -dir;
          if (vb == null) return dir;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
      return ids;
    }

    function refreshSortDropdown() {
      var t = table();
      sortFieldOpts.length = 0;
      sortFieldOpts.push({ value: '', label: T('table.none_field') });
      if (t) {
        Object.keys(t.struct_def || {}).forEach(function (f) {
          sortFieldOpts.push({ value: f, label: f });
        });
      }
      sortOrderOpts.length = 0;
      sortOrderOpts.push(
        { value: 'asc',  label: T('table.sort_asc') },
        { value: 'desc', label: T('table.sort_desc') }
      );
      // Force a label repaint so the select button text reflects the
      // current signal value against the freshly-populated options list.
      var fv = sortFieldSig.peek(); sortFieldSig.set(null); sortFieldSig.set(fv);
      var ov = sortOrderSig.peek(); sortOrderSig.set(null); sortOrderSig.set(ov);
    }

    function T(k, v) { return t(k, v); }

    function renderBody() {
      body.innerHTML = '';
      var tbl = table();
      if (!tbl) return;
      var ids = sortedIds();
      countLabel.textContent = selectedIds.size > 0
        ? selectedIds.size + '/' + ids.length
        : String(ids.length);
      delDisabledSig.set(selectedIds.size === 0);

      sizeInput.style.display = mode === 'card' ? '' : 'none';

      if (ids.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--ef-fg-3,#8a8a90);font-size:13px;';
        empty.textContent = T('table.empty');
        body.appendChild(empty);
        return;
      }

      if (mode === 'card') renderCards(ids);
      else renderList(ids);
    }

    function renderCards(ids) {
      var cardSize = sizeSig.peek();
      var wrap = document.createElement('div');
      wrap.className = 'gde-cards-wrap';
      var grid = document.createElement('div');
      grid.className = 'gde-cards-grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(' + cardSize + 'px,1fr))';

      var data = gd();
      ids.forEach(function (id) {
        var entity = Object.assign({ id: id }, data[id] || {});
        var card = Card.render(entity, id, pathKey);
        if (selectedIds.has(id)) card.classList.add('is-selected');
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
      body.appendChild(wrap);

      gridHandle = Card.attachGrid(wrap, {
        onSelect: function (ids2, last) {
          selectedIds = new Set(ids2);
          lastClicked = last;
          pushSelection();
        },
        onReorder: function (dragged, targetId, side) {
          reorder(dragged, targetId, side);
        },
      });
    }

    function renderList(ids) {
      var tbl = table();
      var sd = tbl.struct_def || {};
      var fields = Object.keys(sd);
      var wrap = document.createElement('div');
      wrap.style.cssText = 'overflow:auto;height:100%;';
      var tb = document.createElement('table');
      tb.className = 'gde-list';
      var thead = document.createElement('thead');
      var trh = document.createElement('tr');
      var thId = document.createElement('th'); thId.textContent = 'ID';
      trh.appendChild(thId);
      fields.forEach(function (f) {
        var th = document.createElement('th'); th.textContent = f; trh.appendChild(th);
      });
      thead.appendChild(trh);
      tb.appendChild(thead);

      var tbody = document.createElement('tbody');
      var data = gd();
      ids.forEach(function (id) {
        var tr = document.createElement('tr');
        if (selectedIds.has(id)) tr.classList.add('is-selected');
        tr.dataset.id = id;
        var idCell = document.createElement('td');
        idCell.style.fontFamily = 'ui-monospace,monospace';
        idCell.textContent = id;
        tr.appendChild(idCell);
        var entity = data[id] || {};
        fields.forEach(function (f) {
          var td = document.createElement('td');
          var v = entity[f];
          if (v == null) td.textContent = '';
          else if (typeof v === 'object') td.textContent = JSON.stringify(v);
          else td.textContent = String(v);
          tr.appendChild(td);
        });
        tr.addEventListener('click', function (ev) {
          if (ev.ctrlKey || ev.metaKey) {
            if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
          } else if (ev.shiftKey && lastClicked) {
            var li = ids.indexOf(lastClicked), ci = ids.indexOf(id);
            if (li >= 0 && ci >= 0) {
              selectedIds.clear();
              var from = Math.min(li, ci), to = Math.max(li, ci);
              for (var i = from; i <= to; i++) selectedIds.add(ids[i]);
            }
          } else {
            selectedIds.clear(); selectedIds.add(id);
          }
          lastClicked = id;
          pushSelection(); renderBody();
        });
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      wrap.appendChild(tb);
      body.appendChild(wrap);
    }

    function pushSelection() {
      if (selectedIds.size === 0) {
        State.setSelection(null);
      } else {
        State.setSelection({
          kind: 'card_data',
          pathKey: pathKey,
          ids: Array.from(selectedIds),
          id: lastClicked || Array.from(selectedIds)[0],
          lastId: lastClicked,
        });
      }
      var total = (table() && table().id.length) || 0;
      countLabel.textContent = selectedIds.size > 0
        ? selectedIds.size + '/' + total
        : String(total);
      delDisabledSig.set(selectedIds.size === 0);
    }

    function reorder(dragged, targetId, side) {
      var t = table(); if (!t) return;
      var ids = t.id.slice();
      var dragSet = {}; dragged.forEach(function (i) { dragSet[i] = true; });
      var remaining = ids.filter(function (i) { return !dragSet[i]; });
      var insertAt = remaining.length;
      if (targetId) {
        var ti = remaining.indexOf(targetId);
        if (ti >= 0) insertAt = side === 'after' ? ti + 1 : ti;
      }
      var ordered = dragged.slice();
      remaining.splice.apply(remaining, [insertAt, 0].concat(ordered));
      State.setTableIds(pathKey, remaining);
      State.log('info', 'Reordered ' + dragged.length + ' item(s) in ' + pathKey);
    }

    // ── Toolbar action handlers ────────────────────────────────────
    function handleAdd() {
      try {
        var id = State.addEntity(pathKey);
        selectedIds.clear(); selectedIds.add(id);
        lastClicked = id;
        pushSelection();
        State.log('info', 'Added entity ' + id + ' in ' + pathKey, { pathKey: pathKey, id: id });
      } catch (e) { State.log('error', String(e.message || e)); }
    }
    function handleDelete() {
      var ids = Array.from(selectedIds);
      if (!ids.length) return;
      EF.ui.confirm({
        title:   T('table.delete'),
        message: T('table.delete_confirm', { n: ids.length }),
        danger:  true,
        okLabel: T('common.delete') || 'Delete',
      }).then(function (ok) {
        if (!ok) return;
        State.deleteEntities(pathKey, ids);
        selectedIds.clear(); lastClicked = null; pushSelection();
        State.log('warn', 'Deleted ' + ids.length + ' entities from ' + pathKey);
      });
    }
    function toggleMode() {
      mode = (mode === 'card') ? 'list' : 'card';
      save(); applyLocale(); renderBody();
    }

    // Reactive size / sort: toolbar signals drive persistence + re-render.
    var offSize = EF.effect(function () {
      var sz = sizeSig()
      save()
      var grid = body.querySelector('.gde-cards-grid')
      if (grid) grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(' + sz + 'px,1fr))'
    })
    var offSortF = EF.effect(function () { sortFieldSig(); save(); renderBody() })
    var offSortO = EF.effect(function () { sortOrderSig(); save(); renderBody() })
    ctx.onCleanup(function () {
      try { offSize && offSize(); offSortF && offSortF(); offSortO && offSortO(); } catch (_) {}
    });

    function applyLocale() {
      var pt = pathKey.split('/').pop();
      if (ctx.panel && ctx.panel.title() !== pt) ctx.panel.setTitle(pt);
      addTitleSig.set(T('table.add'));
      delTitleSig.set(T('table.delete'));
      // Toggle icon reflects the mode you're IN — `grid` for card mode,
      // `list` for list mode. These are framework icon names.
      modeIconSig.set(mode === 'card' ? 'grid' : 'list');
      modeTitleSig.set(mode === 'card' ? T('table.mode_card') : T('table.mode_list'));
      refreshSortDropdown();
      renderBody();
    }

    // Use a wildcard-friendly listener: any data change that matches our
    // current pathKey re-renders. This avoids capturing a stale pathKey when
    // the center panel is repointed to a different table.
    ctx.bus.on('data:changed', function (p) {
      if (p && p.pathKey === pathKey) renderBody();
    });
    // Legacy per-path event (emitted by State mutators as 'data:changed:<pathKey>').
    // Subscribe dynamically so we can rebind when pathKey changes.
    var offDataChanged = null;
    function bindDataListener() {
      if (offDataChanged) { try { offDataChanged(); } catch (_) {} offDataChanged = null; }
      offDataChanged = ctx.bus.on('data:changed:' + pathKey, function () { renderBody(); });
    }
    bindDataListener();

    ctx.bus.on('tables:changed', function () {
      // struct_def may have changed
      refreshSortDropdown();
      renderBody();
    });
    ctx.bus.on('nav:goto', function (p) {
      if (p && p.pathKey === pathKey && p.id) {
        selectedIds.clear(); selectedIds.add(p.id);
        lastClicked = p.id;
        pushSelection();
        renderBody();
      }
    });

    // When selection leaves our scope (e.g. user selects the table_meta
    // for this or another table, or selection goes null / elsewhere),
    // clear the card-level visual selection. Keeps the UX rule: "picking
    // a top-level node cancels card selection in the opened table."
    ctx.bus.on('selection:changed', function (sel) {
      var stillOurs = sel && sel.kind === 'card_data' && sel.pathKey === pathKey;
      if (!stillOurs && selectedIds.size > 0) {
        selectedIds.clear();
        lastClicked = null;
        delDisabledSig.set(true);
        renderBody();
      }
    });

    // Each table gets its own panel instance — no more "rebind pathKey on
    // active-table:changed" hack. This widget is pure w.r.t. props.pathKey.
    var offLocale = I18N.onChange(applyLocale);
    ctx.onCleanup(offLocale);

    applyLocale();
    return root;
  }

  EF.registerComponent('gde-table-data', {
    factory: createPanel,
    defaults: function () { return { title: 'Table', props: { pathKey: '' } }; },
  });
})();
