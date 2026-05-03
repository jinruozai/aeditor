import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = {}

let tableMap = {
  'data/items': {
    id: ['100', '200'],
    struct_def: {
      name: 'string',
      price: 'int',
      icon: 'img',
      target: 'ref_id',
      meta: 'item_meta',
    },
    card_style: 'default',
  },
}

let gameData = {
  100: {
    name: 'Iron Sword',
    price: 20,
    icon: 'asset://icon.png',
    target: '',
    meta: { rarity: 'common' },
  },
  200: {
    name: 'Steel Sword',
    price: 50,
    icon: '',
    target: '100',
    meta: { rarity: 'rare' },
  },
}

let projectTypes = {
  item_meta: {
    base_type: 'struct',
    type_render: 'struct',
    struct_def: {
      item_meta: {
        rarity: 'string',
      },
    },
  },
}

let cardStyles = {
  default: {
    name: 'Default',
    root: {
      id: 'root',
      component: 'absolute',
      props: { width: 120, height: 168 },
      bindings: {},
      children: [
        {
          id: 'name-text',
          component: 'text',
          props: { value: 'Name', size: 'sm' },
          bindings: { value: { source: 'field', field: 'name' } },
          layout: { oMin: { x: 0, y: -30 }, oMax: { x: 0, y: -10 } },
          children: [],
        },
      ],
    },
  },
}

let historyEntry = null

global.State = {
  tableMap: () => tableMap,
  gameData: () => gameData,
  builtinTypeConfig: () => ({
    int: { base_type: 'int', type_render: 'input_int' },
    string: { base_type: 'string', type_render: 'input_string' },
    img: { base_type: 'string', type_render: 'img' },
    ref_id: { base_type: 'string', type_render: 'ref_id' },
  }),
  projectTypeConfig: () => projectTypes,
  projectCardStyles: () => cardStyles,
  resolveFieldDef: function (def) {
    const name = typeof def === 'string' ? def : def && def.type
    return this.builtinTypeConfig()[name] || projectTypes[name] || null
  },
  setEntityField: (id, field, value) => {
    gameData[id] = Object.assign({}, gameData[id], { [field]: value })
  },
  setEntityFieldMany: (ids, field, value) => {
    ids.forEach((id) => { gameData[id] = Object.assign({}, gameData[id], { [field]: value }) })
  },
  updateEntity: (id, fields) => {
    gameData[id] = Object.assign({}, gameData[id], fields)
  },
  addEntity: (table, entity) => {
    const id = String(entity.id || '300')
    gameData[id] = Object.assign({}, entity)
    tableMap[table].id = tableMap[table].id.concat([id])
    return id
  },
  deleteEntities: (table, ids) => {
    ids.forEach((id) => { delete gameData[id] })
    tableMap[table].id = tableMap[table].id.filter((id) => ids.indexOf(id) < 0)
  },
  setGameData: (next) => { gameData = next },
  setTableIds: (table, ids) => { tableMap[table].id = ids },
  addTable: (table, structDef) => { tableMap[table] = { id: [], struct_def: structDef } },
  renameTable: (table, next) => { tableMap[next] = tableMap[table]; delete tableMap[table] },
  deleteTable: (table) => { delete tableMap[table] },
  updateStructDef: (table, structDef) => { tableMap[table].struct_def = structDef },
  upsertProjectType: (name, config) => { projectTypes[name] = config },
  deleteProjectType: (name) => { delete projectTypes[name] },
  setTableCardStyle: (table, styleKey) => { tableMap[table].card_style = styleKey },
  upsertCardStyle: (key, cardStyle) => { cardStyles[key] = cardStyle },
  mutateCardStyle: (key, fn) => {
    const next = JSON.parse(JSON.stringify(cardStyles[key]))
    fn(next)
    cardStyles[key] = next
  },
  log: () => {},
}

global.ProjectIO = {
  assets: {
    exists: (url) => url === 'asset://icon.png' || url === 'asset://new.png',
  },
}

global.GDE = {
  history: {
    pause: (fn) => fn(),
    captureNow: (label, meta) => { historyEntry = { label, meta } },
  },
  ai: {
    clone: (value) => value == null ? value : JSON.parse(JSON.stringify(value)),
    fieldTypeName: (def) => typeof def === 'string' ? def : (def && def.type) || '',
  },
}
global.window.GDE = global.GDE

vm.runInThisContext(readFileSync('temp/GameDataEditor/src/ai/patch.js', 'utf8'), {
  filename: 'temp/GameDataEditor/src/ai/patch.js',
})

