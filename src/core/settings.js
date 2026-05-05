// EF.settings - schema + page registry for standard settings UI.
;(function (EF) {
  'use strict'

  const settings = EF.settings = EF.settings || {}

  const sectionsSig = EF.signal([])
  const schemasSig = EF.signal([])
  const pagesSig = EF.signal([])
  const DEFAULT_STORAGE_KEY = 'editorframe.settings.v1'
  let storageKey = DEFAULT_STORAGE_KEY
  let storage = null
  const valuesSig = EF.signal(readStoredValues())

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

  function registerSection(id, spec) {
    const s = spec || {}
    const section = {
      id: id,
      title: s.title || id,
      icon: s.icon || 'settings',
      description: s.description || '',
      order: s.order != null ? s.order : 0,
    }
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

  function registerSchema(sectionId, schema) {
    const list = Array.isArray(schema) ? schema : [schema]
    const out = []
    schemasSig.update(function (schemas) {
      let next = schemas.slice()
      for (let i = 0; i < list.length; i++) {
        const item = normalizeSchema(sectionId, list[i])
        out.push(item)
        next = upsert(next, 'key', item)
      }
      return next
    })
    return Array.isArray(schema) ? out : out[0]
  }

  function registerPage(id, spec) {
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
    pagesSig.update(function (list) { return upsert(list, 'id', page) })
    return page
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
})(window.EF = window.EF || {})
