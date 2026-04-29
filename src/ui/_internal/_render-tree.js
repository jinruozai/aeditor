// EF.ui.renderUITree — instantiate a tree of components from a spec.
//
//   ui.renderUITree(node, ctx) → HTMLElement
//
// Spec:
//   TreeNode = {
//     id?:       string,                       // editor-side stable id
//     component: string,                       // registered component name
//     props?:    object,                       // literal prop values
//     bindings?: { [propKey]: { source: 'field', field: string } },
//     layout?:   object,                       // parent container interprets
//     children?: TreeNode[],
//   }
//
//   ctx = {
//     data?: signal<object>,                   // bindings resolve against this
//   }
//
// Each node is materialized via spec.factory(propsSig, ctx). propsSig is a
// derived signal that merges literal props with values pulled from ctx.data
// according to `bindings`. If a bound field's data source is missing the
// prop is undefined (component decides whether to no-op or render blank).
//
// Container components opt in via spec.acceptsChildren=true. Their child
// mounting logic can be customized via spec.appendChild(parentEl, childEl,
// childLayout). The default just `parentEl.appendChild(childEl)`.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.renderUITree = function renderUITree(node, ctx) {
    if (!node) return ui.h('div', 'ef-ui-tree-empty')
    const spec = EF.resolveComponent(node.component)
    const propsSig = buildPropsSig(node, ctx)
    const el = spec.factory(propsSig, ctx || {})
    if (spec.acceptsChildren && node.children && node.children.length) {
      const append = typeof spec.appendChild === 'function' ? spec.appendChild : defaultAppend
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        const childEl = renderUITree(child, ctx)
        append(el, childEl, child.layout || null)
      }
    }
    return el
  }

  function buildPropsSig(node, ctx) {
    const literal  = node.props || {}
    const bindings = node.bindings || {}
    const bKeys    = Object.keys(bindings)
    const dataSig  = ctx && ctx.data
    if (bKeys.length === 0) return EF.signal(literal)
    return EF.derived(function () {
      const out = Object.assign({}, literal)
      const data = dataSig ? dataSig() : null
      for (let i = 0; i < bKeys.length; i++) {
        const k = bKeys[i]
        const b = bindings[k]
        if (b && b.source === 'field') {
          out[k] = data ? data[b.field] : undefined
        }
      }
      return out
    })
  }

  function defaultAppend(parent, child) { parent.appendChild(child) }

  // Helper for component factories that wrap a ui.* primitive expecting
  // per-prop signals. Returns `{ key: derived(() => propsSig().key) }`.
  ui.liftProps = function liftProps(propsSig, keys) {
    const out = {}
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      out[k] = EF.derived(function () { const p = propsSig() || {}; return p[k] })
    }
    return out
  }
})(window.EF = window.EF || {})
