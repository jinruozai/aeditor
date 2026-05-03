/**
 * GDE.ai tool registrations.
 */
(function () {
  'use strict';

  var clone = GDE.ai.clone;

  function registerTools() {
    tool('gde.getProjectSummary', 'Get project summary', 'Read project counts and high-level metadata.', {}, function () {
      return GDE.ai.projectSummary();
    });
    tool('gde.getTypeConfig', 'Get TypeConfig', 'Read builtin and project TypeConfig.', {}, function () {
      return GDE.ai.resolveResource({ uri: 'gde://type-config' });
    });
    tool('gde.getTableSchema', 'Get table schema', 'Read a table struct_def and card style key.', { pathKey: 'string' }, function (args) {
      var t = State.tableMap()[args.pathKey];
      return t ? { pathKey: args.pathKey, struct_def: clone(t.struct_def || {}), card_style: t.card_style || 'default', ids: (t.id || []).slice() } : null;
    });
    tool('gde.getTableEntities', 'Get table entities', 'Read paged/projected entities from a table.', {
      pathKey: 'string', table: 'string', ids: 'array', fields: 'array', offset: 'number', limit: 'number', field: 'string', value: 'any', query: 'string'
    }, function (args) {
      return GDE.ai.queryRows(args);
    });
    tool('gde.queryRows', 'Query table rows', 'Read rows by table/id/field with pagination, projection, and simple filters.', {
      table: 'string', ids: 'array', fields: 'array', offset: 'number', limit: 'number', field: 'string', value: 'any', query: 'string'
    }, function (args) {
      return GDE.ai.queryRows(args);
    });
    tool('gde.getEntity', 'Get entity', 'Read one entity with its table schema.', { table: 'string', id: 'string' }, function (args) {
      return GDE.ai.entityPayload(args.table, args.id);
    });
    tool('gde.getField', 'Get field', 'Read one field value with FieldDef and resolved TypeConfig.', { table: 'string', id: 'string', field: 'string' }, function (args) {
      return GDE.ai.fieldPayload(args.table, args.id, args.field);
    });
    tool('gde.validatePatch', 'Validate GDE patch', 'Validate a patch without applying it.', { patch: 'gde.patch' }, function (args) {
      return GDE.ai.validatePatch(args.patch || args);
    });
    tool('gde.findReferences', 'Find references', 'Find ref_id and raw id references to an entity.', { id: 'string' }, function (args) {
      return findReferences(args.id);
    });
    tool('gde.findAssetReferences', 'Find asset references', 'Find project data references to asset URLs.', { urls: 'array' }, function (args) {
      return State.findAssetReferences(args.urls || (args.url ? [args.url] : []));
    });
    tool('gde.searchData', 'Search data', 'Search tables, ids, field names, and values.', { query: 'string', limit: 'number' }, function (args) {
      return searchData(args.query, args.limit || 50);
    });
    tool('gde.getCardStyle', 'Get CardStyle', 'Read a project CardStyle tree and bindings.', { styleKey: 'string' }, function (args) {
      return GDE.ai.cardStylePayload(args.styleKey || 'default');
    });

    EF.ai.registerTool('gde.proposePatch', {
      title: 'Propose GDE patch',
      description: 'Return a validated GDE patch proposal without applying it.',
      schema: { patch: 'gde.patch' },
      permissions: { call: true, apply: false },
      preview: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
      run: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
    });
    EF.ai.registerTool('gde.previewPatch', {
      title: 'Preview GDE patch',
      description: 'Validate and preview a GDE patch.',
      schema: { patch: 'gde.patch' },
      permissions: { call: true, apply: false },
      preview: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
      run: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
    });
    EF.ai.registerTool('gde.applyPatch', {
      title: 'Apply GDE patch',
      description: 'Apply an approved GDE patch through State and History.',
      schema: { patch: 'gde.patch' },
      permissions: { call: true, apply: true },
      preview: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
      run: function (args) { return GDE.ai.patch(args.patch || args, { dryRun: true }); },
      apply: function (result) {
        var patch = result && result.type === 'gde.patch' ? result : (result && result.patch) || null;
        if (!patch && result && result.validation && result.changes) patch = result.patch;
        return GDE.ai.patch(patch || result, { apply: true });
      },
    });
  }

  function tool(id, title, description, schema, run) {
    EF.ai.registerTool(id, {
      title: title,
      description: description,
      schema: schema,
      permissions: { call: true, apply: false },
      run: run,
    });
  }

  function findReferences(id) {
    var sid = String(id);
    var out = [];
    var tm = State.tableMap();
    var gd = State.gameData();
    Object.keys(tm).forEach(function (pathKey) {
      var sd = tm[pathKey].struct_def || {};
      (tm[pathKey].id || []).forEach(function (entityId) {
        var entity = gd[entityId] || {};
        Object.keys(entity).forEach(function (field) {
          if (String(entity[field]) === sid) {
            out.push({ table: pathKey, id: entityId, field: field, kind: GDE.ai.fieldTypeName(sd[field]) === 'ref_id' ? 'ref_id' : 'value' });
          }
        });
      });
    });
    return out;
  }

  function searchData(query, limit) {
    var q = String(query || '').toLowerCase();
    var out = [];
    var tm = State.tableMap();
    var gd = State.gameData();
    Object.keys(tm).forEach(function (pathKey) {
      if (pathKey.toLowerCase().indexOf(q) >= 0) out.push({ kind: 'table', table: pathKey });
      Object.keys(tm[pathKey].struct_def || {}).forEach(function (field) {
        if (field.toLowerCase().indexOf(q) >= 0) out.push({ kind: 'field', table: pathKey, field: field });
      });
      (tm[pathKey].id || []).forEach(function (id) {
        var entity = gd[id] || {};
        if (String(id).toLowerCase().indexOf(q) >= 0) out.push({ kind: 'entity', table: pathKey, id: id, entity: clone(entity) });
        Object.keys(entity).forEach(function (field) {
          var value = entity[field];
          if (String(value == null ? '' : value).toLowerCase().indexOf(q) >= 0) out.push({ kind: 'value', table: pathKey, id: id, field: field, value: clone(value) });
        });
      });
    });
    return out.slice(0, Math.max(1, Number(limit || 50)));
  }

  GDE.ai.findReferences = findReferences;
  GDE.ai.registerTools = registerTools;
})();
