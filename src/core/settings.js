// aiditor.settings - schema + page registry for standard settings UI.
;(function (aiditor) {
  'use strict'

  const settings = aiditor.settings = aiditor.settings || {}

  const sectionsSig = aiditor.signal([])
  const schemasSig = aiditor.signal([])
  const pagesSig = aiditor.signal([])
  const sectionMeta = {}
  const schemaMeta = {}
  const pageMeta = {}
  const DEFAULT_STORAGE_KEY = 'aiditor.settings.v1'
  let storageKey = DEFAULT_STORAGE_KEY
  let storage = null
  const valuesSig = aiditor.signal(readStoredValues())

  function defaultStorage() {
    try { return window.localStorage || null } catch (_) { return null }
  }

  function readStoredValues() {
    const s = storage || defaultStorage()
    if (!s) return {}
    try { return JSON.parse(s.getItem(storageKey) || '{}') || {} } catch (_) { return {} }
  }

  function writeStoredValues(values) {
    const s = storage || defaultStorage()
    if (!s) return
    try { s.setItem(storageKey, JSON.stringify(values || {})) } catch (_) {}
  }

  function sortByOrder(a, b) {
    const ao = a.order != null ? a.order : 0
    const bo = b.order != null ? b.order : 0
    if (ao !== bo) return ao - bo
    return String(a.title || a.label || a.id || a.key).localeCompare(String(b.title || b.label || b.id || b.key))
  }

  function upsert(list, idKey, item) {
    let found = false
    const next = list.map(function (old) {
      if (old[idKey] !== item[idKey]) return old
      found = true
      return Object.assign({}, old, item)
    })
    if (!found) next.push(item)
    next.sort(sortByOrder)
    return next
  }

  function normalizeMeta(meta) {
    if (aiditor.runtime && aiditor.runtime.registrationMeta) meta = aiditor.runtime.registrationMeta(meta)
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    return out
  }

  const matchesPrefix = aiditor.names.matchesPrefix

  function registerSection(id, spec, meta) {
    const s = spec || {}
    const section = {
      id: id,
      title: s.title || id,
      icon: s.icon || 'settings',
      description: s.description || '',
      order: s.order != null ? s.order : 0,
    }
    sectionMeta[id] = normalizeMeta(meta)
    sectionsSig.update(function (list) { return upsert(list, 'id', section) })
    return section
  }

  function normalizeSchema(sectionId, schema) {
    const s = schema || {}
    return {
      key: s.key,
      section: s.section || sectionId,
      label: s.label || s.key,
      type: s.type || 'string',
      default: s.default,
      scope: s.scope || 'global',
      description: s.description || s.desc || '',
      options: s.options || null,
      sensitive: !!s.sensitive,
      order: s.order != null ? s.order : 0,
    }
  }

  function registerSchema(sectionId, schema, meta) {
    const list = Array.isArray(schema) ? schema : [schema]
    const m = normalizeMeta(meta)
    const out = []
    schemasSig.update(function (schemas) {
      let next = schemas.slice()
      for (let i = 0; i < list.length; i++) {
        const item = normalizeSchema(sectionId, list[i])
        out.push(item)
        schemaMeta[item.key] = m
        next = upsert(next, 'key', item)
      }
      return next
    })
    return Array.isArray(schema) ? out : out[0]
  }

  function registerPage(id, spec, meta) {
    const p = spec || {}
    const page = {
      id: id,
      section: p.section || id,
      title: p.title || id,
      icon: p.icon || 'settings',
      order: p.order != null ? p.order : 0,
      searchText: p.searchText || '',
      replacesSchema: !!p.replacesSchema,
      factory: p.factory,
    }
    pageMeta[id] = normalizeMeta(meta)
    pagesSig.update(function (list) { return upsert(list, 'id', page) })
    return page
  }

  function unregisterOwner(owner) {
    const removed = []
    const sectionIds = Object.keys(sectionMeta).filter(function (id) { return sectionMeta[id].owner === owner })
    const schemaKeys = Object.keys(schemaMeta).filter(function (key) { return schemaMeta[key].owner === owner })
    const pageIds = Object.keys(pageMeta).filter(function (id) { return pageMeta[id].owner === owner })
    sectionsSig.update(function (list) {
      return list.filter(function (item) { return sectionIds.indexOf(item.id) < 0 })
    })
    schemasSig.update(function (list) {
      return list.filter(function (item) { return schemaKeys.indexOf(item.key) < 0 })
    })
    pagesSig.update(function (list) {
      return list.filter(function (item) { return pageIds.indexOf(item.id) < 0 })
    })
    for (let i = 0; i < sectionIds.length; i++) { delete sectionMeta[sectionIds[i]]; removed.push(sectionIds[i]) }
    for (let j = 0; j < schemaKeys.length; j++) { delete schemaMeta[schemaKeys[j]]; removed.push(schemaKeys[j]) }
    for (let k = 0; k < pageIds.length; k++) { delete pageMeta[pageIds[k]]; removed.push(pageIds[k]) }
    return removed
  }

  function unregisterPrefix(prefix) {
    const removed = []
    const sectionIds = Object.keys(sectionMeta).filter(function (id) { return matchesPrefix(id, prefix) })
    const schemaKeys = Object.keys(schemaMeta).filter(function (key) { return matchesPrefix(key, prefix) })
    const pageIds = Object.keys(pageMeta).filter(function (id) { return matchesPrefix(id, prefix) })
    sectionsSig.update(function (list) {
      return list.filter(function (item) { return sectionIds.indexOf(item.id) < 0 })
    })
    schemasSig.update(function (list) {
      return list.filter(function (item) { return schemaKeys.indexOf(item.key) < 0 })
    })
    pagesSig.update(function (list) {
      return list.filter(function (item) { return pageIds.indexOf(item.id) < 0 })
    })
    for (let i = 0; i < sectionIds.length; i++) { delete sectionMeta[sectionIds[i]]; removed.push(sectionIds[i]) }
    for (let j = 0; j < schemaKeys.length; j++) { delete schemaMeta[schemaKeys[j]]; removed.push(schemaKeys[j]) }
    for (let k = 0; k < pageIds.length; k++) { delete pageMeta[pageIds[k]]; removed.push(pageIds[k]) }
    return removed
  }

  function findSchema(key) {
    const schemas = schemasSig.peek()
    for (let i = 0; i < schemas.length; i++) {
      if (schemas[i].key === key) return schemas[i]
    }
    return null
  }

  function get(key) {
    const values = valuesSig.peek()
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key]
    const schema = findSchema(key)
    return schema ? schema.default : undefined
  }

  function resolveOptions(options) {
    return typeof options === 'function' ? options() : (options || null)
  }

  function set(key, value) {
    valuesSig.update(function (values) {
      const next = Object.assign({}, values)
      next[key] = value
      writeStoredValues(next)
      return next
    })
    return value
  }

  function reset(key) {
    valuesSig.update(function (values) {
      const next = Object.assign({}, values)
      delete next[key]
      writeStoredValues(next)
      return next
    })
    return get(key)
  }

  function resetSection(sectionId) {
    const keys = schemasSig.peek().filter(function (s) { return s.section === sectionId }).map(function (s) { return s.key })
    valuesSig.update(function (values) {
      const next = Object.assign({}, values)
      for (let i = 0; i < keys.length; i++) delete next[keys[i]]
      writeStoredValues(next)
      return next
    })
  }

  function exportValues() {
    return Object.assign({}, valuesSig.peek())
  }

  function importValues(values) {
    const next = Object.assign({}, values || {})
    valuesSig.set(next)
    writeStoredValues(next)
  }

  function configurePersistence(opts) {
    const o = opts || {}
    storageKey = o.key || DEFAULT_STORAGE_KEY
    storage = o.storage || null
    const next = readStoredValues()
    valuesSig.set(next)
    return next
  }

  function save() {
    writeStoredValues(valuesSig.peek())
  }

  function clearStoredValues() {
    const s = storage || defaultStorage()
    if (!s) return
    try { s.removeItem(storageKey) } catch (_) {}
  }

  settings.sections = sectionsSig
  settings.schemas = schemasSig
  settings.pages = pagesSig
  settings.values = valuesSig
  settings.registerSection = registerSection
  settings.registerSchema = registerSchema
  settings.registerPage = registerPage
  settings.unregisterOwner = unregisterOwner
  settings.unregisterPrefix = unregisterPrefix
  settings.sectionMeta = function (id) { return Object.assign({}, sectionMeta[id] || {}) }
  settings.schemaMeta = function (key) { return Object.assign({}, schemaMeta[key] || {}) }
  settings.pageMeta = function (id) { return Object.assign({}, pageMeta[id] || {}) }
  settings.get = get
  settings.set = set
  settings.reset = reset
  settings.resetSection = resetSection
  settings.exportValues = exportValues
  settings.importValues = importValues
  settings.configurePersistence = configurePersistence
  settings.save = save
  settings.clearStoredValues = clearStoredValues
  settings.resolveOptions = resolveOptions
})(window.aiditor = window.aiditor || {})
