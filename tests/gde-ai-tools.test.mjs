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

global.State = {
  findAssetReferences: () => [],
  gameData: () => ({ '100': { name: 'Sword' } }),
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
    queryRows: () => [],
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

console.log('gde ai tools tests ok')
