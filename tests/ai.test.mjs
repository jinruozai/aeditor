import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/log.js', 'utf8'), { filename: 'log.js' })
vm.runInThisContext(readFileSync('src/core/names.js', 'utf8'), { filename: 'names.js' })
vm.runInThisContext(readFileSync('src/ai/name-generator.js', 'utf8'), { filename: 'ai/name-generator.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/connection.js', 'utf8'), { filename: 'ai/connection.js' })
vm.runInThisContext(readFileSync('src/ai/adapter.js', 'utf8'), { filename: 'ai/adapter.js' })
vm.runInThisContext(readFileSync('src/ai/provider.js', 'utf8'), { filename: 'ai/provider.js' })
vm.runInThisContext(readFileSync('src/ai/provider-auth.js', 'utf8'), { filename: 'ai/provider-auth.js' })
vm.runInThisContext(readFileSync('src/ai/provider-transports.js', 'utf8'), { filename: 'ai/provider-transports.js' })
vm.runInThisContext(readFileSync('src/ai/provider-connections.js', 'utf8'), { filename: 'ai/provider-connections.js' })
vm.runInThisContext(readFileSync('src/ai/context.js', 'utf8'), { filename: 'ai/context.js' })
vm.runInThisContext(readFileSync('src/ai/reference.js', 'utf8'), { filename: 'ai/reference.js' })
vm.runInThisContext(readFileSync('src/ai/change-set.js', 'utf8'), { filename: 'ai/change-set.js' })
vm.runInThisContext(readFileSync('src/ai/request.js', 'utf8'), { filename: 'ai/request.js' })
vm.runInThisContext(readFileSync('src/ai/runtime.js', 'utf8'), { filename: 'ai/runtime.js' })

const aeditor = window.aeditor
const ai = aeditor.ai

function ids(items) {
  return items.map(function (item) { return item.id })
}

function byId(items, id) {
  return items.find(function (item) { return item.id === id })
}

function assertNoSessionSurface() {
  assert.equal('sessions' in ai, false)
  assert.equal('activeSessionId' in ai, false)
  assert.equal('createSession' in ai, false)
  assert.equal('deleteSession' in ai, false)
  assert.equal('selectSession' in ai, false)
  assert.equal('findSession' in ai, false)

  assert.equal('groups' in ai, false)
  assert.equal('createGroup' in ai, false)
  assert.equal('deleteGroup' in ai, false)
  assert.equal('moveGroup' in ai, false)
  assert.equal('findAgentByPath' in ai, false)
  assert.equal('setAgentPath' in ai, false)
  assert.deepEqual(ai.agents(), [])
  assert.deepEqual(ai.attachments(), [])
  assert.equal(ai.activeAgentId(), null)
}

function assertAgentNameGenerator() {
  const existing = []
  for (let i = 0; i < 3600; i++) {
    const name = ai.generateAgentName(existing, function () { return 0 })
    assert.equal(existing.includes(name), false)
    existing.push(name)
  }
  assert.equal(existing.length, 3600)
  assert.equal(ai.generateAgentName(existing, function () { return 0 }), existing[0] + ' 2')

  const generated = ai.createAgent({ select: false })
  assert.match(generated.name, /^[A-Z][a-z]+ [A-Z][A-Za-z]+$/)
  ai.deleteAgent(generated.id)
}

