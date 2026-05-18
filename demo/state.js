// demo/state.js - shared UI catalog state for demo panels.
;(function () {
  'use strict'

  const Demo = window.Demo = window.Demo || {}
  Demo.catalog = Demo.catalog || []

  Demo.categories = [
    { id: 'base', label: 'Base' },
    { id: 'form', label: 'Form' },
    { id: 'editor', label: 'Editor' },
    { id: 'container', label: 'Container' },
    { id: 'data', label: 'Data' },
    { id: 'overlay', label: 'Overlay' },
  ]

  Demo.byCategory = function (cat) {
    return Demo.catalog.filter(function (e) { return e.category === cat })
  }

  Demo.byId = function (id) {
    for (let i = 0; i < Demo.catalog.length; i++) {
      if (Demo.catalog[i].id === id) return Demo.catalog[i]
    }
    return null
  }

  Demo.selected = aiditor.signal(null)

  const sigCache = {}
  Demo.getSignals = function (id) {
    if (sigCache[id]) return sigCache[id]
    const entry = Demo.byId(id)
    if (!entry) return null
    sigCache[id] = entry.signals ? entry.signals() : {}
    return sigCache[id]
  }

  Demo.mount = function (id) {
    const entry = Demo.byId(id)
    if (!entry || !entry.mount) return null
    return entry.mount(Demo.getSignals(id))
  }

  Demo.editFor = function (id) {
    const entry = Demo.byId(id)
    if (!entry || !entry.editFor) return {}
    return entry.editFor(Demo.getSignals(id))
  }

  Demo.select = function (id) {
    if (!Demo.byId(id)) return
    Demo.selected.set(id)
  }

  function readSpec(spec) {
    const sig = spec && spec.signal ? spec.signal : spec
    return sig && sig.peek ? sig.peek() : sig
  }

  function writeSpec(spec, value) {
    const sig = spec && spec.signal ? spec.signal : spec
    if (sig && sig.set) sig.set(value)
  }

  function optionsOf(spec) {
    const opts = spec && spec.options || []
    return opts.map(function (item) {
      return typeof item === 'string'
        ? { value: item, label: item }
        : { value: item.value, label: item.label || String(item.value) }
    })
  }

  function fieldFor(spec) {
    const value = readSpec(spec)
    const opts = optionsOf(spec)
    if (opts.length) return { type: 'enum_string', type_agv: { options: opts } }
    if (typeof value === 'boolean') return { type: 'bool' }
    if (typeof value === 'number') return { type: Number.isInteger(value) ? 'int' : 'float' }
    return { type: 'string' }
  }

  function selectInspector(id) {
    if (!aiditor.inspector) return
    const entry = Demo.byId(id)
    if (!entry) { aiditor.inspector.clear(); return }
    aiditor.inspector.select({
      type: 'demo.component',
      id: id,
      title: entry.name,
      meta: { componentId: id },
    }, { source: 'demo' })
  }

  if (aiditor.inspector) {
    aiditor.inspector.registerProvider('demo.component', {
      inspect: function (targets) {
        const id = targets[0].id
        const entry = Demo.byId(id)
        const edit = Demo.editFor(id)
        const schema = {}
        const value = {}
        Object.keys(edit || {}).forEach(function (key) {
          schema[key] = fieldFor(edit[key])
          value[key] = readSpec(edit[key])
        })
        return {
          title: entry ? entry.name : id,
          subtitle: entry ? entry.description : '',
          schema: schema,
          values: [value],
          write: function (field, change) {
            writeSpec(edit[field], change.value)
          },
        }
      },
    }, { owner: 'demo' })

    aiditor.effect(function () { selectInspector(Demo.selected()) })
  }

  Demo.dump = function () {
    console.log('[Demo] catalog:', Demo.catalog.length, 'entries')
    console.log('[Demo] selected:', Demo.selected())
    console.log('[Demo] cached signals:', Object.keys(sigCache))
  }
})()
