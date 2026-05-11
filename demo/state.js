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

  Demo.selected = aeditor.signal(null)

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

  Demo.dump = function () {
    console.log('[Demo] catalog:', Demo.catalog.length, 'entries')
    console.log('[Demo] selected:', Demo.selected())
    console.log('[Demo] cached signals:', Object.keys(sigCache))
  }
})()