function assertAgentsAreIdBasedTree() {
  const agent = ai.createAgent({
    name: 'Planner',
    connection: 'mock',
    model: 'fast',
    messages: [{ role: 'system', from: 'system', content: 'keep' }],
    contextRefs: ['ctx-1'],
    memory: { facts: ['stable'] },
    state: { count: 1 },
    permissions: { paths: [{ path: 'planner', mode: 'readwrite' }] },
    meta: { owner: 'test' },
  })
  const child = ai.createAgent({
    name: 'Planner',
    parentAgentId: agent.id,
    select: false,
    order: 2,
  })
  const peer = ai.createAgent({ name: 'Peer', select: false })
  const background = ai.createAgent({
    name: 'Background',
    select: false,
  })
  ai.deleteAgent(background.id)

  assert.equal(ai.activeAgentId(), agent.id)
  assert.equal(child.name, agent.name)
  assert.notEqual(child.id, agent.id)
  assert.equal(child.workingDirectory, undefined)
  assert.equal(byId(ai.agents(), child.id).parentAgentId, agent.id)
  assert.equal('path' in byId(ai.agents(), agent.id), false)
  assert.equal('groupId' in byId(ai.agents(), agent.id), false)

  const beforeMove = byId(ai.agents(), child.id)
  ai.reparentAgent(child.id, peer.id, 0)
  const afterMove = byId(ai.agents(), child.id)
  assert.equal(afterMove.parentAgentId, peer.id)
  assert.equal(afterMove.order, 0)
  assert.deepEqual(afterMove.messages, beforeMove.messages)
  assert.deepEqual(afterMove.contextRefs, beforeMove.contextRefs)
  assert.deepEqual(afterMove.memory, beforeMove.memory)
  assert.deepEqual(afterMove.state, beforeMove.state)
  assert.equal(afterMove.connection, beforeMove.connection)
  assert.equal(afterMove.model, beforeMove.model)
  assert.equal(afterMove.status, beforeMove.status)

  const deleted = ai.deleteAgent(peer.id)
  assert.equal(deleted.id, peer.id)
  assert.equal(ai.findAgent(child.id), null)

  return { agent: byId(ai.agents(), agent.id) }
}

function assertAgentRuntimeState(seedAgent) {
  const renamed = ai.renameAgent(seedAgent.id, 'Runtime Planner')
  assert.equal(renamed.name, 'Runtime Planner')

  const moved = ai.moveAgent(seedAgent.id, { parentAgentId: null, order: 4 })
  assert.equal(moved.parentAgentId, null)
  assert.equal(moved.order, 4)

  const child = ai.createAgent({ name: 'Child Agent', parentAgentId: seedAgent.id, select: false })
  const nested = ai.createAgent({ name: 'Nested Agent', parentAgentId: child.id, select: false })
  assert.equal(ai.isDescendant(seedAgent.id, child.id), true)
  assert.equal(ai.isDescendant(seedAgent.id, nested.id), true)

  const reparented = ai.reparentAgent(child.id, null)
  assert.equal(reparented.parentAgentId, null)
  assert.equal(byId(ai.agents(), nested.id).parentAgentId, child.id)

  const updated = ai.updateAgent(seedAgent.id, {
    contextRefs: ['ctx-2'],
    memory: { facts: ['changed'] },
    state: { count: 2 },
    permissions: { paths: [{ path: 'runtime', mode: 'read' }] },
  })
  assert.deepEqual(updated.contextRefs, ['ctx-2'])
  assert.deepEqual(updated.memory, { facts: ['changed'] })
  assert.deepEqual(updated.state, { count: 2 })
  assert.equal(updated.status, 'idle')
  assert.equal(updated.messages.length, 1)

  const appended = ai.appendMessage(seedAgent.id, {
    role: 'assistant',
    from: 'agent:' + seedAgent.id,
    content: 'manual note',
    contextRefs: ['ctx-2'],
    meta: { source: 'test' },
  })
  assert.equal(appended.role, 'assistant')
  assert.equal(appended.from, 'agent:' + seedAgent.id)
  assert.equal(appended.status, 'done')
  assert.equal(byId(ai.agents(), seedAgent.id).messages.length, 2)
  ai.deleteAgent(child.id)
}

function assertReferenceProviderContract(agentId) {
  let resolveCtxSeen = null
  ai.references.register('case', {
    describe: function (ref) { return { title: ref.title, summary: 'summary:' + ref.uri } },
    read: function (ref, options, ctx) {
      resolveCtxSeen = ctx
      return { uri: ref.uri, text: 'resolved:' + ref.uri }
    },
  })

  const ref = ai.addAttachment({
    resolver: 'case',
    uri: 'case://selection/item-1',
    kind: 'selection',
    title: 'Item 1',
    summary: 'short',
    meta: { table: 'items' },
  })
  ai.updateAgent(agentId, { contextRefs: [ref.id] })

  assert.equal(ai.attachments().length, 1)
  assert.deepEqual(ai.references.describe(ref), {
    title: 'Item 1',
    summary: 'summary:case://selection/item-1',
  })

  return {
    ref: ref,
    assertResolved: function () {
      assert.equal(resolveCtxSeen.agent.id, agentId)
    },
  }
}

