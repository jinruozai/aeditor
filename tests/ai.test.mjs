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

const EF = window.EF
const ai = EF.ai

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

  assert.deepEqual(ai.groups(), [])
  assert.deepEqual(ai.agents(), [])
  assert.deepEqual(ai.resources(), [])
  assert.equal(ai.activeAgentId(), null)
}

function assertGroupsAreUiFolders() {
  const root = ai.createGroup({ name: 'Root', order: 10, collapsed: true, meta: { ui: 'folder' } })
  const child = ai.createGroup({ name: 'Child', parentId: root.id, order: 2 })
  const peer = ai.createGroup({ name: 'Peer' })
  const agent = ai.createAgent({
    name: 'Planner',
    groupId: child.id,
    provider: 'mock',
    model: 'fast',
    mode: 'chat',
    messages: [{ role: 'system', from: 'system', content: 'keep' }],
    contextRefs: ['ctx-1'],
    memory: { facts: ['stable'] },
    state: { count: 1 },
    permissions: { paths: [{ path: 'planner', mode: 'readwrite' }] },
    meta: { owner: 'test' },
  })

  assert.deepEqual(ids(ai.groups()), [root.id, child.id, peer.id])
  assert.equal(byId(ai.groups(), root.id).collapsed, true)
  assert.equal(byId(ai.groups(), child.id).parentId, root.id)
  assert.equal(ai.activeAgentId(), agent.id)

  const beforeMove = byId(ai.agents(), agent.id)
  ai.moveGroup(child.id, { parentId: peer.id, order: 0 })
  const afterMove = byId(ai.agents(), agent.id)
  assert.equal(byId(ai.groups(), child.id).parentId, peer.id)
  assert.equal(byId(ai.groups(), child.id).order, 0)
  assert.equal(afterMove.groupId, beforeMove.groupId)
  assert.deepEqual(afterMove.messages, beforeMove.messages)
  assert.deepEqual(afterMove.contextRefs, beforeMove.contextRefs)
  assert.deepEqual(afterMove.memory, beforeMove.memory)
  assert.deepEqual(afterMove.state, beforeMove.state)
  assert.equal(afterMove.provider, beforeMove.provider)
  assert.equal(afterMove.model, beforeMove.model)
  assert.equal(afterMove.mode, beforeMove.mode)
  assert.equal(afterMove.status, beforeMove.status)

  const deleted = ai.deleteGroup(child.id)
  const afterDelete = byId(ai.agents(), agent.id)
  assert.equal(deleted.id, child.id)
  assert.equal(afterDelete.groupId, null)
  assert.deepEqual(afterDelete.messages, beforeMove.messages)
  assert.deepEqual(afterDelete.contextRefs, beforeMove.contextRefs)
  assert.deepEqual(afterDelete.memory, beforeMove.memory)
  assert.deepEqual(afterDelete.state, beforeMove.state)

  return { agent: afterDelete, peer: peer }
}

function assertAgentRuntimeState(seedAgent, targetGroup) {
  const renamed = ai.renameAgent(seedAgent.id, 'Runtime Planner')
  assert.equal(renamed.name, 'Runtime Planner')

  const moved = ai.moveAgent(seedAgent.id, { groupId: targetGroup.id, order: 4 })
  assert.equal(moved.groupId, targetGroup.id)
  assert.equal(moved.order, 4)

  const child = ai.createAgent({ name: 'Child Agent', path: moved.path + '/child', groupId: targetGroup.id })
  const nested = ai.createAgent({ name: 'Nested Agent', path: moved.path + '/child/nested', groupId: targetGroup.id })
  const rootMoved = ai.setAgentPath(seedAgent.id, 'runtime-root')
  assert.equal(rootMoved.path, 'runtime-root')
  assert.equal(byId(ai.agents(), child.id).path, 'runtime-root/child')
  assert.equal(byId(ai.agents(), nested.id).path, 'runtime-root/child/nested')

  const reparented = ai.reparentAgent(child.id, seedAgent.id)
  assert.equal(reparented.path, 'runtime-root/child')
  assert.equal(byId(ai.agents(), nested.id).path, 'runtime-root/child/nested')

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
}

