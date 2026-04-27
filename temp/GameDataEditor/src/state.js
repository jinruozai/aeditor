/**
 * Core state: builtin type_config, project type_config, gameData, tableMap, version.
 * Exposes window.State with signals + mutators. All changes ripple via EF.bus events.
 *
 * Signals:
 *   version()                number
 *   builtinTypeConfig()      { [type]: TypeConfigItem }
 *   projectTypeConfig()      { [type]: TypeConfigItem }
 *   gameData()               { [id]: entity }
 *   tableMap()               { [pathKey]: { struct_def, id[] } }
 *   projectName()            string
 *   selection()              { pathKey, ids: string[], lastId } | null
 *   activeTable()            pathKey | null  (synced FROM the layout tree)
 *
 * Bus events:
 *   'tables:changed', 'data:changed:<pathKey>', 'selection:changed',
 *   'typeconfig:changed', 'log'
 *
 * Tab management: openTabs is NOT a separate signal. The center dock's
 * panels ARE the open tabs. openTable/closeTab/pinTab call into the EF
 * LayoutHandle. activeTable signal is kept in sync via an effect in main.js.
 */
(function () {
  'use strict';

  // ---------- Signals ----------
  var version = EF.signal(0);
  var builtinTypeConfig = EF.signal({});
  var projectTypeConfig = EF.signal({});
  var gameData = EF.signal({});
  var tableMap = EF.signal({}); // { pathKey: { struct_def, id: [], card_style? } }
  var projectName = EF.signal('Untitled');
  var activeTable = EF.signal(null);
  var selection = EF.signal(null); // { pathKey, ids: [], lastId }
  // Project-level UI tree library — each entry is a CardStyleDef:
  //   { name: string, root: TreeNode | null }
  // Tables reference one by key via tableMap[pk].card_style (string).
  // Built-in 'default' is seeded by seed.js; user can add more.
  var projectCardStyles = EF.signal({});
  // "Which cardStyle is the editor focused on" — drives the node-tree panel
  // in the left dock. Not the same as State.selection (which can be any
  // kind), but updated whenever a card_style / card_component is selected.
  var activeCardStyle = EF.signal(null);

  // ---------- Layout handle (set by main.js after createDockLayout) ----------
  var _handle = null;
  var _centerDockName = 'center';

  function _setLayout(handle, centerDockName) {
    _handle = handle;
    if (centerDockName) _centerDockName = centerDockName;
  }

  function _centerDockId() {
    if (!_handle) return null;
    var tree = _handle.tree();
    var id = null;
    (function walk(n) {
      if (!n) return;
      if (n.type === 'dock' && n.name === _centerDockName) id = n.id;
      else if (n.type === 'split') n.children.forEach(walk);
    })(tree);
    return id;
  }

  function _findTablePanel(pathKey) {
    if (!_handle) return null;
    var tree = _handle.tree();
    var found = null;
    (function walk(n) {
      if (!n || found) return;
      if (n.type === 'dock' && n.name === _centerDockName) {
        for (var i = 0; i < n.panels.length; i++) {
          var p = n.panels[i];
          if (p.widget === 'gde-table-data' && p.props && p.props.pathKey === pathKey) {
            found = { panel: p, dockId: n.id };
            return;
          }
        }
      } else if (n.type === 'split') {
        n.children.forEach(walk);
      }
    })(tree);
    return found;
  }

  function _allTablePanels() {
    if (!_handle) return [];
    var tree = _handle.tree();
    var out = [];
    (function walk(n) {
      if (!n) return;
      if (n.type === 'dock' && n.name === _centerDockName) {
        n.panels.forEach(function (p) {
          if (p.widget === 'gde-table-data') out.push(p);
        });
      } else if (n.type === 'split') {
        n.children.forEach(walk);
      }
    })(tree);
    return out;
  }

  function _shortName(pathKey) {
    var parts = String(pathKey || '').split('/');
    return parts[parts.length - 1] || pathKey;
  }

  // ---------- Helpers ----------
  function emit(ev, payload) { EF.bus.emit(ev, payload); }

  // Whenever either TypeConfig signal changes, push the merged view into the
  // framework so EF.ui.propertyPanel / propertyEditor / resolveFieldDef pick
  // up project types and overrides automatically.
  EF.effect(function () {
    EF.ui.setTypeConfig(builtinTypeConfig(), { overrides: projectTypeConfig() });
  });

  // Thin delegations — keep the State.* API for existing callers.
  function resolveType(typeName)     { return EF.ui.resolveType(typeName); }
  function resolveFieldDef(fieldDef) { return EF.ui.resolveFieldDef(fieldDef); }

  // ---------- ID generator ----------
  function genId(maxRetry) {
    var data = gameData();
    var retry = maxRetry || 100;
    for (var i = 0; i < retry; i++) {
      // 15-digit positive decimal (safe within 2^53-1 so JS numbers & strings agree)
      var hi = Math.floor(Math.random() * 9) + 1; // 1..9
      var rest = '';
      for (var j = 0; j < 14; j++) rest += Math.floor(Math.random() * 10);
      var id = String(hi) + rest;
      if (!data[id]) return id;
    }
    throw new Error('Failed to generate unique ID after ' + retry + ' retries');
  }

  // ---------- Mutators ----------
  function setBuiltinTypeConfig(tc) {
    builtinTypeConfig.set(Object.assign({}, tc));
    emit('typeconfig:changed');
  }
  function setProjectTypeConfig(tc) {
    projectTypeConfig.set(Object.assign({}, tc));
    emit('typeconfig:changed');
  }
  function upsertProjectType(name, cfg) {
    var tc = Object.assign({}, projectTypeConfig());
    tc[name] = cfg;
    projectTypeConfig.set(tc);
    emit('typeconfig:changed');
  }
  function deleteProjectType(name) {
    var tc = Object.assign({}, projectTypeConfig());
    delete tc[name];
    projectTypeConfig.set(tc);
    emit('typeconfig:changed');
  }
  function renameProjectType(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    var tc = Object.assign({}, projectTypeConfig());
    if (!tc[oldKey]) throw new Error('Not a project type: ' + oldKey);
    if (tc[newKey] || builtinTypeConfig()[newKey]) {
      throw new Error('Type name already exists: ' + newKey);
    }
    tc[newKey] = tc[oldKey];
    delete tc[oldKey];
    projectTypeConfig.set(tc);
    // Patch every FieldDef in every table's struct_def that referenced oldKey.
    var tm = tableMap();
    var nextTm = null;
    Object.keys(tm).forEach(function (pk) {
      var sd = (tm[pk] && tm[pk].struct_def) || {};
      var nextSd = null;
      Object.keys(sd).forEach(function (f) {
        var fd = sd[f];
        if (fd && fd.type === oldKey) {
          if (!nextSd) nextSd = Object.assign({}, sd);
          nextSd[f] = Object.assign({}, fd, { type: newKey });
        }
      });
      if (nextSd) {
        if (!nextTm) nextTm = Object.assign({}, tm);
        nextTm[pk] = Object.assign({}, tm[pk], { struct_def: nextSd });
      }
    });
    if (nextTm) { tableMap.set(nextTm); emit('tables:changed'); }
    emit('typeconfig:changed');
  }
  function findTypeUsages(typeName) {
    var tm = tableMap(); var out = [];
    Object.keys(tm).forEach(function (pk) {
      var sd = tm[pk].struct_def || {};
      Object.keys(sd).forEach(function (f) {
        if (sd[f] && sd[f].type === typeName) out.push({ pathKey: pk, field: f });
      });
    });
    return out;
  }

  // ---------- CardStyle mutators ----------
  function setProjectCardStyles(cs) {
    projectCardStyles.set(Object.assign({}, cs));
    emit('cardstyles:changed');
  }
  function upsertCardStyle(key, def) {
    var cs = Object.assign({}, projectCardStyles());
    cs[key] = def;
    projectCardStyles.set(cs);
    emit('cardstyles:changed');
  }
  function deleteCardStyle(key) {
    if (key === 'default') throw new Error('Cannot delete the built-in default cardStyle');
    var cs = Object.assign({}, projectCardStyles());
    delete cs[key];
    projectCardStyles.set(cs);
    // Cascade: tables referencing this style fall back to 'default'.
    var tm = tableMap();
    var nextTm = null;
    Object.keys(tm).forEach(function (pk) {
      if (tm[pk].card_style === key) {
        if (!nextTm) nextTm = Object.assign({}, tm);
        nextTm[pk] = Object.assign({}, tm[pk], { card_style: 'default' });
      }
    });
    if (nextTm) { tableMap.set(nextTm); emit('tables:changed'); }
    if (activeCardStyle.peek() === key) activeCardStyle.set(null);
    emit('cardstyles:changed');
  }
  function renameCardStyle(oldKey, newKey) {
    if (oldKey === 'default') throw new Error('Cannot rename the built-in default cardStyle');
    if (!oldKey || !newKey || oldKey === newKey) return;
    var cs = Object.assign({}, projectCardStyles());
    if (!cs[oldKey]) throw new Error('Not a project cardStyle: ' + oldKey);
    if (cs[newKey]) throw new Error('CardStyle key already exists: ' + newKey);
    cs[newKey] = cs[oldKey];
    delete cs[oldKey];
    projectCardStyles.set(cs);
    var tm = tableMap();
    var nextTm = null;
    Object.keys(tm).forEach(function (pk) {
      if (tm[pk].card_style === oldKey) {
        if (!nextTm) nextTm = Object.assign({}, tm);
        nextTm[pk] = Object.assign({}, tm[pk], { card_style: newKey });
      }
    });
    if (nextTm) { tableMap.set(nextTm); emit('tables:changed'); }
    if (activeCardStyle.peek() === oldKey) activeCardStyle.set(newKey);
    emit('cardstyles:changed');
  }
  function setTableCardStyle(pathKey, styleKey) {
    var tm = tableMap();
    if (!tm[pathKey]) return;
    var nextTm = Object.assign({}, tm);
    nextTm[pathKey] = Object.assign({}, tm[pathKey], { card_style: styleKey });
    tableMap.set(nextTm);
    emit('tables:changed');
  }
  // Resolve the CardStyleDef a table renders with. Falls back to 'default'
  // when the table didn't pick one or its key is stale (cascade also
  // rewrites stale refs, so this is just defense in depth).
  function resolveCardStyleForTable(pathKey) {
    var cs = projectCardStyles();
    var tm = tableMap();
    var key = (tm[pathKey] && tm[pathKey].card_style) || 'default';
    return cs[key] || cs['default'] || null;
  }

  function setTableMap(tm) { tableMap.set(Object.assign({}, tm)); emit('tables:changed'); }
  function setGameData(gd) { gameData.set(Object.assign({}, gd)); }

  function addTable(pathKey, struct_def) {
    var tm = Object.assign({}, tableMap());
    if (tm[pathKey]) throw new Error('Table already exists: ' + pathKey);
    tm[pathKey] = { struct_def: struct_def || {}, id: [], card_style: 'default' };
    tableMap.set(tm);
    emit('tables:changed');
  }
  function renameTable(oldKey, newKey) {
    var tm = Object.assign({}, tableMap());
    if (!tm[oldKey]) return;
    if (tm[newKey]) throw new Error('Table name already exists: ' + newKey);
    tm[newKey] = tm[oldKey]; delete tm[oldKey];
    tableMap.set(tm);
    // Sync any open panel for this table → patch props.pathKey + title.
    if (_handle) {
      var hit = _findTablePanel(oldKey);
      if (hit) {
        var tree = _handle.tree();
        tree = EF.updatePanel(tree, hit.panel.id, {
          title: _shortName(newKey),
          props: Object.assign({}, hit.panel.props, { pathKey: newKey }),
        });
        _handle.setTree(tree);
      }
    }
    emit('tables:changed');
  }
  function deleteTable(pathKey) {
    var tm = Object.assign({}, tableMap());
    var t = tm[pathKey]; if (!t) return;
    // Remove its entities from gameData
    var gd = Object.assign({}, gameData());
    (t.id || []).forEach(function (id) { delete gd[id]; });
    gameData.set(gd);
    delete tm[pathKey];
    tableMap.set(tm);
    // Close the panel for this table if open (LayoutHandle handles
    // active re-selection automatically via activation-history).
    if (_handle) {
      var hit = _findTablePanel(pathKey);
      if (hit) _handle.removePanel(hit.panel.id);
    }
    emit('tables:changed');
  }
  function updateStructDef(pathKey, struct_def) {
    var tm = Object.assign({}, tableMap());
    if (!tm[pathKey]) return;
    tm[pathKey] = Object.assign({}, tm[pathKey], { struct_def: struct_def });
    tableMap.set(tm);
    emit('tables:changed');
    emit('data:changed:' + pathKey);
  }
  function setTableIds(pathKey, ids) {
    var tm = Object.assign({}, tableMap());
    if (!tm[pathKey]) return;
    tm[pathKey] = Object.assign({}, tm[pathKey], { id: ids.slice() });
    tableMap.set(tm);
    emit('data:changed:' + pathKey);
  }

  function addEntity(pathKey, seed) {
    var tm = Object.assign({}, tableMap());
    if (!tm[pathKey]) throw new Error('Table not found: ' + pathKey);
    var id = genId();
    var data = Object.assign({}, seed || {});
    // Apply defaults based on struct_def
    var sd = tm[pathKey].struct_def || {};
    Object.keys(sd).forEach(function (f) {
      if (data[f] === undefined) {
        var rfd = resolveFieldDef(sd[f]);
        data[f] = (rfd && rfd.default !== undefined) ? JSON.parse(JSON.stringify(rfd.default)) : null;
      }
    });
    var gd = Object.assign({}, gameData());
    gd[id] = data;
    gameData.set(gd);
    tm[pathKey] = Object.assign({}, tm[pathKey], { id: tm[pathKey].id.concat([id]) });
    tableMap.set(tm);
    emit('data:changed:' + pathKey);
    return id;
  }
  function deleteEntities(pathKey, ids) {
    var tm = Object.assign({}, tableMap());
    var t = tm[pathKey]; if (!t) return;
    var set = {}; ids.forEach(function (id) { set[id] = true; });
    var gd = Object.assign({}, gameData());
    ids.forEach(function (id) { delete gd[id]; });
    gameData.set(gd);
    tm[pathKey] = Object.assign({}, t, { id: t.id.filter(function (id) { return !set[id]; }) });
    tableMap.set(tm);
    emit('data:changed:' + pathKey);
  }
  function updateEntity(id, patch) {
    var gd = Object.assign({}, gameData());
    if (!gd[id]) return;
    gd[id] = Object.assign({}, gd[id], patch);
    gameData.set(gd);
    // Find owning table
    var tm = tableMap();
    var owner = null;
    Object.keys(tm).some(function (pk) { if (tm[pk].id.indexOf(id) >= 0) { owner = pk; return true; } return false; });
    if (owner) emit('data:changed:' + owner);
  }
  function setEntityField(id, field, value) {
    var gd = Object.assign({}, gameData());
    if (!gd[id]) return;
    gd[id] = Object.assign({}, gd[id]);
    gd[id][field] = value;
    gameData.set(gd);
    var tm = tableMap();
    var owner = null;
    Object.keys(tm).some(function (pk) { if (tm[pk].id.indexOf(id) >= 0) { owner = pk; return true; } return false; });
    if (owner) emit('data:changed:' + owner);
  }

  // setActiveTable(pathKey) — selects the panel for pathKey in the center
  // dock. If no such panel exists this is a no-op (use openTable instead).
  // activeTable signal auto-updates via main.js effect (sync from tree).
  function setActiveTable(pathKey) {
    if (!_handle || !pathKey) { activeTable.set(pathKey); return; }
    var hit = _findTablePanel(pathKey);
    if (hit) _handle.activatePanel(hit.panel.id);
  }

  // ---------- Tab management ----------
  // openTable(pathKey, { transient }) — opens or activates the table panel.
  // If a panel for this pathKey already exists, it's activated (and optionally
  // promoted). Otherwise a new panel is added to the center dock. Framework-
  // level transient slot auto-evicts an existing transient panel (§ 4.4).
  function openTable(pathKey, opts) {
    if (!pathKey || !_handle) return;
    var transient = opts && opts.transient != null ? !!opts.transient : true;
    var hit = _findTablePanel(pathKey);
    if (hit) {
      _handle.activatePanel(hit.panel.id);
      if (!transient && hit.panel.transient) _handle.promotePanel(hit.panel.id);
      return;
    }
    var dockId = _centerDockId();
    if (!dockId) return;
    _handle.addPanel(dockId, {
      widget: 'gde-table-data',
      title:  _shortName(pathKey),
      props:  { pathKey: pathKey },
    }, { transient: transient });
  }
  function closeTab(pathKey) {
    var hit = _findTablePanel(pathKey);
    if (hit) _handle.removePanel(hit.panel.id);
  }
  function pinTab(pathKey) {
    var hit = _findTablePanel(pathKey);
    if (hit) _handle.promotePanel(hit.panel.id);
  }
  function closeAllTabs() {
    _allTablePanels().forEach(function (p) { _handle.removePanel(p.id); });
  }
  function setSelection(sel) {
    selection.set(sel);
    emit('selection:changed', sel);
  }

  // resolveEntityDisplay(id) — single entry point for "how does this
  // entity present itself elsewhere?". Driven entirely by the owning
  // table's struct_def.id contract:
  //   ref_name (default 'name') — the field whose value is the row's
  //                                human-readable name (combobox rows,
  //                                inspector titles, tree labels)
  //   ref_show (default unset)  — the field whose renderer paints the
  //                                visual face of the row (ref_id chip)
  // Callers don't care which table owns the id — that stays internal.
  function resolveEntityDisplay(id) {
    if (!id) return null;
    var tm = tableMap();
    var owner = null;
    var keys = Object.keys(tm);
    for (var i = 0; i < keys.length; i++) {
      if ((tm[keys[i]].id || []).indexOf(id) >= 0) { owner = keys[i]; break; }
    }
    if (!owner) return null;
    var sd = tm[owner].struct_def || {};
    var idDef = sd.id || {};
    var refName = idDef.ref_name || 'name';
    var refShow = idDef.ref_show || '';
    var entity = gameData()[id] || null;
    var nameVal = entity ? entity[refName] : null;
    var showVal = refShow && entity ? entity[refShow] : undefined;
    var showDef = refShow ? (sd[refShow] ? resolveFieldDef(sd[refShow]) : null) : null;
    return {
      name:    (nameVal != null && nameVal !== '') ? String(nameVal) : String(id),
      show:    showVal,
      showDef: showDef,
      entity:  entity,
    };
  }

  // ---------- Table format tools ----------
  // A "fix plan" is an array of change descriptors. Two kinds:
  //   { id, field, kind: 'set',    value }   // add missing / coerce type
  //   { id, field, kind: 'delete' }          // drop extra field
  // previewFixTable never mutates — it's a pure read that UI uses to
  // render a confirm dialog; applyFixes executes the plan in one batch.
  function _coerceValue(v, baseType) {
    if (baseType === 'int') {
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      var n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    if (baseType === 'float') {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      var f = Number(v);
      return Number.isFinite(f) ? f : 0;
    }
    if (baseType === 'string') {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }
    if (baseType === 'bool') {
      return !!v;
    }
    if (baseType === 'array') return Array.isArray(v) ? v : [];
    if (baseType === 'struct' || baseType === 'var') return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    return v;
  }
  function _baseTypeOk(v, baseType) {
    if (baseType === 'int')    return typeof v === 'number' && Number.isFinite(v) && Math.trunc(v) === v;
    if (baseType === 'float')  return typeof v === 'number' && Number.isFinite(v);
    if (baseType === 'string') return typeof v === 'string';
    if (baseType === 'bool')   return typeof v === 'boolean';
    if (baseType === 'array')  return Array.isArray(v);
    if (baseType === 'struct' || baseType === 'var') return v && typeof v === 'object' && !Array.isArray(v);
    return true;  // id, ref_id, enum_* — treat leniently
  }
  function _defaultFor(fd) {
    if (fd == null) return '';
    if (fd.default !== undefined) {
      try { return JSON.parse(JSON.stringify(fd.default)); } catch (_) { return fd.default; }
    }
    var bt = fd.base_type;
    if (bt === 'int' || bt === 'float') return 0;
    if (bt === 'string') return '';
    if (bt === 'bool') return false;
    if (bt === 'array') return [];
    if (bt === 'struct' || bt === 'var') return {};
    return null;
  }

  function checkTableData(pathKey) {
    var tbl = tableMap()[pathKey];
    if (!tbl) return [];
    var sd = tbl.struct_def || {};
    var ids = tbl.id || [];
    var gd = gameData();
    var issues = [];
    // Unknown type names (not in type_config) — collected once per table.
    var knownTypes = Object.assign({}, builtinTypeConfig(), projectTypeConfig());
    Object.keys(sd).forEach(function (f) {
      if (!knownTypes[f]) issues.push({ kind: 'unknown-type', field: f });
    });
    ids.forEach(function (id) {
      var e = gd[id] || {};
      // Missing / type-mismatched
      Object.keys(sd).forEach(function (f) {
        var fd = resolveFieldDef(sd[f]);
        if (!fd) return;
        if (!(f in e)) issues.push({ kind: 'missing', id: id, field: f });
        else if (!_baseTypeOk(e[f], fd.base_type)) issues.push({ kind: 'mismatch', id: id, field: f, have: typeof e[f], want: fd.base_type });
      });
      // Extra
      Object.keys(e).forEach(function (f) {
        if (!(f in sd)) issues.push({ kind: 'extra', id: id, field: f });
      });
    });
    // Log summary + per-issue
    if (!issues.length) {
      log('info', 'Check: table "' + pathKey + '" OK — no issues');
    } else {
      log('warn', 'Check: table "' + pathKey + '" has ' + issues.length + ' issue(s)');
      issues.slice(0, 50).forEach(function (i) {
        var msg = i.kind === 'unknown-type' ? 'unknown field type "' + i.field + '" (not in type_config)'
                : i.kind === 'missing'      ? 'entity ' + i.id + ': missing "' + i.field + '"'
                : i.kind === 'mismatch'     ? 'entity ' + i.id + ': "' + i.field + '" has ' + i.have + ', want ' + i.want
                : /* extra */                 'entity ' + i.id + ': extra field "' + i.field + '"';
        log('warn', msg);
      });
      if (issues.length > 50) log('warn', '… and ' + (issues.length - 50) + ' more');
    }
    showLogPanel();
    return issues;
  }

  function previewFixTable(pathKey) {
    var tbl = tableMap()[pathKey];
    if (!tbl) return [];
    var sd = tbl.struct_def || {};
    var ids = tbl.id || [];
    var gd = gameData();
    var plan = [];
    ids.forEach(function (id) {
      var e = gd[id] || {};
      Object.keys(sd).forEach(function (f) {
        var fd = resolveFieldDef(sd[f]);
        if (!fd) return;
        if (!(f in e)) plan.push({ id: id, field: f, kind: 'set', value: _defaultFor(fd), reason: 'missing' });
        else if (!_baseTypeOk(e[f], fd.base_type)) {
          plan.push({ id: id, field: f, kind: 'set', value: _coerceValue(e[f], fd.base_type), reason: 'mismatch' });
        }
      });
      Object.keys(e).forEach(function (f) {
        if (!(f in sd)) plan.push({ id: id, field: f, kind: 'delete', reason: 'extra' });
      });
    });
    return plan;
  }

  function applyFixes(pathKey, plan) {
    var tbl = tableMap()[pathKey];
    if (!tbl) return { total: 0, changed: 0 };
    var gd = Object.assign({}, gameData());
    var touched = new Set();
    plan.forEach(function (c) {
      var e = Object.assign({}, gd[c.id] || {});
      if (c.kind === 'set') e[c.field] = c.value;
      else if (c.kind === 'delete') delete e[c.field];
      gd[c.id] = e;
      touched.add(c.id);
    });
    gameData.set(gd);
    emit('data:changed:' + pathKey);
    emit('data:changed', { pathKey: pathKey });
    return { total: (tbl.id || []).length, changed: touched.size };
  }

  // mergeStructDef(pathKey) — normalize a table's struct_def against the
  // project/builtin TypeConfig, promoting "ad-hoc" field definitions into
  // reusable project dictionary entries.
  //
  //   missing in TC            → push resolved identity as a new project TC
  //                              entry; struct_def entry reduces to { type: name }
  //   in TC, format matches    → skip (leave overrides intact)
  //   in TC, format mismatches  → reduce struct_def entry to { type: name } so
  //                              field inherits TC cleanly (the rejected
  //                              overrides disappear)
  //
  // "format" here = base_type + type_render (the type's identity). Non-identity
  // attributes (mem / default / type_agv / card_style / ref_name / ref_show)
  // migrate into the newly-pushed TC entry on push; they get dropped on clear.
  function previewMergeStructDef(pathKey) {
    var tbl = tableMap()[pathKey];
    if (!tbl) return { pushed: [], cleared: [], skipped: [] };
    var sd = tbl.struct_def || {};
    var tc = Object.assign({}, builtinTypeConfig(), projectTypeConfig());
    var pushed = [], cleared = [], skipped = [];
    Object.keys(sd).forEach(function (f) {
      var r = resolveFieldDef(sd[f]);
      var existing = tc[f];
      if (!existing) {
        if (r) pushed.push(f);
        else   cleared.push(f);   // no identity anywhere — best we can do is strip
      } else {
        var resolvedBase   = (r && r.base_type)   || '';
        var resolvedRender = (r && r.type_render) || '';
        if (resolvedBase === (existing.base_type || '')
         && resolvedRender === (existing.type_render || '')) {
          skipped.push(f);
        } else {
          cleared.push(f);
        }
      }
    });
    return { pushed: pushed, cleared: cleared, skipped: skipped };
  }

  function mergeStructDef(pathKey) {
    var tbl = tableMap()[pathKey];
    if (!tbl) return null;
    var sd = tbl.struct_def || {};
    var tcMerged = Object.assign({}, builtinTypeConfig(), projectTypeConfig());
    var newPTC = Object.assign({}, projectTypeConfig());
    var newSd = Object.assign({}, sd);
    var pushed = [], cleared = [], skipped = [];

    Object.keys(sd).forEach(function (f) {
      var entry = sd[f];
      var resolved = resolveFieldDef(entry);
      var existing = tcMerged[f];

      if (!existing) {
        if (!resolved) { newSd[f] = { type: f }; cleared.push(f); return; }
        var nu = {
          name:        entry.name || f,
          base_type:   resolved.base_type   || 'string',
          type_render: resolved.type_render || 'input_string',
        };
        ['default','mem','type_agv','card_style','ref_name','ref_show'].forEach(function (k) {
          if (resolved[k] !== undefined) nu[k] = resolved[k];
        });
        newPTC[f] = nu;
        newSd[f]  = { type: f };
        pushed.push(f);
      } else {
        var rb = (resolved && resolved.base_type)   || '';
        var rr = (resolved && resolved.type_render) || '';
        if (rb === (existing.base_type || '') && rr === (existing.type_render || '')) {
          skipped.push(f);
        } else {
          newSd[f] = { type: f };
          cleared.push(f);
        }
      }
    });

    // Commit once each — avoid double-emitting tables:changed if nothing changed.
    if (pushed.length) setProjectTypeConfig(newPTC);
    if (pushed.length || cleared.length) updateStructDef(pathKey, newSd);

    log('info', 'Merge: "' + pathKey + '" — pushed ' + pushed.length
                + ', cleared ' + cleared.length
                + ', skipped ' + skipped.length);
    if (pushed.length)  log('info', 'Pushed to TypeConfig: ' + pushed.join(', '));
    if (cleared.length) log('warn', 'Cleared overrides (format mismatch or no identity): ' + cleared.join(', '));
    showLogPanel();
    return { pushed: pushed, cleared: cleared, skipped: skipped };
  }

  function showLogPanel() {
    if (!_handle || !_handle.setDockCollapsed) return;
    _handle.setDockCollapsed('log', false);
    // Find + activate log panel too so it's in front.
    var t = _handle.tree(), logPanelId = null;
    (function walk(n) {
      if (!n) return;
      if (n.type === 'dock') {
        (n.panels || []).forEach(function (p) { if (p.widget === 'log') logPanelId = p.id; });
      } else if (n.children) {
        n.children.forEach(walk);
      }
    })(t);
    if (logPanelId) _handle.activatePanel(logPanelId);
  }

  // ---------- Logging ----------
  // All logging flows through EF.log (framework signal). State.log is a
  // thin convenience wrapper that fixes scope='gde' so the built-in 'log'
  // widget can group app messages.
  function log(level, message, meta) {
    return EF.log.push(level || 'info', Object.assign({ scope: 'gde' }, meta || {}), message);
  }
  function clearLogs() { EF.log.clear(); }

  // ---------- Expose ----------
  window.State = {
    // signals
    version: version,
    builtinTypeConfig: builtinTypeConfig,
    projectTypeConfig: projectTypeConfig,
    projectCardStyles: projectCardStyles,
    activeCardStyle:   activeCardStyle,
    gameData: gameData,
    tableMap: tableMap,
    projectName: projectName,
    activeTable: activeTable,
    selection: selection,
    // Framework-native log signal — gde widgets and framework widgets see
    // the same entries. Exposed for callers that read State.logs().
    logs: EF.log,

    // Layout glue — called once from main.js after createDockLayout.
    _setLayout: _setLayout,

    // resolvers
    resolveType: resolveType,
    resolveFieldDef: resolveFieldDef,
    resolveEntityDisplay: resolveEntityDisplay,
    findTypeUsages: findTypeUsages,
    genId: genId,

    // table format tools
    checkTableData: checkTableData,
    previewFixTable: previewFixTable,
    applyFixes: applyFixes,
    previewMergeStructDef: previewMergeStructDef,
    mergeStructDef: mergeStructDef,
    showLogPanel: showLogPanel,

    // mutators
    setBuiltinTypeConfig: setBuiltinTypeConfig,
    setProjectTypeConfig: setProjectTypeConfig,
    upsertProjectType: upsertProjectType,
    deleteProjectType: deleteProjectType,
    renameProjectType: renameProjectType,
    setProjectCardStyles: setProjectCardStyles,
    upsertCardStyle:      upsertCardStyle,
    deleteCardStyle:      deleteCardStyle,
    renameCardStyle:      renameCardStyle,
    setTableCardStyle:    setTableCardStyle,
    resolveCardStyleForTable: resolveCardStyleForTable,
    setTableMap: setTableMap,
    setGameData: setGameData,
    addTable: addTable,
    renameTable: renameTable,
    deleteTable: deleteTable,
    updateStructDef: updateStructDef,
    setTableIds: setTableIds,
    addEntity: addEntity,
    deleteEntities: deleteEntities,
    updateEntity: updateEntity,
    setEntityField: setEntityField,
    setActiveTable: setActiveTable,
    openTable: openTable,
    closeTab: closeTab,
    pinTab: pinTab,
    closeAllTabs: closeAllTabs,
    setSelection: setSelection,
    log: log,
    clearLogs: clearLogs,
  };
})();