function assertPermissionContract(agentId) {
  const managed = ai.createAgent({
    name: 'Managed',
    parentAgentId: agentId,
    select: false,
    permissions: { paths: [{ path: 'runtime/managed', mode: 'read' }] },
  })
  const sibling = ai.createAgent({ name: 'Sibling', select: false })

  assert.equal(ai.canRead('user', agentId, 'agent.full'), true)
  assert.equal(ai.canSend('user', agentId), true)
  assert.equal(ai.canManage('user', agentId), true)
  assert.equal(ai.canRead(agentId, agentId, 'messages.read'), true)
  assert.equal(ai.canSend(agentId, agentId), true)
  assert.equal(ai.canManage(agentId, agentId), true)
  assert.equal(ai.canRead(agentId, managed.id, 'agent.summary'), true)
  assert.equal(ai.canRead(agentId, sibling.id, 'agent.summary'), false)

  if (typeof ai.setPermissionResolver === 'function') {
    const calls = []
    ai.setPermissionResolver(function (ctx, next) {
      calls.push(ctx)
      if (ctx.actor === 'blocked') return false
      return next(ctx)
    })
    assert.equal(ai.canRead('blocked', agentId, 'agent.full'), false)
    assert.equal(calls.length > 0, true)
  }

  ai.deleteAgent(sibling.id)
  return managed
}

function assertRegistryContracts(agentId) {
  ai.tools.register('diff-preview', {
    title: 'Diff Preview',
    description: 'Preview a change before applying it.',
    schema: { type: 'object' },
    permissions: ['tool.call', 'tool.apply'],
    preview: function (args) { return { kind: 'diff', args: args } },
    run: function (args) { return { ok: true, args: args } },
    apply: function (result) { return { applied: result.ok } },
  })
  ai.skills.register('review', { id: 'review', title: 'Review', tools: ['diff-preview'] })
  ai.agentTemplates.register('goal-reviewer', {
    id: 'goal-reviewer',
    defaults: { connection: 'mock', model: 'fast' },
    skills: ['review'],
  })
  ai.context.register('selection', {
    capture: function () { return { text: 'selected' } },
  })
  ai.bundles.register('registry-test', {
    activate: function (ctx) {
      ctx.ai.skills.register('plugin-skill', { id: 'plugin-skill', title: 'Plugin Skill' })
    },
  })

  assert.equal(ai.tools.list().includes('diff-preview'), true)
  assert.equal(ai.tools.get('diff-preview').preview({ id: 1 }).kind, 'diff')
  assert.equal(ai.tools.get('diff-preview').apply({ ok: true }).applied, true)
  assert.equal(ai.skills.get('review').title, 'Review')
  assert.equal(ai.skills.get('plugin-skill').title, 'Plugin Skill')
  assert.equal(ai.agentTemplates.get('goal-reviewer').defaults.model, 'fast')
  assert.equal(ai.context.get('selection').capture().text, 'selected')
  assert.equal(ai.bundles.get('registry-test') != null, true)

  ai.updateAgent(agentId, {
    skillRefs: ['review'],
    toolRefs: ['diff-preview'],
    state: {
      projectRule: {
        maxRows: 3,
        reviewLevel: 'strict',
      },
    },
  })
}

