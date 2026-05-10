// EF.ai store - final agent/resource model.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  let nextAgentId = 1
  let nextMessageId = 1
  let nextResourceId = 1
  let nextEventId = 1

  const agentsSig = EF.signal([])
  const resourcesSig = EF.signal([])
  const activeAgentIdSig = EF.signal(null)
  const agentVersionSigs = {}
  const messageListVersionSigs = {}
  const messageVersionSigs = {}
  const activeRunStateSigs = {}
  let permissionResolver = null
  let persistenceKey = 'editorframe.ai.v2'
  let persistenceEnabled = true
  let saveTimer = null
  const MAX_SNAPSHOT_CONTENT_CHARS = 1000000
  const MAX_SNAPSHOT_REASONING_CHARS = 65536
  const MAX_STORED_STATE_CHARS = 5000000
  const MAX_SNAPSHOT_TOOL_STRING_CHARS = 12000

  function now() { return Date.now() }

  function makeId(prefix, n) {
    return prefix + '_' + now().toString(36) + '_' + n
  }

  function defaultAgentName() {
    return ai.generateAgentName(agentsSig.peek().map(function (agent) { return agent.name }))
  }

  function cleanOrder(order, fallback) {
    return typeof order === 'number' ? order : fallback
  }

  function normalizePath(path) {
    let out = String(path || '').replace(/\\/g, '/')
    out = out.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    return out || 'root'
  }

  function makePermission(path, mode) {
    return { path: normalizePath(path), mode: mode || 'read' }
  }

  function normalizePermissionList(permissions) {
    const paths = permissions && permissions.paths
    if (paths && paths.length) return { paths: paths.map(function (p) { return makePermission(p.path, p.mode) }) }
    return { paths: [] }
  }

  function makeAgent(spec) {
    spec = spec || {}
    const id = spec.id || makeId('a', nextAgentId++)
    return {
      id: id,
      name: spec.name || defaultAgentName(),
      parentAgentId: spec.parentAgentId || null,
      order: cleanOrder(spec.order, agentsSig.peek().length),
      connection: spec.connection || ai.defaultConnection || 'mock',
      model: spec.model || '',
      contextBudgetTokens: spec.contextBudgetTokens || null,
      permissionMode: spec.permissionMode || 'full',
      status: spec.status || 'idle',
      statusText: spec.statusText || '',
      activeMessageId: spec.activeMessageId || null,
      activeQuestId: spec.activeQuestId || null,
      systemPrompt: spec.systemPrompt || '',
      messages: (spec.messages || []).map(makeMessage),
      queue: (spec.queue || []).map(makeQueueItem),
      inbox: (spec.inbox || []).map(makeInboxEvent),
      quests: (spec.quests || []).map(makeQuest),
      contextRefs: spec.contextRefs ? spec.contextRefs.slice() : [],
      memory: spec.memory || {},
      state: spec.state || {},
      skillRefs: spec.skillRefs ? spec.skillRefs.slice() : [],
      toolRefs: spec.toolRefs ? spec.toolRefs.slice() : [],
      permissions: normalizePermissionList(spec.permissions),
      createdAt: spec.createdAt || now(),
      updatedAt: spec.updatedAt || now(),
      meta: spec.meta || {},
    }
  }

  function makeMessage(spec) {
    spec = spec || {}
    return {
      id: spec.id || makeId('m', nextMessageId++),
      agentId: spec.agentId || null,
      from: spec.from || 'user',
      role: spec.role || 'user',
      content: spec.content == null ? '' : spec.content,
      reasoning_content: spec.reasoning_content || spec.reasoningContent || null,
      connection: spec.connection || null,
      model: spec.model || null,
      time: spec.time || spec.createdAt || now(),
      createdAt: spec.createdAt || spec.time || now(),
      startedAt: spec.startedAt || null,
      completedAt: spec.completedAt || (spec.status === 'done' ? (spec.time || now()) : null),
      status: spec.status || 'done',
      contextRefs: spec.contextRefs ? spec.contextRefs.slice() : [],
      attachments: spec.attachments ? spec.attachments.slice() : [],
      toolCalls: spec.toolCalls ? spec.toolCalls.slice() : [],
      questId: spec.questId || null,
      resultForQuestId: spec.resultForQuestId || null,
      meta: spec.meta || null,
      usage: spec.usage || null,
      stats: spec.stats || null,
    }
  }

  function makeQueueItem(spec) {
    spec = spec || {}
    return {
      messageId: spec.messageId || null,
      priority: cleanOrder(spec.priority, 0),
      interrupt: !!spec.interrupt,
      guidance: spec.guidance || null,
      createdAt: spec.createdAt || now(),
    }
  }

  function makeInboxEvent(spec) {
    spec = spec || {}
    return {
      id: spec.id || makeId('evt', nextEventId++),
      type: spec.type || 'event',
      fromAgentId: spec.fromAgentId || null,
      questId: spec.questId || null,
      resultMessageId: spec.resultMessageId || null,
      summary: spec.summary || '',
      consumed: !!spec.consumed,
      createdAt: spec.createdAt || now(),
      meta: spec.meta || {},
    }
  }

  function makeQuest(spec) {
    spec = spec || {}
    return {
      id: spec.id || spec.requestMessageId,
      fromAgentId: spec.fromAgentId || null,
      toAgentId: spec.toAgentId || null,
      requestMessageId: spec.requestMessageId || spec.id || null,
      status: spec.status || 'queued',
      resultMessageId: spec.resultMessageId || spec.resultId || null,
      summary: spec.summary || '',
      createdAt: spec.createdAt || now(),
      startedAt: spec.startedAt || null,
      completedAt: spec.completedAt || null,
      meta: spec.meta || {},
    }
  }

  function makeResource(spec) {
    spec = spec || {}
    return {
      id: spec.id || makeId('r', nextResourceId++),
      kind: spec.kind || 'resource',
      uri: spec.uri || '',
      title: spec.title || '',
      summary: spec.summary || '',
      resolver: spec.resolver || spec.kind || '',
      meta: spec.meta || {},
      createdAt: spec.createdAt || now(),
      updatedAt: spec.updatedAt || now(),
    }
  }

  function findAgent(id) {
    const agents = agentsSig.peek()
    for (let i = 0; i < agents.length; i++) if (agents[i].id === id) return agents[i]
    return null
  }

  function messageKey(agentId, messageId) {
    return String(agentId || '') + '/' + String(messageId || '')
  }

  function versionSig(map, key) {
    if (!map[key]) map[key] = EF.signal(0)
    return map[key]
  }

  function bump(sig) {
    sig.set(sig.peek() + 1)
  }

  function bumpMessageList(agentId) {
    bump(versionSig(messageListVersionSigs, agentId))
  }

  function bumpAgent(agentId) {
    bump(versionSig(agentVersionSigs, agentId))
  }

  function bumpMessage(agentId, messageId) {
    bump(versionSig(messageVersionSigs, messageKey(agentId, messageId)))
  }

  function deleteMessageVersionSignals(agentId) {
    const prefix = String(agentId || '') + '/'
    Object.keys(messageVersionSigs).forEach(function (key) {
      if (key.indexOf(prefix) === 0) delete messageVersionSigs[key]
    })
  }

  function deleteAgentSignals(agentId) {
    delete agentVersionSigs[agentId]
    delete messageListVersionSigs[agentId]
    delete activeRunStateSigs[agentId]
    deleteMessageVersionSignals(agentId)
  }

  function touchMessages(agentId, messages) {
    bumpMessageList(agentId)
    for (let i = 0; i < (messages || []).length; i++) bumpMessage(agentId, messages[i].id)
  }

  function shouldBumpMessageList(patch) {
    return !!(patch && (
      patch.status != null ||
      patch.toolCalls != null ||
      patch.meta != null ||
      patch.stats != null ||
      patch.contextRefs != null ||
      patch.attachments != null ||
      patch.questId != null ||
      patch.resultForQuestId != null
    ))
  }

  function getActiveAgent() {
    return findAgent(activeAgentIdSig())
  }

  function updateAgents(fn) {
    let out = null
    agentsSig.update(function (agents) {
      out = fn(agents.slice())
      return out
    })
    return out
  }

  function isDescendant(parentId, childId) {
    if (!parentId || !childId || parentId === childId) return false
    let cur = findAgent(childId)
    while (cur && cur.parentAgentId) {
      if (cur.parentAgentId === parentId) return true
      cur = findAgent(cur.parentAgentId)
    }
    return false
  }

  function createAgent(spec) {
    spec = spec || {}
    const agent = makeAgent(spec)
    if (agent.parentAgentId && (!findAgent(agent.parentAgentId) || isDescendant(agent.id, agent.parentAgentId))) {
      agent.parentAgentId = null
    }
    agentsSig.update(function (agents) { return agents.concat([agent]) })
    bumpAgent(agent.id)
    if (!spec || spec.select !== false) activeAgentIdSig.set(agent.id)
    return agent
  }

  function updateAgent(id, patch) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== id) return agent
        out = Object.assign({}, agent, patch || {}, { updatedAt: now() })
        if (patch && patch.parentAgentId && (!findAgent(patch.parentAgentId) || isDescendant(id, patch.parentAgentId))) out.parentAgentId = agent.parentAgentId || null
        if (patch && patch.permissions) out.permissions = normalizePermissionList(patch.permissions)
        delete out.workingDirectory
        delete out.workdir
        delete out.path
        delete out.groupId
        return out
      })
    })
    if (out) bumpAgent(id)
    if (out && patch && patch.messages) touchMessages(id, out.messages)
    return out
  }

  function renameAgent(id, name) {
    return updateAgent(id, { name: String(name || '') })
  }

  function moveAgent(id, opts, orderArg) {
    const agent = findAgent(id)
    const o = (opts && typeof opts === 'object') ? opts : { parentAgentId: opts, order: orderArg }
    if (!agent) return null
    const parentAgentId = o.parentAgentId || null
    if (parentAgentId && (!findAgent(parentAgentId) || parentAgentId === id || isDescendant(id, parentAgentId))) return null
    return updateAgent(id, { parentAgentId: parentAgentId, order: cleanOrder(o.order, agent.order) })
  }

  function reparentAgent(id, parentAgentId, order) {
    return moveAgent(id, { parentAgentId: parentAgentId || null, order: order })
  }

  function childIdsOf(id) {
    const agents = agentsSig.peek()
    const out = []
    for (let i = 0; i < agents.length; i++) if (agents[i].parentAgentId === id) out.push(agents[i].id)
    return out
  }

  function descendantIdsOf(id) {
    const out = []
    const stack = childIdsOf(id)
    while (stack.length) {
      const next = stack.shift()
      out.push(next)
      const children = childIdsOf(next)
      for (let i = 0; i < children.length; i++) stack.push(children[i])
    }
    return out
  }

  function deleteAgent(id) {
    const removed = findAgent(id)
    if (!removed) return null
    const removeIds = new Set([id].concat(descendantIdsOf(id)))
    agentsSig.update(function (agents) { return agents.filter(function (agent) { return !removeIds.has(agent.id) }) })
    removeIds.forEach(function (agentId) { deleteAgentSignals(agentId) })
    if (removeIds.has(activeAgentIdSig.peek())) {
      const rest = agentsSig.peek()
      activeAgentIdSig.set(rest.length ? rest[0].id : null)
    }
    return removed
  }

  function selectAgent(id) {
    activeAgentIdSig.set(id)
    return findAgent(id)
  }

  function appendMessage(agentId, message) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        out = makeMessage(Object.assign({}, message || {}, { agentId: agentId }))
        return Object.assign({}, agent, { messages: agent.messages.concat([out]), updatedAt: now() })
      })
    })
    if (out) {
      bumpMessageList(agentId)
      bumpMessage(agentId, out.id)
    }
    return out
  }

  function insertMessageAfter(agentId, afterMessageId, message) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        out = makeMessage(Object.assign({}, message || {}, { agentId: agentId }))
        const messages = agent.messages.slice()
        let index = messages.length - 1
        for (let i = 0; i < messages.length; i++) {
          if (messages[i].id === afterMessageId) {
            index = i
            break
          }
        }
        messages.splice(index + 1, 0, out)
        return Object.assign({}, agent, { messages: messages, updatedAt: now() })
      })
    })
    if (out) {
      bumpMessageList(agentId)
      bumpMessage(agentId, out.id)
    }
    return out
  }

  function readMessage(agentId, messageId) {
    const agent = findAgent(agentId)
    const messages = agent && agent.messages || []
    for (let i = 0; i < messages.length; i++) if (messages[i].id === messageId) return messages[i]
    return null
  }

  function updateMessage(agentId, messageId, patch) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        const messages = agent.messages.map(function (message) {
          if (message.id !== messageId) return message
          out = Object.assign({}, message, patch || {})
          return out
        })
        return Object.assign({}, agent, { messages: messages, updatedAt: now() })
      })
    })
    if (out) {
      bumpMessage(agentId, messageId)
      if (shouldBumpMessageList(patch)) bumpMessageList(agentId)
    }
    return out
  }

  function setAgentStatus(agentId, status) {
    return updateAgent(agentId, typeof status === 'object' ? status : { status: status })
  }

  function enqueueMessage(agentId, messageId, opts) {
    let out = null
    opts = opts || {}
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        out = makeQueueItem({ messageId: messageId, priority: opts.priority, interrupt: opts.interrupt, guidance: opts.guidance })
        const queue = opts.interrupt ? [out].concat(agent.queue || []) : (agent.queue || []).concat([out])
        return Object.assign({}, agent, {
          queue: queue,
          status: agent.status === 'idle' ? 'queued' : agent.status,
          updatedAt: now(),
        })
      })
    })
    if (out) bumpAgent(agentId)
    return out
  }

  function dequeueMessage(agentId, messageId) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        const queue = (agent.queue || []).filter(function (item) {
          if (!out && (!messageId || item.messageId === messageId)) {
            out = item
            return false
          }
          return true
        })
        return Object.assign({}, agent, { queue: queue, updatedAt: now() })
      })
    })
    if (out) bumpAgent(agentId)
    return out
  }

  function createQuest(agentId, spec) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        out = makeQuest(Object.assign({}, spec || {}, { toAgentId: agentId }))
        return Object.assign({}, agent, { quests: (agent.quests || []).concat([out]), updatedAt: now() })
      })
    })
    return out
  }

  function findQuest(agentId, questId) {
    const agent = findAgent(agentId)
    const quests = agent && agent.quests || []
    for (let i = 0; i < quests.length; i++) if (quests[i].id === questId) return quests[i]
    return null
  }

  function updateQuest(agentId, questId, patch) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        const quests = (agent.quests || []).map(function (quest) {
          if (quest.id !== questId) return quest
          out = Object.assign({}, quest, patch || {})
          return out
        })
        return Object.assign({}, agent, { quests: quests, updatedAt: now() })
      })
    })
    return out
  }

  function appendInboxEvent(agentId, event) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        out = makeInboxEvent(event)
        return Object.assign({}, agent, { inbox: (agent.inbox || []).concat([out]), updatedAt: now() })
      })
    })
    return out
  }

  function markInboxEventConsumed(agentId, eventId) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== agentId) return agent
        const inbox = (agent.inbox || []).map(function (event) {
          if (event.id !== eventId) return event
          out = Object.assign({}, event, { consumed: true })
          return out
        })
        return Object.assign({}, agent, { inbox: inbox, updatedAt: now() })
      })
    })
    return out
  }

  function addResource(spec) {
    const res = makeResource(spec)
    resourcesSig.update(function (items) { return items.concat([res]) })
    return res
  }

  function removeResource(id) {
    let removed = null
    resourcesSig.update(function (items) {
      return items.filter(function (item) {
        if (item.id === id) { removed = item; return false }
        return true
      })
    })
    agentsSig.update(function (agents) {
      return agents.map(function (agent) {
        return Object.assign({}, agent, {
          contextRefs: agent.contextRefs.filter(function (ref) { return ref.resourceId !== id && ref.id !== id }),
        })
      })
    })
    return removed
  }

  function storage() {
    try { return window.localStorage || null } catch (_) { return null }
  }

  function snapshot() {
    return {
      version: 2,
      agents: agentsSig.peek().map(snapshotAgent),
      resources: resourcesSig.peek(),
      activeAgentId: activeAgentIdSig.peek(),
    }
  }

  function snapshotAgent(agent) {
    const out = Object.assign({}, agent, {
      contextRefs: [],
      messages: (agent.messages || []).map(snapshotMessage),
    })
    delete out.path
    delete out.groupId
    return out
  }

  function limitString(value, max) {
    if (typeof value !== 'string' || value.length <= max) return value
    return value.slice(0, max) + '\n\n[truncated for persistence]'
  }

  function snapshotMessage(message) {
    const out = Object.assign({}, message)
    out.content = limitString(out.content, MAX_SNAPSHOT_CONTENT_CHARS)
    out.reasoning_content = limitString(out.reasoning_content, MAX_SNAPSHOT_REASONING_CHARS)
    if (out.toolCalls && out.toolCalls.length) out.toolCalls = out.toolCalls.map(snapshotToolCall)
    return out
  }

  function compactSnapshotValue(value, depth) {
    if (value == null) return value
    if (typeof value === 'string') return limitString(value, MAX_SNAPSHOT_TOOL_STRING_CHARS)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (depth <= 0) return limitString(JSON.stringify(value), MAX_SNAPSHOT_TOOL_STRING_CHARS)
    if (Array.isArray(value)) {
      const out = []
      const n = Math.min(value.length, 32)
      for (let i = 0; i < n; i++) out.push(compactSnapshotValue(value[i], depth - 1))
      if (value.length > n) out.push('[+' + (value.length - n) + ' items truncated]')
      return out
    }
    const out = {}
    const keys = Object.keys(value)
    const n = Math.min(keys.length, 48)
    for (let i = 0; i < n; i++) out[keys[i]] = compactSnapshotValue(value[keys[i]], depth - 1)
    if (keys.length > n) out.__truncatedKeys = keys.length - n
    return out
  }

  function snapshotToolCall(call) {
    return {
      id: call.id,
      providerCallId: call.providerCallId,
      toolId: call.toolId,
      name: call.name,
      args: compactSnapshotValue(call.args || {}, 4),
      status: call.status,
      actor: call.actor,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
      error: limitString(call.error, 4000),
      preview: compactSnapshotValue(call.preview, 3),
      result: compactSnapshotValue(call.result, 3),
      applyResult: compactSnapshotValue(call.applyResult, 3),
    }
  }

  function normalizeRestoredRuntime(agent) {
    const transient = { running: true, queued: true, waiting_approval: true, stopped: true, failed: true }
    const messages = (agent.messages || []).map(function (message) {
      return (message.status === 'running' || message.status === 'queued')
        ? Object.assign({}, message, { status: 'stopped', completedAt: message.completedAt || now() })
        : message
    })
    const quests = (agent.quests || []).map(function (quest) {
      return (quest.status === 'running' || quest.status === 'queued' || quest.status === 'waiting_approval')
        ? Object.assign({}, quest, { status: 'stopped', completedAt: quest.completedAt || now(), summary: quest.summary || 'Stopped by reload' })
        : quest
    })
    return Object.assign({}, agent, {
      status: transient[agent.status] ? 'idle' : (agent.status || 'idle'),
      statusText: '',
      activeMessageId: null,
      activeQuestId: null,
      queue: [],
      messages: messages,
      quests: quests,
    })
  }

  function save() {
    saveTimer = null
    const s = storage()
    if (!s || !persistenceEnabled) return snapshot()
    const data = snapshot()
    try {
      s.setItem(persistenceKey, JSON.stringify(data))
    } catch (err) {
      if (EF.reportError) EF.reportError({ scope: 'ai', storage: persistenceKey }, err)
    }
    return data
  }

  function scheduleSave() {
    if (!persistenceEnabled) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 800)
  }

  function restore(data) {
    const next = data || readStored()
    if (!next || next.version !== 2) return null
    agentsSig.set((next.agents || []).map(function (agent) { return normalizeRestoredRuntime(makeAgent(agent)) }))
    resourcesSig.set((next.resources || []).map(makeResource))
    activeAgentIdSig.set(next.activeAgentId || (agentsSig.peek()[0] && agentsSig.peek()[0].id) || null)
    const agents = agentsSig.peek()
    for (let i = 0; i < agents.length; i++) touchMessages(agents[i].id, agents[i].messages)
    return snapshot()
  }

  function readStored() {
    const s = storage()
    if (!s) return null
    try {
      const text = s.getItem(persistenceKey)
      if (text && text.length > MAX_STORED_STATE_CHARS) {
        s.removeItem(persistenceKey)
        return null
      }
      return text ? JSON.parse(text) : null
    } catch (_) {
      return null
    }
  }

  function configurePersistence(opts) {
    opts = opts || {}
    if (opts.key) persistenceKey = opts.key
    if (opts.enabled != null) persistenceEnabled = opts.enabled !== false
    if (opts.load !== false) restore()
    return snapshot()
  }

  function clearStoredState() {
    const s = storage()
    if (s) s.removeItem(persistenceKey)
  }

  function canMode(ruleMode, wantedMode) {
    if (ruleMode === 'readwrite') return true
    if (wantedMode === 'read') return ruleMode === 'read'
    if (wantedMode === 'write') return ruleMode === 'write'
    return ruleMode === wantedMode
  }

  function pathInside(path, root) {
    const child = normalizePath(path).toLowerCase().split('/').filter(Boolean)
    const parent = normalizePath(root).toLowerCase().split('/').filter(Boolean)
    if (!parent.length) return true
    if (child.length < parent.length) return false
    for (let i = 0; i < parent.length; i++) if (child[i] !== parent[i]) return false
    return true
  }

  function canAccessPath(agent, path, mode) {
    const wantedMode = mode || 'read'
    const rules = (agent && agent.permissions && agent.permissions.paths) || []
    for (let i = 0; i < rules.length; i++) {
      if (pathInside(path, rules[i].path) && canMode(rules[i].mode, wantedMode)) return true
    }
    return false
  }

  function canReadPath(agent, path) { return canAccessPath(agent, path, 'read') }
  function canWritePath(agent, path) { return canAccessPath(agent, path, 'write') }

  function defaultPermission(ctx) {
    if (ctx.actor === 'user') return true
    const actorAgent = findAgent(ctx.actor)
    const target = findAgent(ctx.targetAgentId)
    if (!actorAgent || !target) return false
    if (actorAgent.id === target.id) return true
    if (ctx.scope === 'messages.send') return isDescendant(actorAgent.id, target.id)
    if (ctx.scope === 'agent.manage') return isDescendant(actorAgent.id, target.id)
    if (ctx.scope === 'agent.summary') return isDescendant(actorAgent.id, target.id)
    if (ctx.scope === 'quest.read') {
      const quest = findQuest(ctx.targetAgentId, ctx.questId)
      return !!(quest && quest.fromAgentId === actorAgent.id)
    }
    return isDescendant(actorAgent.id, target.id)
  }

  function resolvePermission(actor, targetAgentId, scope, details) {
    const ctx = Object.assign({
      actor: actor || 'user',
      targetAgentId: targetAgentId,
      scope: scope || 'agent.full',
      actorAgent: actor === 'user' ? null : findAgent(actor),
      agent: findAgent(targetAgentId),
    }, details || {})
    const next = function (nextCtx) { return defaultPermission(nextCtx || ctx) }
    return permissionResolver ? permissionResolver(ctx, next) === true : next(ctx) === true
  }

  function setPermissionResolver(fn) {
    permissionResolver = fn
    return fn
  }

  function getPermissionResolver() { return permissionResolver }
  function canRead(actorId, targetId, scope) { return resolvePermission(actorId, targetId, scope || 'agent.full') }
  function canSend(actorId, targetId) { return resolvePermission(actorId, targetId, 'messages.send') }
  function canManage(actorId, targetId) { return resolvePermission(actorId, targetId, 'agent.manage') }
  function canUseTool(actorId, targetId, toolId, phase) {
    return resolvePermission(actorId, targetId, phase === 'apply' ? 'tool.apply' : 'tool.call', { toolId: toolId, phase: phase || 'call' })
  }

  function canUseOperation(actorId, targetId, op, phase, details) {
    const apply = phase === 'apply'
    return resolvePermission(actorId, targetId, apply ? 'operation.apply' : 'operation.preview', Object.assign({
      operation: op,
      op: op,
      phase: phase || 'preview',
    }, details || {}))
  }

  function messageApiRead(agentId, messageId, actor) {
    if (!resolvePermission(actor || 'user', agentId, 'messages.read', { messageId: messageId })) return null
    return readMessage(agentId, messageId)
  }

  function questApiRead(agentId, questId, actor) {
    if (!resolvePermission(actor || 'user', agentId, 'quest.read', { questId: questId })) return null
    const quest = findQuest(agentId, questId)
    if (!quest) return null
    return {
      agentId: agentId,
      questId: quest.id,
      status: quest.status,
      resultId: quest.resultMessageId || null,
      summary: quest.summary || '',
      createdAt: quest.createdAt,
      completedAt: quest.completedAt || null,
    }
  }

  function questApiResult(agentId, questId, actor) {
    const quest = questApiRead(agentId, questId, actor)
    if (!quest || !quest.resultId) return quest
    const message = messageApiRead(agentId, quest.resultId, actor)
    return Object.assign({}, quest, { message: message || null, content: message ? message.content : null, resultMessageId: quest.resultId })
  }

  function agentApiRead(agentId, actor) {
    if (!resolvePermission(actor || 'user', agentId, 'agent.summary')) return null
    const agent = findAgent(agentId)
    if (!agent) return null
    const unread = (agent.inbox || []).filter(function (event) { return !event.consumed }).length
    return {
      id: agent.id,
      name: agent.name,
      parentAgentId: agent.parentAgentId || null,
      order: agent.order,
      status: agent.status,
      statusText: agent.statusText || '',
      activeMessageId: agent.activeMessageId || null,
      activeQuestId: agent.activeQuestId || null,
      queuedCount: (agent.queue || []).length,
      unreadInboxCount: unread,
      recentQuests: (agent.quests || []).slice(-8),
    }
  }

  function agentMessages(agentId, opts, actor) {
    opts = opts || {}
    if (!resolvePermission(actor || 'user', agentId, 'messages.read')) return []
    const agent = findAgent(agentId)
    let messages = agent && agent.messages || []
    if (!opts.includeToolMessages) messages = messages.filter(function (message) { return message.role !== 'tool' })
    if (opts.after) {
      let index = -1
      for (let i = 0; i < messages.length; i++) if (messages[i].id === opts.after) { index = i; break }
      if (index >= 0) messages = messages.slice(index + 1)
    }
    if (opts.limit > 0 && messages.length > opts.limit) messages = messages.slice(messages.length - opts.limit)
    return messages.slice()
  }

  function activeAgentMeta() {
    const id = activeAgentIdSig()
    if (id) versionSig(agentVersionSigs, id)()
    const agent = findAgent(id)
    if (!agent) return null
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      statusText: agent.statusText || '',
      connection: agent.connection,
      model: agent.model,
      permissionMode: agent.permissionMode,
      activeMessageId: agent.activeMessageId || null,
      activeQuestId: agent.activeQuestId || null,
      queueLength: (agent.queue || []).length,
    }
  }

  function agentMessageIds(agentId) {
    versionSig(messageListVersionSigs, agentId)()
    const agent = findAgent(agentId)
    const messages = agent && agent.messages || []
    const out = []
    for (let i = 0; i < messages.length; i++) out.push(messages[i].id)
    return out
  }

  function messageVersion(agentId, messageId) {
    return versionSig(messageVersionSigs, messageKey(agentId, messageId))()
  }

  function messageListVersion(agentId) {
    return versionSig(messageListVersionSigs, agentId)()
  }

  function idleRunState(agentId) {
    return {
      agentId: agentId || null,
      runId: null,
      messageId: null,
      state: 'idle',
      previewTail: '',
      modelTail: '',
      activityText: '',
      previewUpdatedAt: null,
      startedAt: null,
      firstTokenAt: null,
      updatedAt: now(),
      completedAt: null,
      usage: null,
      outputTokens: 0,
      totalTokens: 0,
      cost: null,
      error: null,
    }
  }

  function activeRunState(agentId) {
    return versionSig(activeRunStateSigs, agentId)() || idleRunState(agentId)
  }

  function peekActiveRunState(agentId) {
    return versionSig(activeRunStateSigs, agentId).peek() || idleRunState(agentId)
  }

  function setActiveRunState(agentId, patch) {
    const sig = versionSig(activeRunStateSigs, agentId)
    const prev = sig.peek() || idleRunState(agentId)
    const next = Object.assign({}, prev, patch || {}, {
      agentId: agentId || (patch && patch.agentId) || prev.agentId || null,
      updatedAt: now(),
    })
    sig.set(next)
    return next
  }

  ai.agents = agentsSig
  ai.resources = resourcesSig
  ai.activeAgentId = activeAgentIdSig
  ai.findAgent = findAgent
  ai.getActiveAgent = getActiveAgent
  ai.activeAgentMeta = activeAgentMeta
  ai.agentMessageIds = agentMessageIds
  ai.messageVersion = messageVersion
  ai.messageListVersion = messageListVersion
  ai.activeRunState = activeRunState
  ai.peekActiveRunState = peekActiveRunState
  ai.setActiveRunState = setActiveRunState
  ai.createAgent = createAgent
  ai.updateAgent = updateAgent
  ai.renameAgent = renameAgent
  ai.moveAgent = moveAgent
  ai.reparentAgent = reparentAgent
  ai.deleteAgent = deleteAgent
  ai.selectAgent = selectAgent
  ai.isDescendant = isDescendant
  ai.appendMessage = appendMessage
  ai.insertMessageAfter = insertMessageAfter
  ai.readMessage = readMessage
  ai.updateMessage = updateMessage
  ai.setAgentStatus = setAgentStatus
  ai.enqueueMessage = enqueueMessage
  ai.dequeueMessage = dequeueMessage
  ai.createQuest = createQuest
  ai.findQuest = findQuest
  ai.updateQuest = updateQuest
  ai.appendInboxEvent = appendInboxEvent
  ai.markInboxEventConsumed = markInboxEventConsumed
  ai.addResource = addResource
  ai.removeResource = removeResource
  ai.canAccessPath = canAccessPath
  ai.canReadPath = canReadPath
  ai.canWritePath = canWritePath
  ai.canRead = canRead
  ai.canSend = canSend
  ai.canManage = canManage
  ai.canUseTool = canUseTool
  ai.canUseOperation = canUseOperation
  ai.setPermissionResolver = setPermissionResolver
  ai.getPermissionResolver = getPermissionResolver
  ai.snapshot = snapshot
  ai.save = save
  ai.restore = restore
  ai.configurePersistence = configurePersistence
  ai.clearStoredState = clearStoredState
  ai.message = ai.message || {}
  ai.quest = ai.quest || {}
  ai.agent = ai.agent || {}
  ai.message.read = messageApiRead
  ai.quest.read = questApiRead
  ai.quest.result = questApiResult
  ai.agent.read = agentApiRead
  ai.agent.messages = agentMessages

  restore()
  EF.effect(function () {
    agentsSig()
    resourcesSig()
    activeAgentIdSig()
    scheduleSave()
  })
})(window.EF = window.EF || {})
