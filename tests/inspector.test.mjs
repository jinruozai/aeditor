import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aiditor: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/bus.js',
  'src/ui/inspector.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aiditor = window.aiditor
const store = {
  a: { name: 'A', hp: 10, locked: false },
  b: { name: 'B', hp: 20, locked: false },
  c: { name: 'C', locked: true },
}

aiditor.inspector.registerProvider('case.unit', {
  inspect(targets) {
    return {
      schema: {
        name: { type: 'string' },
        hp: { type: 'int' },
      },
      values: targets.map(function (target) { return store[target.id] }),
      canWrite: function (_target, _field, value) { return !value.locked },
      write: function (field, change, ctx) {
        ctx.targets.forEach(function (target, index) {
          store[target.id][field] = ctx.valueForChange(change, target, index, ctx)
        })
      },
    }
  },
})

const targets = [
  { type: 'case.unit', id: 'a', title: 'A' },
  { type: 'case.unit', id: 'b', title: 'B' },
]
aiditor.inspector.select(targets)
assert.deepEqual(aiditor.inspector.selection.peek().map(function (target) { return target.id }), ['a', 'b'])
let refreshed = 0
const stopRefresh = aiditor.effect(function () {
  aiditor.inspector.selection()
  refreshed++
})
aiditor.inspector.refresh()
assert.equal(refreshed, 2)
stopRefresh()

const inspection = aiditor.inspector.inspect(aiditor.inspector.selection.peek())
assert.equal(inspection.values[0].name, 'A')
assert.equal(aiditor.inspector.canEditField(inspection, 'hp', inspection.values, inspection.schema.hp), true)
const providerReturned = aiditor.inspector.providerFor(targets).inspect(targets, {})
assert.equal(Object.prototype.hasOwnProperty.call(providerReturned, 'targets'), false)

inspection.write('name', aiditor.inspector.literalChange('name', 'Renamed'), {
  targets: inspection.targets,
  values: inspection.values,
  valueForChange: aiditor.inspector.valueForChange,
})
assert.equal(store.a.name, 'Renamed')
assert.equal(store.b.name, 'Renamed')

const locked = aiditor.inspector.inspect([
  { type: 'case.unit', id: 'a' },
  { type: 'case.unit', id: 'c' },
])
assert.equal(aiditor.inspector.canEditField(locked, 'hp', locked.values, locked.schema.hp), false)
assert.equal(aiditor.inspector.canEditField(locked, 'name', locked.values, locked.schema.name), false)

assert.equal(aiditor.inspector.inspect([
  { type: 'case.unit', id: 'a' },
  { type: 'case.other', id: 'x' },
]), null)

aiditor.inspector.registerProvider('case.mixed', {
  accept: function () { return true },
  inspect: function (items) { return { values: items, schema: { id: { type: 'string' } } } },
})
assert.equal(aiditor.inspector.inspect([
  { type: 'case.mixed', id: 'one' },
  { type: 'case.other', id: 'two' },
]).values.length, 2)

assert.throws(function () {
  aiditor.inspector.registerProvider('case.unit', { inspect: function () { return {} } })
}, /duplicate provider/)

aiditor.inspector.registerProvider('case.throw', {
  inspect: function () { throw new Error('inspect failed') },
})
assert.equal(aiditor.inspector.inspect([{ type: 'case.throw', id: 'x' }]), null)
assert.equal(aiditor.log.peek().some(function (entry) {
  return entry.source.scope === 'inspector' && entry.source.action === 'inspect'
}), true)

aiditor.inspector.registerProvider('case.throwField', {
  inspect: function () {
    return {
      values: [{ name: 'A' }],
      schema: { name: { type: 'string' } },
      canWrite: function () { throw new Error('field failed') },
    }
  },
})
const throwingField = aiditor.inspector.inspect([{ type: 'case.throwField', id: 'x' }])
assert.equal(aiditor.inspector.canEditField(throwingField, 'name', throwingField.values, throwingField.schema.name), false)

assert.deepEqual(aiditor.inspector.unregisterOwner('none'), [])

console.log('inspector tests ok')
