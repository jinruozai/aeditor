// Component registry - the single registration point for everything that can
// be put into a panel, a toolbar, a UI tree, or a card layout.
//
//   aeditor.registerComponent(name, spec)
//   aeditor.resolveComponent(name)             -> spec     (throws on unknown)
//   aeditor.componentDefaults(name)            -> object   (spec.defaults?.() ?? {})
//   aeditor.listComponents()                   -> [{ name, ...spec }]
//
// ComponentSpec = {
//   factory:           (propsSig, ctx) => HTMLElement,    // required
//
//   // Panel/toolbar lifecycle (consumed by the dock runtime)
//   defaults?:         () => ({ title?, icon?, props?, toolbarItems? }),
//   dispose?:          (el) => void,
//   serialize?:        (el) => any,
//   deserialize?:      (el, state) => void,
//
//   // Palette / UI-tree metadata (consumed by aeditor.ui.renderUITree + tools that
//   // present a palette of available components, e.g. a scene editor)
//   label?:            string,
//   icon?:             string,
//   category?:         'layout'|'base'|'form'|'editor'|'display'|'data'|'overlay'|'panel'|'custom',
//   schema?:           StructDef,                // describes spec props for propertyPanel
//   bindable?:         string[],                 // prop keys allowed to bind to a data field
//   appendChild?:      (parentEl, childEl, layout) => void, // optional custom child layout
// }
//
// The factory's first parameter is a signal carrying the current props.
// Read with `propsSig()` inside an effect for reactivity, or `propsSig.peek()`
// for a one-shot snapshot. The runtime / renderer that materializes the
// component decides what feeds the signal: for panel components it's
// ctx.panel.props (live); for toolbar items / UI-tree leaves it's a frozen
// signal seeded from the literal/static props.
;(function (aeditor) {
  'use strict'

  const components = new Map()
  const componentMeta = new Map()
  const versionSig = aeditor.signal(0)

  function bumpVersion() {
    versionSig.set(versionSig.peek() + 1)
  }

  function registerComponent(name, spec, meta) {
    if (typeof name !== 'string' || name.length === 0)
      throw new Error('registerComponent: name must be a non-empty string')
    if (components.has(name))
      throw new Error('registerComponent: duplicate name "' + name + '"')
    if (!spec || typeof spec.factory !== 'function')
      throw new Error('registerComponent: spec.factory must be a function')
    components.set(name, spec)
    componentMeta.set(name, normalizeMeta(meta))
    bumpVersion()
    return spec
  }

  function resolveComponent(name) {
    const spec = components.get(name)
    if (!spec) throw new Error('resolveComponent: unknown component "' + name + '"')
    return spec
  }

  function componentDefaults(name) {
    const spec = resolveComponent(name)
    return (spec.defaults && spec.defaults()) || {}
  }

  function listComponents(filter) {
    const out = []
    components.forEach(function (spec, name) {
      const meta = componentMeta.get(name) || {}
      if (filter && filter.owner != null && meta.owner !== filter.owner) return
      if (filter && filter.layer != null && meta.layer !== filter.layer) return
      out.push(Object.assign({ name: name, owner: meta.owner, layer: meta.layer }, spec))
    })
    return out
  }

  const matchesPrefix = aeditor.names.matchesPrefix

  function unregisterComponent(name, meta) {
    if (!components.has(name)) return false
    const existing = componentMeta.get(name) || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('unregisterComponent: owner mismatch for "' + name + '"')
    if (!existing.owner && meta && meta.owner)
      throw new Error('unregisterComponent: cannot remove ownerless component "' + name + '" by owner')
    components.delete(name)
    componentMeta.delete(name)
    bumpVersion()
    return true
  }

  function unregisterComponentPrefix(prefix) {
    const removed = []
    components.forEach(function (spec, name) {
      if (!matchesPrefix(name, prefix)) return
      components.delete(name)
      componentMeta.delete(name)
      removed.push(name)
    })
    if (removed.length) bumpVersion()
    return removed
  }

  function unregisterComponentOwner(owner) {
    if (!owner) return []
    const removed = []
    componentMeta.forEach(function (meta, name) {
      if (meta.owner === owner) {
        components.delete(name)
        componentMeta.delete(name)
        removed.push(name)
      }
    })
    if (removed.length) bumpVersion()
    return removed
  }

  function componentRegistration(name) {
    if (!components.has(name)) return null
    return Object.assign({ name: name, spec: components.get(name) }, componentMeta.get(name) || {})
  }

  function normalizeMeta(meta) {
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    return out
  }

  aeditor.registerComponent  = registerComponent
  aeditor.resolveComponent   = resolveComponent
  aeditor.componentDefaults  = componentDefaults
  aeditor.listComponents     = listComponents
  aeditor.unregisterComponent = unregisterComponent
  aeditor.unregisterComponentPrefix = unregisterComponentPrefix
  aeditor.unregisterComponentOwner = unregisterComponentOwner
  aeditor.componentRegistration = componentRegistration
  aeditor.componentRegistryVersion = versionSig
})(window.aeditor = window.aeditor || {})