async function assertSendRunStatusAndRequest(agentId, resourceCheck) {
  let requestSeen = null
  let ctxSeen = null
  let callCount = 0
  ai.registerTransport('capture', {
    send: function (connection, request, ctx) {
      callCount += 1
      requestSeen = request
      ctxSeen = ctx
      return {
        role: 'assistant',
        content: 'captured ' + request.messages[request.messages.length - 1].content,
      }
    },
  })
  ai.registerConnection('capture', { auth: { type: 'none' }, transport: { type: 'capture' }, configDefaults: {} })

  ai.updateAgent(agentId, { connection: 'capture', model: 'reasoning' })
  const sent = ai.message.send(agentId, { content: 'balance sword prices' }, 'user')
  assert.equal(sent.message.role, 'user')
  assert.equal(sent.message.from, 'user')
  assert.equal(sent.message.content, 'balance sword prices')
  assert.equal(byId(ai.agents(), agentId).status, 'running')

  const reply = await sent.promise
  const afterSend = byId(ai.agents(), agentId)
  assert.equal(reply.role, 'assistant')
  assert.equal(reply.content, 'captured balance sword prices')
  assert.equal(afterSend.status, 'idle')
  assert.equal(afterSend.messages.at(-2).content, 'balance sword prices')
  assert.equal(afterSend.messages.at(-1).content, 'captured balance sword prices')
  assert.equal(callCount, 1)
  assert.equal(requestSeen.agent.id, agentId)
  assert.equal(requestSeen.agent.state.projectRule.maxRows, 3)
  assert.equal(requestSeen.connection, 'capture')
  assert.equal(requestSeen.model, 'reasoning')
  assert.deepEqual(requestSeen.attachments, [{ uri: 'case://selection/item-1', text: 'resolved:case://selection/item-1' }])
  assert.deepEqual(requestSeen.tools, ['diff-preview'])
  assert.deepEqual(requestSeen.skills, ['review'])
  assert.equal(ctxSeen.canRead(agentId), true)
  assert.equal(ctxSeen.canSend(agentId), true)
  assert.equal(ctxSeen.canManage(agentId), true)
  resourceCheck.assertResolved()
}

async function assertStopAgent(agentId) {
  let releaseRun
  const held = new Promise(function (resolve) { releaseRun = resolve })
  ai.registerTransport('hold', {
    send: function () { return held.then(function () { return 'late' }) },
  })
  ai.registerConnection('hold', { auth: { type: 'none' }, transport: { type: 'hold' }, configDefaults: {} })
  ai.updateAgent(agentId, { connection: 'hold' })
  const run = ai.runAgent(agentId)
  assert.equal(byId(ai.agents(), agentId).status, 'running')
  assert.equal(ai.stopAgent(agentId), true)
  assert.equal(byId(ai.agents(), agentId).status, 'idle')
  releaseRun()
  assert.equal(await run.promise, null)
}

assertNoSessionSurface()
assertAgentNameGenerator()
const seed = assertAgentsAreIdBasedTree()
assertAgentRuntimeState(seed.agent)
const resourceCheck = assertReferenceProviderContract(seed.agent.id)
const managed = assertPermissionContract(seed.agent.id)
assertRegistryContracts(seed.agent.id)
await assertSendRunStatusAndRequest(seed.agent.id, resourceCheck)
await assertStopAgent(seed.agent.id)

const removedManaged = ai.deleteAgent(managed.id)
assert.equal(removedManaged.id, managed.id)
const removedSeed = ai.deleteAgent(seed.agent.id)
assert.equal(removedSeed.id, seed.agent.id)
assert.deepEqual(ai.agents(), [])
assert.equal(ai.activeAgentId(), null)

function makeElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    attributes: {},
    children: [],
    parentNode: null,
    textContent: '',
    scrollTop: 0,
    clientHeight: 200,
    scrollHeight: 200,
    style: {},
    classList: {
      add: function (name) {
        this.el.className = this.el.className ? this.el.className + ' ' + name : name
      },
      el: null,
    },
    appendChild: function (child) {
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild: function (child) {
      this.children = this.children.filter(function (item) { return item !== child })
      child.parentNode = null
      return child
    },
    remove: function () {
      if (this.parentNode) this.parentNode.removeChild(this)
    },
    setAttribute: function (name, value) {
      this.attributes[name] = value
    },
    addEventListener: function () {},
    get firstChild() {
      return this.children[0] || null
    },
  }
}

