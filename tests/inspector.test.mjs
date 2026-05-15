import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/bus.js',
  'src/ui/inspector.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor
const store = {
  a: { name: 'A', hp: 10, locked: false },
  b: { name: 'B', hp: 20, locked: false },
  c: { name: 'C', locked: true },
}

aeditor.inspector.registerProvider('case.unit', {
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
aeditor.inspector.select(targets)
assert.deepEqual(aeditor.inspector.selection.peek().map(function (target) { return target.id }), ['a', 'b'])

const inspection = aeditor.inspector.inspect(aeditor.inspector.selection.peek())
assert.equal(inspection.values[0].name, 'A')
assert.equal(aeditor.inspector.canEditField(inspection, 'hp', inspection.values, inspection.schema.hp), true)
const providerReturned = aeditor.inspector.providerFor(targets).inspect(targets, {})
assert.equal(Object.prototype.hasOwnProperty.call(providerReturned, 'targets'), false)

inspection.write('name', aeditor.inspector.literalChange('name', 'Renamed'), {
  targets: inspection.targets,
  values: inspection.values,
  valueForChange: aeditor.inspector.valueForChange,
})
assert.equal(store.a.name, 'Renamed')
assert.equal(store.b.name, 'Renamed')

const locked = aeditor.inspector.inspect([
  { type: 'case.unit', id: 'a' },
  { type: 'case.unit', id: 'c' },
])
assert.equal(aeditor.inspector.canEditField(locked, 'hp', locked.values, locked.schema.hp), false)
assert.equal(aeditor.inspector.canEditField(locked, 'name', locked.values, locked.schema.name), false)

assert.equal(aeditor.inspector.inspect([
  { type: 'case.unit', id: 'a' },
  { type: 'case.other', id: 'x' },
]), null)

aeditor.inspector.registerProvider('case.mixed', {
  accept: function () { return true },
  inspect: function (items) { return { values: items, schema: { id: { type: 'string' } } } },
})
assert.equal(aeditor.inspector.inspect([
  { type: 'case.mixed', id: 'one' },
  { type: 'case.other', id: 'two' },
]).values.length, 2)

assert.throws(function () {
  aeditor.inspector.registerProvider('case.unit', { inspect: function () { return {} } })
}, /duplicate provider/)

aeditor.inspector.registerProvider('case.throw', {
  inspect: function () { throw new Error('inspect failed') },
})
assert.equal(aeditor.inspector.inspect([{ type: 'case.throw', id: 'x' }]), null)
assert.equal(aeditor.log.peek().some(function (entry) {
  return entry.source.scope === 'inspector' && entry.source.action === 'inspect'
}), true)

aeditor.inspector.registerProvider('case.throwField', {
  inspect: function () {
    return {
      values: [{ name: 'A' }],
      schema: { name: { type: 'string' } },
      canWrite: function () { throw new Error('field failed') },
    }
  },
})
const throwingField = aeditor.inspector.inspect([{ type: 'case.throwField', id: 'x' }])
assert.equal(aeditor.inspector.canEditField(throwingField, 'name', throwingField.values, throwingField.schema.name), false)

assert.deepEqual(aeditor.inspector.unregisterOwner('none'), [])

console.log('inspector tests ok')
