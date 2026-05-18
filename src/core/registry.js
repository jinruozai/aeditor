// Component registry - the single registration point for everything that can
// be put into a panel, a toolbar, a UI tree, or a card layout.
//
//   aiditor.registerComponent(name, spec)
//   aiditor.resolveComponent(name)             -> spec     (throws on unknown)
//   aiditor.componentDefaults(name)            -> object   (spec.defaults?.() ?? {})
//   aiditor.listComponents()                   -> [{ name, ...spec }]
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
//   // Palette / UI-tree metadata (consumed by aiditor.ui.renderUITree + tools that
//   // present a palette of available components, e.g. a scene editor)
//   label?:            string,
//   icon?:             string,
//   category?:         'layout'|'base'|'form'|'editor'|'display'|'data'|'overlay'|'panel'|'custom',
//   schema?:           StructDef,                // describes spec props for propertyForm
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
;(function (aiditor) {
  'use strict'

  const components = new Map()
  const componentMeta = new Map()
  const versionSig = aiditor.signal(0)

  function bumpVersion() {
    versionSig.set(versionSig.peek() + 1)
  }

  /**
   * @aiditorApi aiditor.registerComponent
   * @group component
   * @layer core
   * @kind js-api
   * @signature aiditor.registerComponent(name, spec, meta?)
   * @summary Register a component that can be used as a panel, toolbar item, UI tree node, or palette item.
   * @param {string} name - Unique component id.
   * @param {object} spec - Component spec with factory(propsSig, ctx), plus optional defaults/dispose/serialize/deserialize/schema metadata.
   * @param {object} meta - Optional owner/layer metadata, normally supplied by runtime.loadScript.
   * @returns {object} The registered component spec.
   * @example
   * aiditor.registerComponent('hello-panel', {
   *   label: 'Hello Panel',
   *   factory: function (propsSig, ctx) {
   *     var el = document.createElement('div')
   *     el.textContent = 'Hello'
   *     return el
   *   },
   *   defaults: function () { return { title: 'Hello' } },
   * })
   * @wrong
   * aiditor.registerComponent('hello-panel', { render: function () {} })
   * @related aiditor.runtime.loadScript,aiditor.addPanelToDock
   */
  function registerComponent(name, spec, meta) {
    if (typeof name !== 'string' || name.length === 0)
      throw new Error('registerComponent: name must be a non-empty string')
    const m = normalizeMeta(meta)
    if (components.has(name)) {
      if (!m.replace) throw new Error('registerComponent: duplicate name "' + name + '"')
      const existing = componentMeta.get(name) || {}
      if ((existing.owner || '') !== (m.owner || '')) {
        throw new Error('registerComponent: cannot replace component "' + name + '" with different owner')
      }
    }
    if (!spec || typeof spec.factory !== 'function')
      throw new Error('registerComponent: spec.factory must be a function')
    components.set(name, spec)
    componentMeta.set(name, m)
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

  const matchesPrefix = aiditor.names.matchesPrefix

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
    if (aiditor.runtime && aiditor.runtime.registrationMeta) meta = aiditor.runtime.registrationMeta(meta)
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    if (meta.replace === true) out.replace = true
    return out
  }

  aiditor.registerComponent  = registerComponent
  aiditor.resolveComponent   = resolveComponent
  aiditor.componentDefaults  = componentDefaults
  aiditor.listComponents     = listComponents
  aiditor.unregisterComponent = unregisterComponent
  aiditor.unregisterComponentPrefix = unregisterComponentPrefix
  aiditor.unregisterComponentOwner = unregisterComponentOwner
  aiditor.componentRegistration = componentRegistration
  aiditor.componentRegistryVersion = versionSig
})(window.aiditor = window.aiditor || {})