function collectText(el) {
  let out = el.textContent || ''
  ;(el.children || []).forEach(function (child) { out += '\n' + collectText(child) })
  return out
}

function assertGdePatchPreviewRendering() {
  const components = {}
  global.document = {
    createElement: function (tag) {
      const el = makeElement(tag)
      el.classList.el = el
      return el
    },
  }
  global.requestAnimationFrame = function (fn) { fn() }
  window.aeditor.ui = {
    isSignal: function (v) { return typeof v === 'function' && typeof v.peek === 'function' },
    h: function (tag, cls, attrs) {
      const el = document.createElement(tag)
      if (cls) el.className = cls
      if (attrs) Object.keys(attrs).forEach(function (key) {
        if (key === 'text') el.textContent = attrs[key]
        else el.setAttribute(key, attrs[key])
      })
      return el
    },
    dispose: function (el) { if (el && el.remove) el.remove() },
    collect: function () {},
    button: function (opts) { return this.h('button', 'aeditor-ui-btn', { text: opts.text || '' }) },
    stateButton: function () { return this.h('button', 'aeditor-ui-state-btn') },
    'switch': function (opts) { return this.h('label', 'aeditor-ui-switch', { text: opts.label || '' }) },
    copyButton: function () { return this.h('button', 'aeditor-ui-copy-btn', { text: 'Copy' }) },
    scrollArea: function () { return this.h('div', 'aeditor-ui-scrollarea') },
    view: function (opts) {
      const el = this.h('div', 'aeditor-ui-view')
      const children = opts && opts.children
      const list = Array.isArray(children) ? children : (children ? [children] : [])
      for (let i = 0; i < list.length; i++) el.appendChild(list[i])
      return el
    },
  }
  window.aeditor.registerComponent = function (name, spec) { components[name] = spec }
  vm.runInThisContext(readFileSync('src/ui/data/changeReview.js', 'utf8'), { filename: 'ui/data/changeReview.js' })
  vm.runInThisContext(readFileSync('src/ai/panels/message-live-strip.js', 'utf8'), { filename: 'ai/panels/message-live-strip.js' })
  vm.runInThisContext(readFileSync('src/ai/panels/message-virtualizer.js', 'utf8'), { filename: 'ai/panels/message-virtualizer.js' })
  vm.runInThisContext(readFileSync('src/ai/panels/transcript.js', 'utf8'), { filename: 'ai/panels/transcript.js' })

  const preview = aeditor.changeSet.normalize({
    title: 'Tune swords',
    validation: { ok: false, errors: [{ path: 'ops[0].field', message: 'Field not in struct_def: missing' }] },
    resources: [{
      uri: 'gde://entity/data%2Fitems/100',
      kind: 'gde.entity',
      title: 'Iron Sword',
      subtitle: 'data/items / 100',
      changes: [{
        id: 'op_1',
        kind: 'gde.field',
        operation: 'update',
        path: 'price',
        title: 'setField',
        summary: 'data/items/100.price = 25',
        before: 20,
        after: 25,
      }],
    }],
    apply: { mode: 'atomic', adapter: 'gde.patch', payload: { type: 'gde.patch', ops: [] } },
  })
  const previewAgent = ai.createAgent({
    name: 'Patch Viewer',
    messages: [{
      role: 'assistant',
      content: 'preview',
      toolCalls: [{
        id: 'call-1',
        name: 'gde.patch',
        preview: preview,
        result: { ok: true, value: 1 },
      }],
    }],
  })
  ai.activeAgentId.set(previewAgent.id)

  const root = components['ai-messages'].factory(null, {})
  const text = collectText(root)
  assert.match(text, /Tune swords/)
  assert.match(text, /failed/)
  assert.match(text, /ops\[0\]\.field: Field not in struct_def: missing/)
  assert.match(text, /Iron Sword/)
  assert.match(text, /data\/items/)
  assert.match(text, /100/)
  assert.match(text, /price/)
  assert.match(text, /Before\s+20/)
  assert.match(text, /After\s+25/)
  assert.doesNotMatch(text, /"value": 1/)
}

assertGdePatchPreviewRendering()

console.log('ai tests ok')
