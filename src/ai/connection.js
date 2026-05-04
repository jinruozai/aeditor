// EF.ai connection/auth/transport registry.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const connections = {}
  const authDrivers = {}
  const transportDrivers = {}
  const connectionsSig = EF.signal([])
  const modelsSig = EF.signal({})
  const statusSig = EF.signal({})
  let activeConnection = 'mock'

  function normalizeModels(models) {
    const list = Array.isArray(models) ? models : []
    return list.map(function (item) {
      if (typeof item === 'string') return { id: item, value: item, label: item }
      const id = item.id || item.value || item.name || item.model
      return Object.assign({}, item, { id: id, value: id, label: item.label || item.name || id })
    }).filter(function (item) { return !!item.id })
  }

  function registerAuthDriver(type, driver) {
    authDrivers[type] = driver || {}
    return authDrivers[type]
  }

  function registerTransport(type, driver) {
    transportDrivers[type] = driver || {}
    return transportDrivers[type]
  }

  function registerConnection(id, spec) {
    spec = Object.assign({}, spec || {}, { id: id || spec.id })
    connections[spec.id] = spec
    connectionsSig.set(connectionOptions())
    if (!activeConnection) activeConnection = spec.id
    return spec
  }

  function getConnection(id) {
    return connections[id || activeConnection]
  }

  function listConnections() {
    return Object.keys(connections)
  }

  function connectionOptions() {
    return Object.keys(connections).map(function (id) {
      const c = connections[id]
      return {
        id: id,
        label: c.label || id,
        provider: c.provider || id,
        authType: c.auth && c.auth.type || 'none',
        transportType: c.transport && c.transport.type || '',
        modelHints: c.modelHints || [],
        order: c.order || 1000,
      }
    }).sort(function (a, b) { return a.order - b.order || a.label.localeCompare(b.label) })
  }

  function configKey(id, key) {
    return 'ai.connections.' + id + '.' + key
  }

  function connectionConfig(id, overrides) {
    const c = getConnection(id)
    const defaults = Object.assign({}, (c && c.configDefaults) || {})
    if (EF.settings && c) {
      Object.keys(defaults).forEach(function (key) {
        const value = EF.settings.get(configKey(c.id, key))
        if (value !== undefined) defaults[key] = value
      })
    }
    return Object.assign(defaults, overrides || {})
  }

  function modelHints(id) {
    const c = getConnection(id)
    return c ? (c.modelHints || []) : []
  }

  function setActiveConnection(id) {
    activeConnection = id || activeConnection
    ai.defaultConnection = activeConnection
    return getConnection(activeConnection)
  }

  function getTransport(id) {
    const c = getConnection(id)
    return c && transportDrivers[c.transport && c.transport.type]
  }

  function getAuthDriver(id) {
    const c = getConnection(id)
    return c && authDrivers[c.auth && c.auth.type || 'none']
  }

  function authStatus(id) {
    const c = getConnection(id)
    const driver = getAuthDriver(id)
    if (!c || !driver || !driver.status) return { state: 'unknown' }
    const status = driver.status(c, connectionConfig(c.id))
    return status && typeof status.then === 'function'
      ? (statusSig.peek()[c.id] || { state: 'unknown' })
      : status
  }

  function setStatus(id, status) {
    const next = Object.assign({}, statusSig.peek())
    next[id] = status || authStatus(id)
    statusSig.set(next)
    return next[id]
  }

  function refreshAuthStatus(id) {
    const c = getConnection(id)
    const driver = getAuthDriver(id)
    if (!c || !driver || !driver.status) return Promise.resolve(setStatus(id, { state: 'unknown' }))
    return Promise.resolve(driver.status(c, connectionConfig(c.id))).then(function (status) {
      return setStatus(c.id, status || { state: 'unknown' })
    })
  }

  function login(id) {
    const c = getConnection(id)
    const driver = getAuthDriver(id)
    if (!c || !driver || !driver.login) return Promise.resolve(setStatus(id, authStatus(id)))
    return Promise.resolve(driver.login(c, connectionConfig(c.id))).then(function (status) {
      return setStatus(c.id, status || authStatus(c.id))
    })
  }

  function logout(id) {
    const c = getConnection(id)
    const driver = getAuthDriver(id)
    if (!c || !driver || !driver.logout) return Promise.resolve(setStatus(id, authStatus(id)))
    return Promise.resolve(driver.logout(c, connectionConfig(c.id))).then(function (status) {
      return setStatus(c.id, status || authStatus(c.id))
    })
  }

  function refreshModels(id, overrides) {
    const c = getConnection(id || activeConnection)
    const transport = getTransport(c && c.id)
    if (!c || !transport || !transport.models) return Promise.resolve([])
    return Promise.resolve(transport.models(c, connectionConfig(c.id, overrides || {}))).then(function (models) {
      const next = Object.assign({}, modelsSig.peek())
      next[c.id] = normalizeModels(models || [])
      modelsSig.set(next)
      return next[c.id]
    })
  }

  function send(connectionId, request, ctx) {
    const c = getConnection(connectionId || activeConnection)
    const transport = getTransport(c && c.id)
    if (!c || !transport || !transport.send) throw new Error('AI connection is not available: ' + (connectionId || activeConnection))
    return transport.send(c, Object.assign({}, request, {
      connection: c.id,
      connectionName: c.id,
      model: request.model || connectionConfig(c.id).defaultModel || '',
    }), ctx)
  }

  ai.defaultConnection = activeConnection
  ai.connections = connectionsSig
  ai.connectionModels = modelsSig
  ai.connectionStatus = statusSig
  ai.registerAuthDriver = registerAuthDriver
  ai.registerTransport = registerTransport
  ai.registerConnection = registerConnection
  ai.getConnection = getConnection
  ai.listConnections = listConnections
  ai.connectionOptions = connectionOptions
  ai.connectionConfigKey = configKey
  ai.getConnectionConfig = connectionConfig
  ai.modelHints = modelHints
  ai.setActiveConnection = setActiveConnection
  ai.authStatus = authStatus
  ai.refreshAuthStatus = refreshAuthStatus
  ai.loginConnection = login
  ai.logoutConnection = logout
  ai.refreshModels = refreshModels
  ai.sendViaConnection = send
  ai.models = modelsSig
})(window.EF = window.EF || {})
