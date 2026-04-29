// demo/state.js — window.Demo namespace: the glue between catalog, showcase
// panels, component tree / search, and property inspector.
//
// Everything here lives in user code, not the framework. The framework does
// not know about "component demos" or "property panels".
;(function () {
  'use strict'

  const Demo = window.Demo = window.Demo || {}
  Demo.catalog = Demo.catalog || []

  // Category definitions — order matters for the tree view.
  Demo.categories = [
    { id: 'base',      label: 'Base',      icon: '◇', component: 'showcase-base' },
    { id: 'form',      label: 'Form',      icon: '▣', component: 'showcase-form' },
    { id: 'editor',    label: 'Editor',    icon: '✎', component: 'showcase-editor' },
    { id: 'container', label: 'Container', icon: '▢', component: 'showcase-container' },
    { id: 'data',      label: 'Data',      icon: '▤', component: 'showcase-data' },
    { id: 'overlay',   label: 'Overlay',   icon: '◈', component: 'showcase-overlay' },
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

  // Currently selected component (null = nothing selected).
  Demo.selected = EF.signal(null)

  // Signal cache — each catalog entry's signals() runs at most ONCE per id.
  // All showcase panels + the property inspector close over the same bag, so
  // edits in the property panel propagate to every mounted card automatically.
  //
  // mount() returns a FRESH DOM subtree each call (a DOM node can only have
  // one parent, so multiple open showcase panels can't share the element).
  // But every fresh mount is bound to the same cached signals, so they stay
  // in sync through the signal layer.
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

  // Select + scroll — called when the user clicks a tree / search row.
  //
  // VSCode-style preview semantics:
  //   • Single click → preview:true. Opens the category's showcase panel as a
  //     transient tab (italic title). Only ONE transient tab at a time — a
  //     second single-click on a DIFFERENT category evicts the previous one
  //     to reuse the preview slot.
  //   • Double click → preview:false. Promotes the tab to permanent (or opens
  //     fresh as permanent). Permanent tabs are never evicted by future
  //     single-clicks on unrelated categories.
  //
  // Steps:
  //   1. Ensure the category's showcase panel exists + is active (opens new
  //      tab if needed, honouring the preview flag).
  //   2. Update the selected signal so the property panel follows.
  //   3. Schedule a scroll on the element once it's in the DOM.
  Demo.select = function (id, opts) {
    const entry = Demo.byId(id)
    if (!entry) return
    const preview = !!(opts && opts.preview)
    Demo.openCategory(entry.category, { preview: preview })
    Demo.selected.set(id)
    // The element may not be in the DOM yet if the panel was just created.
    requestAnimationFrame(function () {
      // Scroll the card wrapper into view within the showcase panel's scroll
      // area. The card wrapper carries data-demo-id so we can find it even
      // if the element itself is a bare control.
      const card = document.querySelector('[data-demo-id="' + id + '"]')
      if (card && card.scrollIntoView) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' })
        card.classList.add('demo-showcase-card-pulse')
        setTimeout(function () { card.classList.remove('demo-showcase-card-pulse') }, 900)
      }
    })
  }

  // Ensure the showcase panel for a category is open & active. If it already
  // exists in some dock, we activate it there; otherwise we add it to the
  // `editor` dock (the main center dock).
  //
  // Preview semantics map onto the framework's transient flag:
  //   • opts.preview === true  → layout.addPanel(..., { transient: true }).
  //     The framework's addPanel auto-evicts any existing transient panel in
  //     the same dock (one preview slot per dock). No eviction logic here.
  //   • opts.preview === false → creates permanent, OR promotes an existing
  //     transient tab via layout.promotePanel(). Permanent tabs stay put.
  Demo.openCategory = function (cat, opts) {
    const catDef = Demo.categories.find(function (c) { return c.id === cat })
    if (!catDef) return
    const layout = Demo.layout
    if (!layout) return
    const preview = !!(opts && opts.preview)
    const tree = layout.tree()
    const found = findPanelByComponent(tree, catDef.component)
    if (found) {
      if (!preview) layout.promotePanel(found.panelId)
      layout.activatePanel(found.panelId)
      return
    }
    const mainDockId = findDockByName(tree, 'editor')
    if (!mainDockId) return
    layout.addPanel(mainDockId, {
      component: catDef.component,
      title:  catDef.label,
      icon:   catDef.icon,
    }, preview ? { transient: true } : undefined)
  }

  function findPanelByComponent(tree, componentName) {
    function walk(node) {
      if (node.type === 'dock') {
        for (let i = 0; i < node.panels.length; i++) {
          if (node.panels[i].component === componentName) {
            return { dockId: node.id, panelId: node.panels[i].id }
          }
        }
        return null
      }
      for (let i = 0; i < node.children.length; i++) {
        const r = walk(node.children[i])
        if (r) return r
      }
      return null
    }
    return walk(tree)
  }

  function findDockByName(tree, name) {
    function walk(node) {
      if (node.type === 'dock') return node.name === name ? node.id : null
      for (let i = 0; i < node.children.length; i++) {
        const r = walk(node.children[i])
        if (r) return r
      }
      return null
    }
    return walk(tree)
  }

  // Small console harness for poking at state from DevTools.
  Demo.dump = function () {
    console.log('[Demo] catalog:', Demo.catalog.length, 'entries')
    console.log('[Demo] selected:', Demo.selected())
    console.log('[Demo] cached signals:', Object.keys(sigCache))
  }
})()
