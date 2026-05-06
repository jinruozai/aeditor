/**
 * GDE.ai patch operation registry.
 *
 * This is intentionally metadata-first. The patch runner still owns state
 * mutation, but operation names, target requirements, and review categories
 * live in one table so tools, validators, and future schemas do not drift.
 */
(function () {
  'use strict';

  var ops = {};

  function register(spec) {
    ops[spec.op] = spec;
    return spec;
  }

  function get(op) {
    return ops[op] || null;
  }

  function has(op) {
    return !!ops[op];
  }

  function list() {
    return Object.keys(ops).map(function (op) { return ops[op]; });
  }

  function requiresTable(op) {
    var spec = get(op);
    return !!(spec && spec.requiresTable);
  }

  function requiresEntity(op) {
    var spec = get(op);
    return !!(spec && spec.requiresEntity);
  }

  function operation(op) {
    var spec = get(op);
    return spec && spec.operation || 'update';
  }

  function target(op) {
    var spec = get(op);
    return spec && spec.target || 'project';
  }

  function installDefaults() {
    [
      { op: 'setField', title: 'Set field', operation: 'update', target: 'field', requiresTable: true, requiresEntity: true },
      { op: 'setFieldMany', title: 'Set field on many entities', operation: 'update', target: 'entityList', requiresTable: true },
      { op: 'setFields', title: 'Set fields', operation: 'update', target: 'entity', requiresTable: true, requiresEntity: true },
      { op: 'setFieldsMany', title: 'Set fields on many entities', operation: 'update', target: 'entityList', requiresTable: true },
      { op: 'addEntity', title: 'Add entity', operation: 'insert', target: 'entity', requiresTable: true },
      { op: 'updateEntity', title: 'Update entity', operation: 'update', target: 'entity', requiresTable: true, requiresEntity: true },
      { op: 'deleteEntity', title: 'Delete entity', operation: 'delete', target: 'entity', requiresTable: true, requiresEntity: true },
      { op: 'deleteEntities', title: 'Delete entities', operation: 'delete', target: 'entityList', requiresTable: true },
      { op: 'duplicateEntity', title: 'Duplicate entity', operation: 'insert', target: 'entity', requiresTable: true, requiresEntity: true },
      { op: 'reorderEntities', title: 'Reorder entities', operation: 'update', target: 'table', requiresTable: true },

      { op: 'addTable', title: 'Add table', operation: 'insert', target: 'table' },
      { op: 'renameTable', title: 'Rename table', operation: 'update', target: 'table', requiresTable: true },
      { op: 'deleteTable', title: 'Delete table', operation: 'delete', target: 'table', requiresTable: true },
      { op: 'updateStructDef', title: 'Update table schema', operation: 'update', target: 'table', requiresTable: true },
      { op: 'setTableCardStyle', title: 'Set table CardStyle', operation: 'update', target: 'table', requiresTable: true },

      { op: 'upsertType', title: 'Upsert TypeConfig entry', operation: 'insert', target: 'type' },
      { op: 'deleteType', title: 'Delete TypeConfig entry', operation: 'delete', target: 'type' },

      { op: 'upsertCardStyle', title: 'Upsert CardStyle', operation: 'insert', target: 'cardStyle' },
      { op: 'updateCardNode', title: 'Update CardStyle node', operation: 'update', target: 'cardNode' },
      { op: 'addCardNode', title: 'Add CardStyle node', operation: 'insert', target: 'cardNode' },
      { op: 'deleteCardNode', title: 'Delete CardStyle node', operation: 'delete', target: 'cardNode' },

      { op: 'setAssetReference', title: 'Set asset reference', operation: 'update', target: 'field', requiresTable: true, requiresEntity: true },
      { op: 'clearAssetReference', title: 'Clear asset reference', operation: 'update', target: 'field', requiresTable: true, requiresEntity: true },
    ].forEach(register);
  }

  window.GDE = window.GDE || {};
  GDE.ai = GDE.ai || {};
  GDE.ai.patchOps = {
    register: register,
    get: get,
    has: has,
    list: list,
    requiresTable: requiresTable,
    requiresEntity: requiresEntity,
    operation: operation,
    target: target,
  };

  installDefaults();
})();