function assertResourceResolverContract(agentId) {
  let resolveCtxSeen = null
  ai.registerResourceResolver('case', {
    canResolve: function (ref) { return ref.resolver === 'case' },
    summarize: function (ref) { return { title: ref.title, summary: 'summary:' + ref.uri } },
    resolve: function (ref, ctx) {
      resolveCtxSeen = ctx
      return { uri: ref.uri, text: 'resolved:' + ref.uri }
    },
  })

  const ref = ai.addResource({
    resolver: 'case',
    uri: 'case://selection/item-1',
    kind: 'selection',
    title: 'Item 1',
    summary: 'short',
    meta: { table: 'items' },
  })
  ai.updateAgent(agentId, { contextRefs: [ref.id] })

  assert.equal(ai.resources().length, 1)
  assert.equal(ai.getResourceResolver('case').canResolve(ref, {}), true)
  assert.deepEqual(ai.getResourceResolver('case').summarize(ref, {}), {
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
    path: 'runtime/managed',
    groupId: null,
    permissions: { paths: [{ path: 'runtime/managed', mode: 'read' }] },
  })

  assert.equal(ai.canRead('user', agentId, 'agent.full'), true)
  assert.equal(ai.canSend('user', agentId), true)
  assert.equal(ai.canManage('user', agentId), true)
  assert.equal(ai.canRead(agentId, agentId, 'messages.read'), true)
  assert.equal(ai.canSend(agentId, agentId), true)
  assert.equal(ai.canManage(agentId, agentId), false)
  assert.equal(ai.canRead(agentId, managed.id, 'agent.summary'), true)

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

  return managed
}

function assertRegistryContracts(agentId) {
  ai.registerTool('diff-preview', {
    title: 'Diff Preview',
    description: 'Preview a change before applying it.',
    schema: { type: 'object' },
    permissions: ['tool.call', 'tool.apply'],
    preview: function (args) { return { kind: 'diff', args: args } },
    run: function (args) { return { ok: true, args: args } },
    apply: function (result) { return { applied: result.ok } },
  })
  ai.registerSkill('review', { id: 'review', title: 'Review', tools: ['diff-preview'] })
  ai.registerAgentTemplate('goal-reviewer', {
    id: 'goal-reviewer',
    defaults: { provider: 'mock', model: 'fast', mode: 'goal' },
    skills: ['review'],
  })
  ai.registerContextProvider('selection', {
    capture: function () { return { text: 'selected' } },
  })
  ai.registerPlugin('registry-test', {
    activate: function (ctx) {
      ctx.ai.registerSkill('plugin-skill', { id: 'plugin-skill', title: 'Plugin Skill' })
    },
  })

  assert.deepEqual(ai.listTools(), ['diff-preview'])
  assert.equal(ai.getTool('diff-preview').preview({ id: 1 }).kind, 'diff')
  assert.equal(ai.getTool('diff-preview').apply({ ok: true }).applied, true)
  assert.equal(ai.getSkill('review').title, 'Review')
  assert.equal(ai.getSkill('plugin-skill').title, 'Plugin Skill')
  assert.equal(ai.getAgentTemplate('goal-reviewer').defaults.mode, 'goal')
  assert.equal(ai.getContextProvider('selection').capture().text, 'selected')
  assert.equal(ai.getPlugin('registry-test') != null, true)

  ai.updateAgent(agentId, {
    skillRefs: ['review'],
    toolRefs: ['diff-preview'],
    mode: 'goal',
    state: {
      goalPolicy: {
        maxTurns: 3,
        maxToolCalls: 5,
        requireUserApprovalForApply: true,
        stopWhen: 'self_check_passed',
      },
    },
  })
}

