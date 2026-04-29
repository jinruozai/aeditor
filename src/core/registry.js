// Component registry — the single registration point for everything that can
// be put into a panel, a toolbar, a UI tree, or a card layout. § 4.8.
//
//   EF.registerComponent(name, spec)
//   EF.resolveComponent(name)             → spec     (throws on unknown)
//   EF.componentDefaults(name)            → object   (spec.defaults?.() ?? {})
//   EF.listComponents()                   → [{ name, ...spec }]
//
// ComponentSpec = {
//   factory:           (propsSig, ctx) => HTMLElement,    // required
//
//   // Panel/toolbar lifecycle (consumed by the dock runtime — § 4.16)
//   defaults?:         () => ({ title?, icon?, props?, toolbarItems? }),
//   dispose?:          (el) => void,
//   serialize?:        (el) => any,
//   deserialize?:      (el, state) => void,
//
//   // Palette / UI-tree metadata (consumed by EF.ui.renderUITree + tools that
//   // present a palette of available components, e.g. a card-layout editor)
//   label?:            string,
//   icon?:             string,
//   category?:         'layout'|'base'|'form'|'editor'|'display'|'data'|'overlay'|'panel'|'custom',
//   schema?:           StructDef,                // describes spec props for propertyPanel
//   bindable?:         string[],                 // prop keys allowed to bind to a data field
//   acceptsChildren?:  boolean,                  // container — UI tree may insert children
// }
//
// The factory's first parameter is a signal carrying the current props.
// Read with `propsSig()` inside an effect for reactivity, or `propsSig.peek()`
// for a one-shot snapshot. The runtime / renderer that materializes the
// component decides what feeds the signal — for panel components it's
// ctx.panel.props (live); for toolbar items / UI-tree leaves it's a frozen
// signal seeded from the literal/static props.
;(function (EF) {
  'use strict'

  const components = new Map()

  function registerComponent(name, spec) {
    if (typeof name !== 'string' || name.length === 0)
      throw new Error('registerComponent: name must be a non-empty string')
    if (components.has(name))
      throw new Error('registerComponent: duplicate name "' + name + '"')
    if (!spec || typeof spec.factory !== 'function')
      throw new Error('registerComponent: spec.factory must be a function')
    components.set(name, spec)
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

  function listComponents() {
    const out = []
    components.forEach(function (spec, name) { out.push(Object.assign({ name: name }, spec)) })
    return out
  }

  EF.registerComponent  = registerComponent
  EF.resolveComponent   = resolveComponent
  EF.componentDefaults  = componentDefaults
  EF.listComponents     = listComponents
})(window.EF = window.EF || {})