const valid = {
  type: 'gde.patch',
  title: 'Tune swords',
  ops: [
    { op: 'setField', table: 'data/items', id: '100', field: 'price', value: 25 },
    { op: 'setField', table: 'data/items', id: '200', field: 'meta.rarity', value: 'epic' },
    { op: 'setAssetReference', table: 'data/items', id: '200', field: 'icon', url: 'asset://new.png' },
  ],
}

const preview = GDE.ai.previewPatch(valid)
assert.equal(preview.ok, true)
assert.equal(preview.changes.length, 3)
assert.equal(preview.changes[0].before, 20)
assert.equal(preview.changes[0].after, 25)

const applied = GDE.ai.applyPatch(valid)
assert.equal(applied.applied, true)
assert.equal(gameData[100].price, 25)
assert.equal(gameData[200].meta.rarity, 'epic')
assert.equal(gameData[200].icon, 'asset://new.png')
assert.equal(historyEntry.label, 'Tune swords')
assert.equal(historyEntry.meta.source, 'gde.ai')
assert.equal(historyEntry.meta.ops, 3)

const badField = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [{ op: 'setField', table: 'data/items', id: '100', field: 'missing', value: 1 }],
})
assert.equal(badField.ok, false)
assert.equal(badField.errors.some((e) => e.message.includes('Field not in struct_def')), true)

const badRef = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [{ op: 'setField', table: 'data/items', id: '100', field: 'target', value: '999' }],
})
assert.equal(badRef.ok, false)
assert.equal(badRef.errors.some((e) => e.message.includes('Reference id not found')), true)

const unknownTypeWithoutMerge = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [{ op: 'updateStructDef', table: 'data/items', struct_def: { score: 'score_type' } }],
})
assert.equal(unknownTypeWithoutMerge.ok, false)

const knownTypeThroughPatch = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [
    { op: 'upsertType', name: 'score_type', config: { base_type: 'int', type_render: 'input_int' } },
    { op: 'updateStructDef', table: 'data/items', struct_def: { score: 'score_type' } },
  ],
})
assert.equal(knownTypeThroughPatch.ok, true)

const cardNodePatch = {
  type: 'gde.patch',
  title: 'Tune card node',
  ops: [
    {
      op: 'updateCardNode',
      styleKey: 'default',
      nodeId: 'name-text',
      props: { size: 'md', color: '#fff' },
      bindings: { value: { source: 'field', field: 'name' } },
      layout: { oMin: { x: 4 } },
    },
    {
      op: 'addCardNode',
      styleKey: 'default',
      parentId: 'root',
      node: {
        id: 'rarity-text',
        component: 'text',
        props: { value: 'Rarity' },
        bindings: { value: { source: 'field', field: 'meta.rarity' } },
        children: [],
      },
    },
  ],
}
const cardPreview = GDE.ai.previewPatch(cardNodePatch)
assert.equal(cardPreview.ok, true)
assert.equal(cardPreview.changes[0].before.props.size, 'sm')
assert.equal(cardPreview.changes[0].after.props.size, 'md')
assert.equal(cardPreview.changes[1].after.children.some((node) => node.id === 'rarity-text'), true)

const cardApplied = GDE.ai.applyPatch(cardNodePatch)
assert.equal(cardApplied.applied, true)
const nameNode = cardStyles.default.root.children.find((node) => node.id === 'name-text')
assert.equal(nameNode.props.size, 'md')
assert.equal(nameNode.props.color, '#fff')
assert.equal(nameNode.layout.oMin.x, 4)
assert.equal(nameNode.layout.oMin.y, -30)
assert.equal(cardStyles.default.root.children.some((node) => node.id === 'rarity-text'), true)

const duplicateCardNode = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [{
    op: 'addCardNode',
    styleKey: 'default',
    parentId: 'root',
    node: { id: 'name-text', component: 'text', children: [] },
  }],
})
assert.equal(duplicateCardNode.ok, false)
assert.equal(duplicateCardNode.errors.some((e) => e.message.includes('Duplicate card node id')), true)

const deleteRoot = GDE.ai.validatePatch({
  type: 'gde.patch',
  ops: [{ op: 'deleteCardNode', styleKey: 'default', nodeId: 'root' }],
})
assert.equal(deleteRoot.ok, false)
assert.equal(deleteRoot.errors.some((e) => e.message.includes('Cannot delete root')), true)

console.log('gde ai patch tests ok')
