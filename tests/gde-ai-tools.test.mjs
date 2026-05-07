import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = {}
global.EF = {
  ai: {},
  safeCall: null,
}
global.window.EF = global.EF

vm.runInThisContext(readFileSync('src/ai/context.js', 'utf8'), {
  filename: 'src/ai/context.js',
})
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), {
  filename: 'src/core/signal.js',
})
vm.runInThisContext(readFileSync('src/ai/change-set.js', 'utf8'), {
  filename: 'src/ai/change-set.js',
})

let lastPatchCall = null
const tableMap = {
  'data/items': {
    id: ['100', '200'],
    struct_def: {
      name: 'string',
      price: 'int',
      kind: 'string',
    },
  },
}
const gameData = {
  100: { name: 'Sword', price: 10, kind: 'weapon' },
  200: { name: 'Potion', price: 5, kind: 'consumable' },
}

global.State = {
  findAssetReferences: () => [],
  tableMap: () => tableMap,
  gameData: () => gameData,
}

global.GDE = {
  ai: {
    clone: (value) => value == null ? value : JSON.parse(JSON.stringify(value)),
    patch: (patch, opts) => {
      lastPatchCall = { patch, opts }
      if (opts && opts.apply) return { applied: true, patch }
      return {
        ok: true,
        type: 'gde.patch.preview',
        title: patch.title || 'Preview',
        patch,
        validation: { ok: true, errors: [] },
        changes: [],
      }
    },
    projectSummary: () => ({}),
    resolveResource: () => ({}),
    typePayload: () => ({}),
    queryRows: (args) => {
      const table = tableMap[args.table]
      if (!table) return null
      let ids = (args.ids && args.ids.length ? args.ids : table.id).map(String)
      if (args.field) {
        ids = ids.filter((id) => {
          const value = gameData[id] && gameData[id][args.field]
          if (args.value !== undefined) return String(value) === String(args.value)
          if (args.query != null) return String(value == null ? '' : value).toLowerCase().includes(String(args.query).toLowerCase())
          return value !== undefined
        })
      } else if (args.query) {
        ids = ids.filter((id) => String(id).includes(args.query) || Object.values(gameData[id] || {}).some((v) => String(v).includes(args.query)))
      }
      return { table: args.table, total: ids.length, rows: ids.map((id) => ({ id, entity: gameData[id] })) }
    },
    entityPayload: () => ({}),
    fieldPayload: () => ({}),
    cardStylePayload: () => ({}),
    cardStyleNodePayload: () => ({}),
    fieldTypeName: (def) => typeof def === 'string' ? def : (def && def.type) || '',
  },
}
global.window.GDE = global.GDE

vm.runInThisContext(readFileSync('temp/GameDataEditor/src/ai/change-set.js', 'utf8'), {
  filename: 'temp/GameDataEditor/src/ai/change-set.js',
})
vm.runInThisContext(readFileSync('temp/GameDataEditor/src/ai/patch-ops.js', 'utf8'), {
  filename: 'temp/GameDataEditor/src/ai/patch-ops.js',
})
vm.runInThisContext(readFileSync('temp/GameDataEditor/src/ai/tools.js', 'utf8'), {
  filename: 'temp/GameDataEditor/src/ai/tools.js',
})

GDE.ai.registerChangeSetAdapter()

GDE.ai.registerTools()

assert.equal(EF.ai.getTool('gde.proposePatch'), undefined)

const previewTool = EF.ai.getTool('gde.previewPatch')
assert.equal(typeof previewTool.run, 'function')
assert.equal(typeof previewTool.apply, 'function')
assert.deepEqual(previewTool.permissions, { call: true, apply: true })
assert.equal(previewTool.schema.type, 'object')
assert.equal(previewTool.schema.properties.patch.properties.ops.items.oneOf.some((item) => item.properties.op.enum[0] === 'setFieldMany'), true)
assert.deepEqual(EF.ai.getTool('gde.getTableEntities').schema.value, {})
assert.deepEqual(EF.ai.getTool('gde.queryRows').schema.value, {})

const patch = {
  type: 'gde.patch',
  title: 'Set price',
  ops: [{ op: 'setField', table: 'data/items', id: '100', field: 'price', value: 42 }],
}
const preview = previewTool.run({ patch })
assert.equal(preview.type, 'ef.changeSet')
assert.deepEqual(preview.apply.payload, patch)
assert.equal(preview.summary.changeCount, 0)
assert.deepEqual(lastPatchCall.opts, { dryRun: true })

const applied = previewTool.apply(preview)
assert.equal(applied.applied, true)
assert.deepEqual(applied.patch, patch)
assert.deepEqual(lastPatchCall.opts, { apply: true })

GDE.ai.patch = (nextPatch, opts) => {
  lastPatchCall = { patch: nextPatch, opts }
  if (opts && opts.apply) {
    return {
      ok: false,
      patch: nextPatch,
      validation: { errors: [{ path: 'ops[0]', message: 'bad patch' }] },
      changes: [],
    }
  }
  return { ok: true, patch: nextPatch, validation: { ok: true, errors: [] }, changes: [] }
}
const failedApply = previewTool.apply(preview)
assert.equal(failedApply.applied, undefined)
assert.equal(failedApply.ok, false)

const applyTool = EF.ai.getTool('gde.applyPatch')
assert.equal(typeof applyTool.apply, 'function')

const batchSet = EF.ai.getTool('gde.planBatchSetFields').run({
  table: 'data/items',
  ids: ['100', '200'],
  fields: { kind: 'loot' },
})
assert.equal(batchSet.type, 'ef.changeSet')
assert.deepEqual(batchSet.apply.payload.ops, [
  { op: 'setFieldMany', table: 'data/items', ids: ['100', '200'], field: 'kind', value: 'loot' },
])
assert.deepEqual(EF.ai.getTool('gde.planBatchSetFields').schema.required, ['table'])
assert.equal(EF.ai.getTool('gde.planBatchCreateEntities').schema.properties.entities.minItems, 1)

const batchCreate = EF.ai.getTool('gde.planBatchCreateEntities').run({
  table: 'data/items',
  entities: [{ id: '300', name: 'Axe', price: 20, kind: 'weapon' }],
})
assert.equal(batchCreate.type, 'ef.changeSet')
assert.deepEqual(batchCreate.apply.payload.ops[0], {
  op: 'addEntity',
  table: 'data/items',
  id: '300',
  entity: { name: 'Axe', price: 20, kind: 'weapon' },
})

const batchDelete = EF.ai.getTool('gde.planBatchDeleteEntities').run({
  table: 'data/items',
  filterField: 'kind',
  filterValue: 'weapon',
})
assert.equal(batchDelete.type, 'ef.changeSet')
assert.deepEqual(batchDelete.apply.payload.ops[0], { op: 'deleteEntities', table: 'data/items', ids: ['100'] })

const balance = EF.ai.getTool('gde.planBalanceNumericField').run({
  table: 'data/items',
  ids: ['100', '200'],
  field: 'price',
  multiplier: 2,
  add: 1,
  round: true,
})
assert.equal(balance.type, 'ef.changeSet')
assert.deepEqual(balance.apply.payload.ops.map((op) => op.value), [21, 11])

const badBatch = EF.ai.getTool('gde.planBatchSetFields').run({
  table: 'data/items',
  ids: ['100'],
  fields: { missing: 1 },
})
assert.equal(badBatch.ok, false)
assert.equal(badBatch.errors[0].code, 'FIELD_NOT_FOUND')
assert.deepEqual(badBatch.errors[0].allowedValues, ['kind', 'name', 'price'])

console.log('gde ai tools tests ok')