async function assertSendRunStatusAndRequest(agentId, resourceCheck) {
  let requestSeen = null
  let ctxSeen = null
  let callCount = 0
  ai.registerProvider('capture', {
    send: function (request, ctx) {
      callCount += 1
      requestSeen = request
      ctxSeen = ctx
      return {
        role: 'assistant',
        content: 'captured ' + request.messages[request.messages.length - 1].content,
      }
    },
  })

  ai.updateAgent(agentId, { provider: 'capture', model: 'reasoning' })
  const sent = ai.sendMessage(agentId, { content: 'balance sword prices' }, 'user')
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
  assert.equal(requestSeen.agent.mode, 'goal')
  assert.equal(requestSeen.agent.state.goalPolicy.maxTurns, 3)
  assert.equal(requestSeen.provider, 'capture')
  assert.equal(requestSeen.model, 'reasoning')
  assert.deepEqual(requestSeen.resources, [{ uri: 'case://selection/item-1', text: 'resolved:case://selection/item-1' }])
  assert.deepEqual(requestSeen.tools, ['diff-preview'])
  assert.deepEqual(requestSeen.skills, ['review'])
  assert.equal(ctxSeen.canRead(agentId), true)
  assert.equal(ctxSeen.canSend(agentId), true)
  assert.equal(ctxSeen.canManage(agentId), false)
  resourceCheck.assertResolved()
}

async function assertStopAgent(agentId) {
  let releaseRun
  const held = new Promise(function (resolve) { releaseRun = resolve })
  ai.registerProvider('hold', {
    send: function () { return held.then(function () { return 'late' }) },
  })
  ai.updateAgent(agentId, { provider: 'hold' })
  const run = ai.runAgent(agentId)
  assert.equal(byId(ai.agents(), agentId).status, 'running')
  assert.equal(ai.stopAgent(agentId), true)
  assert.equal(byId(ai.agents(), agentId).status, 'idle')
  releaseRun()
  assert.equal(await run.promise, null)
}

assertNoSessionSurface()
const seed = assertGroupsAreUiFolders()
assertAgentRuntimeState(seed.agent, seed.peer)
const resourceCheck = assertResourceResolverContract(seed.agent.id)
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
  window.EF.ui = {
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
    button: function (opts) { return this.h('button', 'ef-ui-btn', { text: opts.text || '' }) },
    copyButton: function () { return this.h('button', 'ef-ui-copy-btn', { text: 'Copy' }) },
    scrollArea: function () { return this.h('div', 'ef-ui-scrollarea') },
  }
  window.EF.registerComponent = function (name, spec) { components[name] = spec }
  vm.runInThisContext(readFileSync('src/ai/panels/transcript.js', 'utf8'), { filename: 'ai/panels/transcript.js' })

  const previewAgent = ai.createAgent({
    name: 'Patch Viewer',
    messages: [{
      role: 'assistant',
      content: 'preview',
      toolCalls: [{
        id: 'call-1',
        name: 'gde.patch',
        preview: {
          ok: false,
          title: 'Tune swords',
          patch: { type: 'gde.patch', ops: [] },
          validation: { ok: false, errors: [{ path: 'ops[0].field', message: 'Field not in struct_def: missing' }] },
          changes: [{
            index: 0,
            op: 'setField',
            table: 'data/items',
            id: '100',
            field: 'price',
            summary: 'data/items/100.price = 25',
            before: 20,
            after: 25,
          }],
        },
        result: { ok: true, value: 1 },
      }],
    }],
  })
  ai.activeAgentId.set(previewAgent.id)

  const root = components['ai-messages'].factory(null, {})
  const text = collectText(root)
  assert.match(text, /Tune swords/)
  assert.match(text, /ERRORS/)
  assert.match(text, /ops\[0\]\.field: Field not in struct_def: missing/)
  assert.match(text, /setField/)
  assert.match(text, /data\/items/)
  assert.match(text, /100/)
  assert.match(text, /price/)
  assert.match(text, /before\s+20/)
  assert.match(text, /after\s+25/)
  assert.match(text, /"value": 1/)
}

assertGdePatchPreviewRendering()

console.log('ai tests ok')
