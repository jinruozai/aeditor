import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/ai/store.js',
  'src/ai/provider.js',
  'src/ai/context.js',
  'src/ai/runtime.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const ai = window.EF.ai

function byId(items, id) {
  return items.find(function (item) { return item.id === id })
}

let streamRequest = null
let streamCtx = null
ai.registerProvider('stream-capture', {
  send: async function (request, ctx) {
    streamRequest = request
    streamCtx = ctx
    assert.equal(ctx.signal.aborted, false)
    return {
      role: 'assistant',
      content: ['alpha', 'beta', 'gamma'].join(''),
      meta: { chunks: ['alpha', 'beta', 'gamma'] },
    }
  },
})

const streamed = ai.createAgent({
  name: 'Streamer',
  provider: 'stream-capture',
  model: 'stream-model',
})
ai.updateAgent(streamed.id, { stream: true })
const sent = ai.sendMessage(streamed.id, { content: 'stream this' }, 'user')
assert.equal(sent.request.stream, true)
assert.equal(byId(ai.agents(), streamed.id).status, 'running')
const streamedReply = await sent.promise
assert.equal(streamRequest.stream, true)
assert.equal(streamRequest.provider, 'stream-capture')
assert.equal(streamRequest.model, 'stream-model')
assert.equal(streamRequest.messages.at(-1).content, 'stream this')
assert.equal(streamCtx.runId, streamRequest.runId)
assert.equal(streamedReply.content, 'alphabetagamma')
assert.deepEqual(streamedReply.meta, { chunks: ['alpha', 'beta', 'gamma'] })
assert.equal(byId(ai.agents(), streamed.id).status, 'idle')

let release
const held = new Promise(function (resolve) { release = resolve })
let abortCtx = null
ai.registerProvider('stream-hold', {
  send: function (request, ctx) {
    abortCtx = ctx
    return held.then(function () {
      return { role: 'assistant', content: ctx.signal.aborted ? 'aborted' : 'late' }
    })
  },
})

const aborting = ai.createAgent({
  name: 'Abort Stream',
  provider: 'stream-hold',
})
ai.updateAgent(aborting.id, { stream: true })
const run = ai.runAgent(aborting.id)
assert.equal(run.request.stream, true)
await Promise.resolve()
await Promise.resolve()
assert.equal(byId(ai.agents(), aborting.id).status, 'running')
assert.equal(ai.stopAgent(aborting.id), true)
assert.equal(abortCtx.signal.aborted, true)
assert.equal(byId(ai.agents(), aborting.id).status, 'idle')
release()
assert.equal(await run.promise, null)
assert.equal(byId(ai.agents(), aborting.id).messages.length, 1)
assert.equal(byId(ai.agents(), aborting.id).messages[0].status, 'stopped')

console.log('ai stream tests ok')
