// EF.ai store - final group/agent/resource model.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  let nextGroupId = 1
  let nextAgentId = 1
  let nextMessageId = 1
  let nextResourceId = 1

  const groupsSig = EF.signal([])
  const agentsSig = EF.signal([])
  const resourcesSig = EF.signal([])
  const activeAgentIdSig = EF.signal(null)
  let permissionResolver = null
  let persistenceKey = 'editorframe.ai.v1'
  let persistenceEnabled = true

  function now() { return Date.now() }

  function makeId(prefix, n) {
    return prefix + '_' + now().toString(36) + '_' + n
  }

  function normalizePath(path) {
    let out = String(path || '').replace(/\\/g, '/')
    out = out.replace(/\/+/g, '/')
    out = out.replace(/^\/+/, '')
    out = out.replace(/\/+$/, '')
    return out || 'main'
  }

  function pathParts(path) {
    return normalizePath(path).toLowerCase().split('/').filter(Boolean)
  }

  function parentPath(path) {
    const parts = pathParts(path)
    parts.pop()
    return parts.join('/')
  }

  function agentNameFromPath(path) {
    const parts = pathParts(path)
    return parts.length ? parts[parts.length - 1] : normalizePath(path)
  }

  function isPathInside(path, root) {
    const child = pathParts(path)
    const parent = pathParts(root)
    if (!parent.length) return true
    if (child.length < parent.length) return false
    for (let i = 0; i < parent.length; i++) {
      if (child[i] !== parent[i]) return false
    }
    return true
  }

  function isDescendant(parent, child) {
    const p = pathParts(parent)
    const c = pathParts(child)
    if (!p.length || c.length <= p.length) return false
    for (let i = 0; i < p.length; i++) {
      if (p[i] !== c[i]) return false
    }
    return true
  }

  function defaultName(kind, id) {
    return kind + ' ' + String(id).split('_').pop()
  }

  function cleanOrder(order, fallback) {
    return typeof order === 'number' ? order : fallback
  }

  function makeGroup(spec) {
    spec = spec || {}
    const id = spec.id || makeId('g', nextGroupId++)
    return {
      id: id,
      name: spec.name || defaultName('Group', id),
      parentId: spec.parentId || null,
      order: cleanOrder(spec.order, groupsSig.peek().length),
      collapsed: !!spec.collapsed,
      createdAt: spec.createdAt || now(),
      updatedAt: spec.updatedAt || now(),
    }
  }

  function makePermission(path, mode) {
    return { path: normalizePath(path), mode: mode || 'read' }
  }

  function normalizePermissionList(permissions, path) {
    const paths = permissions && permissions.paths
    if (paths && paths.length) {
      return { paths: paths.map(function (p) { return makePermission(p.path, p.mode) }) }
    }
    return { paths: [makePermission(path, 'readwrite')] }
  }

  function makeAgent(spec) {
    spec = spec || {}
    const id = spec.id || makeId('a', nextAgentId++)
    const path = normalizePath(spec.path || spec.name || id)
    return {
      id: id,
      name: spec.name || agentNameFromPath(path),
      path: path,
      groupId: spec.groupId || null,
      order: cleanOrder(spec.order, agentsSig.peek().length),
      provider: spec.provider || ai.defaultProvider || 'mock',
      model: spec.model || '',
      mode: spec.mode || 'chat',
      permissionMode: spec.permissionMode || 'full',
      status: spec.status || 'idle',
      systemPrompt: spec.systemPrompt || '',
      messages: (spec.messages || []).map(makeMessage),
      contextRefs: spec.contextRefs ? spec.contextRefs.slice() : [],
      memory: spec.memory || {},
      state: spec.state || {},
      skillRefs: spec.skillRefs ? spec.skillRefs.slice() : [],
      toolRefs: spec.toolRefs ? spec.toolRefs.slice() : [],
      permissions: normalizePermissionList(spec.permissions, path),
      createdAt: spec.createdAt || now(),
      updatedAt: spec.updatedAt || now(),
      meta: spec.meta || {},
    }
  }

  function makeMessage(spec) {
    spec = spec || {}
    return {
      id: spec.id || makeId('m', nextMessageId++),
      from: spec.from || 'user',
      role: spec.role || 'user',
      content: spec.content == null ? '' : spec.content,
      provider: spec.provider || null,
      model: spec.model || null,
      time: spec.time || now(),
      status: spec.status || 'done',
      contextRefs: spec.contextRefs ? spec.contextRefs.slice() : [],
      attachments: spec.attachments ? spec.attachments.slice() : [],
      toolCalls: spec.toolCalls ? spec.toolCalls.slice() : [],
      meta: spec.meta || null,
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

  function findGroup(id) {
    const groups = groupsSig.peek()
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].id === id) return groups[i]
    }
    return null
  }

  function findAgent(id) {
    const agents = agentsSig.peek()
    for (let i = 0; i < agents.length; i++) {
      if (agents[i].id === id) return agents[i]
    }
    return null
  }

  function findAgentByPath(path) {
    const target = normalizePath(path).toLowerCase()
    const agents = agentsSig.peek()
    for (let i = 0; i < agents.length; i++) {
      if (normalizePath(agents[i].path).toLowerCase() === target) return agents[i]
    }
    return null
  }

  function getActiveAgent() {
    const id = activeAgentIdSig()
    const agents = agentsSig()
    for (let i = 0; i < agents.length; i++) {
      if (agents[i].id === id) return agents[i]
    }
    return null
  }

  function updateGroups(fn) {
    let out = null
    groupsSig.update(function (groups) {
      const next = fn(groups.slice())
      out = next
      return next
    })
    return out
  }

  function updateAgents(fn) {
    let out = null
    agentsSig.update(function (agents) {
      const next = fn(agents.slice())
      out = next
      return next
    })
    return out
  }

  function createGroup(spec) {
    const group = makeGroup(spec)
    groupsSig.update(function (groups) { return groups.concat([group]) })
    return group
  }

  function updateGroup(id, patch) {
    let out = null
    updateGroups(function (groups) {
      return groups.map(function (group) {
        if (group.id !== id) return group
        out = Object.assign({}, group, patch || {}, { updatedAt: now() })
        return out
      })
    })
    return out
  }

  function renameGroup(id, name) {
    return updateGroup(id, { name: String(name || '') })
  }

  function moveGroup(id, opts, orderArg) {
    const group = findGroup(id)
    const o = (opts && typeof opts === 'object') ? opts : { parentId: opts, order: orderArg }
    return updateGroup(id, { parentId: o.parentId || null, order: cleanOrder(o.order, group ? group.order : 0) })
  }

  function deleteGroup(id) {
    const removed = findGroup(id)
    const removeIds = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      const groups = groupsSig.peek()
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].parentId && removeIds.has(groups[i].parentId) && !removeIds.has(groups[i].id)) {
          removeIds.add(groups[i].id)
          changed = true
        }
      }
    }
    groupsSig.update(function (groups) { return groups.filter(function (g) { return !removeIds.has(g.id) }) })
    agentsSig.update(function (agents) {
      return agents.map(function (agent) {
        return removeIds.has(agent.groupId) ? Object.assign({}, agent, { groupId: null, updatedAt: now() }) : agent
      })
    })
    return removed
  }

  function createAgent(spec) {
    const agent = makeAgent(spec)
    agentsSig.update(function (agents) { return agents.concat([agent]) })
    activeAgentIdSig.set(agent.id)
    return agent
  }

  function updateAgent(id, patch) {
    let out = null
    updateAgents(function (agents) {
      return agents.map(function (agent) {
        if (agent.id !== id) return agent
        out = Object.assign({}, agent, patch || {}, { updatedAt: now() })
        if (patch && patch.path) out.path = normalizePath(patch.path)
        if (patch && patch.permissions) out.permissions = normalizePermissionList(patch.permissions, out.path)
        return out
      })
    })
    return out
  }

  function renameAgent(id, name) {
    return updateAgent(id, { name: String(name || '') })
  }

  function moveAgent(id, opts, orderArg) {
    const agent = findAgent(id)
    const o = (opts && typeof opts === 'object') ? opts : { groupId: opts, order: orderArg }
    return updateAgent(id, { groupId: o.groupId || null, order: cleanOrder(o.order, agent ? agent.order : 0) })
  }

  function setAgentPath(id, path) {
    return updateAgent(id, { path: normalizePath(path) })
  }

  function reparentAgent(id, parentAgentId, order) {
    const agent = findAgent(id)
    const parent = findAgent(parentAgentId)
    if (!agent || !parent || agent.id === parent.id) return null
    const name = agentNameFromPath(agent.path)
    const path = normalizePath(parent.path + '/' + name)
    return updateAgent(id, {
      path: path,
      groupId: parent.groupId || null,
      order: cleanOrder(order, agent.order),
    })
  }

  function deleteAgent(id) {
    const removed = findAgent(id)
    const removedPath = removed && removed.path
    agentsSig.update(function (agents) {
      return agents.filter(function (agent) {
        return agent.id !== id && !(removedPath && isDescendant(removedPath, agent.path))
      })
    })
    if (activeAgentIdSig.peek() === id || (removedPath && getActiveAgent() && isDescendant(removedPath, getActiveAgent().path))) {
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
        out = makeMessage(message)
        return Object.assign({}, agent, {
          messages: agent.messages.concat([out]),
          updatedAt: now(),
        })
      })
    })
    return out
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
        return Object.assign({}, agent, {
          messages: messages,
          updatedAt: now(),
        })
      })
    })
    return out
  }

  function setAgentStatus(agentId, status) {
    return updateAgent(agentId, { status: status })
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
      version: 1,
      groups: groupsSig.peek(),
      agents: agentsSig.peek(),
      resources: resourcesSig.peek(),
      activeAgentId: activeAgentIdSig.peek(),
    }
  }

  function save() {
    const s = storage()
    if (!s || !persistenceEnabled) return snapshot()
    s.setItem(persistenceKey, JSON.stringify(snapshot()))
    return snapshot()
  }

  function restore(data) {
    const next = data || readStored()
    if (!next) return null
    groupsSig.set((next.groups || []).map(makeGroup))
    agentsSig.set((next.agents || []).map(makeAgent))
    resourcesSig.set((next.resources || []).map(makeResource))
    activeAgentIdSig.set(next.activeAgentId || (agentsSig.peek()[0] && agentsSig.peek()[0].id) || null)
    return snapshot()
  }

  function readStored() {
    const s = storage()
    if (!s) return null
    try {
      const text = s.getItem(persistenceKey)
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

  function canAccessPath(agent, path, mode) {
    const wantedMode = mode || 'read'
    const rules = (agent && agent.permissions && agent.permissions.paths) || []
    for (let i = 0; i < rules.length; i++) {
      if (isPathInside(path, rules[i].path) && canMode(rules[i].mode, wantedMode)) return true
    }
    return false
  }

  function canReadPath(agent, path) {
    return canAccessPath(agent, path, 'read')
  }

  function canWritePath(agent, path) {
    return canAccessPath(agent, path, 'write')
  }

  function defaultPermission(ctx) {
    if (ctx.actor === 'user') return true
    const actor = findAgent(ctx.actor)
    const target = findAgent(ctx.targetAgentId)
    if (!actor || !target) return false
    if (ctx.scope === 'messages.send') {
      return actor.id === target.id || isDescendant(actor.path, target.path) || canAccessPath(actor, target.path, 'write')
    }
    if (ctx.scope === 'agent.manage') {
      return isDescendant(actor.path, target.path)
    }
    if (ctx.scope === 'agent.summary') {
      return actor.id === target.id || isDescendant(actor.path, target.path) || canReadPath(actor, target.path)
    }
    return actor.id === target.id || isDescendant(actor.path, target.path) || canReadPath(actor, target.path)
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

  function getPermissionResolver() {
    return permissionResolver
  }

  function canRead(actorId, targetId, scope) {
    return resolvePermission(actorId, targetId, scope || 'agent.full')
  }

  function canSend(actorId, targetId) {
    return resolvePermission(actorId, targetId, 'messages.send')
  }

  function canManage(actorId, targetId) {
    return resolvePermission(actorId, targetId, 'agent.manage')
  }

  function canUseTool(actorId, targetId, toolId, phase) {
    return resolvePermission(actorId, targetId, phase === 'apply' ? 'tool.apply' : 'tool.call', {
      toolId: toolId,
      phase: phase || 'call',
    })
  }

  ai.groups = groupsSig
  ai.agents = agentsSig
  ai.resources = resourcesSig
  ai.activeAgentId = activeAgentIdSig
  ai.normalizePath = normalizePath
  ai.parentPath = parentPath
  ai.agentNameFromPath = agentNameFromPath
  ai.isPathInside = isPathInside
  ai.isDescendant = isDescendant
  ai.findGroup = findGroup
  ai.createGroup = createGroup
  ai.updateGroup = updateGroup
  ai.renameGroup = renameGroup
  ai.moveGroup = moveGroup
  ai.deleteGroup = deleteGroup
  ai.findAgent = findAgent
  ai.findAgentByPath = findAgentByPath
  ai.getActiveAgent = getActiveAgent
  ai.createAgent = createAgent
  ai.updateAgent = updateAgent
  ai.renameAgent = renameAgent
  ai.moveAgent = moveAgent
  ai.reparentAgent = reparentAgent
  ai.setAgentPath = setAgentPath
  ai.deleteAgent = deleteAgent
  ai.selectAgent = selectAgent
  ai.appendMessage = appendMessage
  ai.updateMessage = updateMessage
  ai.setAgentStatus = setAgentStatus
  ai.addResource = addResource
  ai.removeResource = removeResource
  ai.canAccessPath = canAccessPath
  ai.canReadPath = canReadPath
  ai.canWritePath = canWritePath
  ai.canRead = canRead
  ai.canSend = canSend
  ai.canManage = canManage
  ai.canUseTool = canUseTool
  ai.setPermissionResolver = setPermissionResolver
  ai.getPermissionResolver = getPermissionResolver
  ai.snapshot = snapshot
  ai.save = save
  ai.restore = restore
  ai.configurePersistence = configurePersistence
  ai.clearStoredState = clearStoredState

  restore()
  EF.effect(function () {
    groupsSig()
    agentsSig()
    resourcesSig()
    activeAgentIdSig()
    save()
  })
})(window.EF = window.EF || {})
