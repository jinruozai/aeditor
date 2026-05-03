import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/log.js', 'utf8'), { filename: 'log.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/provider.js', 'utf8'), { filename: 'ai/provider.js' })
vm.runInThisContext(readFileSync('src/ai/context.js', 'utf8'), { filename: 'ai/context.js' })
vm.runInThisContext(readFileSync('src/ai/runtime.js', 'utf8'), { filename: 'ai/runtime.js' })

const ai = window.EF.ai
let requestSeen = null

ai.registerProvider('capture', {
  send: function (request) {
    requestSeen = request
    return { role: 'assistant', content: 'ok' }
  },
})

ai.registerResourceResolver('secret', {
  resolve: function () { return { hidden: true } },
})

const target = ai.createAgent({
  name: 'Target',
  path: 'target',
  provider: 'capture',
  messages: [{ role: 'user', content: 'read context' }],
})
const actor = ai.createAgent({ name: 'Actor', path: 'actor' })
const res = ai.addResource({
  resolver: 'secret',
  uri: 'secret://one',
  kind: 'secret.item',
  title: 'Secret One',
  meta: { id: 'one' },
})
ai.updateAgent(target.id, { contextRefs: [res.id] })
ai.setPermissionResolver(function (ctx, next) {
  if (ctx.scope === 'resources.read') return false
  return next(ctx)
})

const run = ai.runAgent(target.id, { actor: actor.id })
await run.promise

assert.deepEqual(requestSeen.resourceRefs, [])
assert.deepEqual(requestSeen.resources, [])
assert.equal(requestSeen.messages.some(function (m) {
  return String(m.content || '').indexOf('Secret One') >= 0 || String(m.content || '').indexOf('secret://one') >= 0
}), false)

ai.setPermissionResolver(null)
const imageAgent = ai.createAgent({
  name: 'Image Target',
  path: 'image-target',
  provider: 'capture',
  messages: [{ role: 'user', content: 'read image' }],
})
const image = ai.addResource({
  resolver: 'file',
  uri: 'file://upload/icon.png',
  kind: 'file.image',
  title: 'icon.png',
  meta: { dataUrl: 'data:image/png;base64,aGVsbG8=', type: 'image/png' },
})
ai.updateAgent(imageAgent.id, { contextRefs: [image.id] })
await ai.runAgent(imageAgent.id).promise
assert.equal(requestSeen.messages[0].role, 'system')
assert.equal(String(requestSeen.messages[0].content).includes('data:image/png;base64'), false)
assert.equal(String(requestSeen.messages[0].content).includes('hasImageData'), true)
assert.equal(requestSeen.resources[0].meta.dataUrl, 'data:image/png;base64,aGVsbG8=')

console.log('ai resource permission tests ok')
