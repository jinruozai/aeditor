/**
 * ProjectIO.codec — pure conversion between State snapshots and the on-disk
 * GameDataEditor project format.
 *
 * Disk:
 *   gamedata.json                 optional project/type_config/card_styles
 *   <table path>.json             { _table:{struct_def,card_style}, <id>:entity }
 */
(function () {
  'use strict';

  function deepClone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  function tablePathToFile(pathKey) {
    return String(pathKey).replace(/^\/+|\/+$/g, '') + '.json';
  }

  function fileToTablePath(filePath) {
    return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.json$/i, '');
  }

  function exportSnapshot() {
    var tm = State.tableMap();
    var gd = State.gameData();
    var tables = {};
    Object.keys(tm).sort().forEach(function (pathKey) {
      var table = tm[pathKey] || {};
      var ids = (table.id || []).slice();
      var entities = {};
      ids.forEach(function (id) {
        entities[id] = deepClone(gd[id] || {});
      });
      tables[pathKey] = {
        struct_def: deepClone(table.struct_def || {}),
        card_style: table.card_style || 'default',
        id: ids,
        entities: entities,
      };
    });
    return {
      project: {
        name: State.projectName() || 'Untitled',
        version: State.version(),
      },
      type_config: deepClone(State.projectTypeConfig() || {}),
      card_styles: deepClone(State.projectCardStyles() || {}),
      tables: tables,
    };
  }

  function applySnapshot(snapshot, sourceName) {
    var snap = normalizeSnapshot(snapshot);
    validateStructTypes(snap.type_config, snap.tables);
    State.setProjectTypeConfig(snap.type_config);
    State.setProjectCardStyles(snap.card_styles);
    State.setGameData(flattenGameData(snap.tables));
    State.setTableMap(buildTableMap(snap.tables));
    State.projectName.set((snap.project && snap.project.name) || sourceName || 'Untitled');
    State.version.set((snap.project && Number(snap.project.version)) || 0);
    State.closeAllTabs();
    State.setSelection(null);
    Normalize.normalizeAll();
  }

  function normalizeSnapshot(snapshot) {
    var s = snapshot || {};
    var cardStyles = deepClone(s.card_styles || {});
    if (!cardStyles.default) cardStyles.default = defaultCardStyle();
    return {
      project: s.project || {},
      type_config: s.type_config || {},
      card_styles: cardStyles,
      tables: s.tables || {},
    };
  }

  function defaultCardStyle() {
    return {
      name: 'Default',
      root: {
        id: 'root',
        component: 'absolute',
        props: { width: 120, height: 168, background: 'var(--ef-bg-0)', borderRadius: 6 },
        bindings: {},
        children: [{
          id: 'id-text',
          component: 'text',
          props: { textAlign: 'center', size: 'sm' },
          bindings: { value: { source: 'field', field: 'id' } },
          layout: {
            aMin: { x: 0, y: 1 }, aMax: { x: 1, y: 1 },
            oMin: { x: 0, y: -22 }, oMax: { x: 0, y: -4 },
          },
          children: [],
        }],
      },
    };
  }

  function flattenGameData(tables) {
    var gd = {};
    Object.keys(tables || {}).forEach(function (pathKey) {
      var table = tables[pathKey] || {};
      var entities = table.entities || {};
      (table.id || Object.keys(entities)).forEach(function (id) {
        if (gd[id]) {
          log('error', 'Duplicate entity id "' + id + '" in table ' + pathKey);
          return;
        }
        gd[id] = deepClone(entities[id] || {});
      });
    });
    return gd;
  }

  function buildTableMap(tables) {
    var tm = {};
    Object.keys(tables || {}).forEach(function (pathKey) {
      var table = tables[pathKey] || {};
      var entities = table.entities || {};
      tm[pathKey] = {
        struct_def: deepClone(table.struct_def || {}),
        card_style: table.card_style || 'default',
        id: (table.id || Object.keys(entities)).slice(),
      };
    });
    return tm;
  }

  function snapshotToFiles(snapshot) {
    var snap = normalizeSnapshot(snapshot);
    var files = {};
    files['gamedata.json'] = stableStringify({
      project: snap.project || {},
      type_config: snap.type_config || {},
      card_styles: snap.card_styles || {},
    });
    Object.keys(snap.tables || {}).sort().forEach(function (pathKey) {
      var table = snap.tables[pathKey] || {};
      var out = {
        _table: {
          struct_def: table.struct_def || {},
          card_style: table.card_style || 'default',
        },
      };
      (table.id || Object.keys(table.entities || {})).forEach(function (id) {
        out[id] = (table.entities || {})[id] || {};
      });
      files[tablePathToFile(pathKey)] = stableStringify(out);
    });
    return files;
  }

  function filesToSnapshot(files) {
    var meta = parseJson('gamedata.json', files['gamedata.json']) || {};
    var tables = {};
    Object.keys(files).sort().forEach(function (path) {
      if (path === 'gamedata.json' || !/\.json$/i.test(path)) return;
      var raw = parseJson(path, files[path]);
      if (!raw || !raw._table) return;
      var tableDef = raw._table || {};
      var entities = {};
      var ids = [];
      Object.keys(raw).forEach(function (id) {
        if (id === '_table') return;
        ids.push(id);
        entities[id] = raw[id];
      });
      tables[fileToTablePath(path)] = {
        struct_def: tableDef.struct_def || {},
        card_style: tableDef.card_style || 'default',
        id: ids,
        entities: entities,
      };
    });
    return {
      project: meta.project || {},
      type_config: meta.type_config || {},
      card_styles: meta.card_styles || {},
      tables: tables,
    };
  }

  function parseJson(path, text) {
    if (text == null) return null;
    try { return JSON.parse(text); }
    catch (e) {
      log('error', 'Invalid JSON in ' + path + ': ' + e.message);
      return null;
    }
  }

  function validateStructTypes(projectTypeConfig, tables) {
    var known = Object.assign({}, State.builtinTypeConfig ? State.builtinTypeConfig() : {}, projectTypeConfig || {});
    Object.keys(tables || {}).forEach(function (pathKey) {
      var sd = (tables[pathKey] && tables[pathKey].struct_def) || {};
      Object.keys(sd).forEach(function (field) {
        var typeName = fieldTypeName(sd[field]);
        if (typeName && !known[typeName]) {
          log('error', 'Import type missing: ' + pathKey + '.' + field + ' uses "' + typeName + '"');
        }
      });
    });
  }

  function fieldTypeName(def) {
    if (typeof def === 'string') return def;
    if (def && typeof def === 'object' && typeof def.type === 'string') return def.type;
    return '';
  }

  function log(level, message) {
    if (window.State && State.log) State.log(level, message);
  }

  function stableStringify(obj) {
    return JSON.stringify(obj, null, 2) + '\n';
  }

  window.ProjectIO = window.ProjectIO || {};
  window.ProjectIO.codec = {
    exportSnapshot: exportSnapshot,
    applySnapshot: applySnapshot,
    snapshotToFiles: snapshotToFiles,
    filesToSnapshot: filesToSnapshot,
    tablePathToFile: tablePathToFile,
    fileToTablePath: fileToTablePath,
    defaultCardStyle: defaultCardStyle,
  };
})();
