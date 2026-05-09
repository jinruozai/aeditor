// demo component: showcase-<category>
//
// One component per component category (Base / Form / Editor / Container / Data /
// Overlay). Each iterates Demo.byCategory(cat) and, for every entry, builds
// a compact card:
//
//   ┌─────────────────────────────────┐
//   │ NAME                            │   ← ui.card head (title)
//   │ ┌─────────────────────────────┐ │
//   │ │     live control            │ │   ← .demo-card-stage inside card body
//   │ └─────────────────────────────┘ │
//   └─────────────────────────────────┘
//
// The live control is produced by `Demo.mount(id)` — which returns FRESH
// DOM each call bound to the shared signal bag in `Demo.getSignals(id)`.
// That means multiple showcase panels can be open simultaneously: each
// panel has its own DOM tree, but every tree responds to the same set of
// signals, so editing a prop in the property panel updates every mount.
//
// Click a card → `Demo.selected.set(id)` so the property inspector and
// any active-card highlight follow.
;(function (EF) {
  'use strict'
  const ui = EF.ui

  function createShowcase(cat) {
    return function (propsSig, ctx) {
      const props = propsSig.peek() || {};
      const root = ui.h('div', 'demo-showcase')
      const body = ui.h('div', 'demo-showcase-body')
      const scroll = ui.scrollArea({ children: body })
      root.appendChild(scroll)

      const entries = Demo.byCategory(cat)
      const cards = []  // { id, wrap }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]

        // ui.card provides the bordered container + head bar. We attach
        // .demo-showcase-card for demo-specific cursor/hover/active rules
        // and data-demo-id so Demo.select's scrollIntoView can find it.
        const card = ui.card({ title: entry.name, padded: false })
        card.classList.add('demo-showcase-card')
        if (entry.stageSize === 'lg') card.classList.add('demo-showcase-card-wide')
        card.setAttribute('data-demo-id', entry.id)
        if (entry.description) card.title = entry.description

        const stage = ui.h('div', 'demo-card-stage')
        const mounted = Demo.mount(entry.id)
        if (mounted) stage.appendChild(mounted)
        card.body.appendChild(stage)

        card.addEventListener('click', function () {
          Demo.selected.set(entry.id)
        })

        body.appendChild(card)
        cards.push({ id: entry.id, wrap: card })
      }

      // Subscribe to Demo.selected → toggle 'demo-showcase-card-active'.
      ctx.onCleanup(EF.effect(function () {
        const sel = Demo.selected()
        for (let i = 0; i < cards.length; i++) {
          cards[i].wrap.classList.toggle('demo-showcase-card-active', cards[i].id === sel)
        }
      }))

      return root
    }
  }

  const catDefs = [
    { id: 'base',      label: 'Base',      icon: '◇' },
    { id: 'form',      label: 'Form',      icon: '▣' },
    { id: 'editor',    label: 'Editor',    icon: '✎' },
    { id: 'container', label: 'Container', icon: '▢' },
    { id: 'data',      label: 'Data',      icon: '▤' },
    { id: 'overlay',   label: 'Overlay',   icon: '◈' },
  ]
  for (let i = 0; i < catDefs.length; i++) {
    const c = catDefs[i]
    EF.registerComponent('showcase-' + c.id, {
      category: 'panel',
      label: c.label,
      icon: c.icon,
      defaults: (function (cc) {
        return function () { return { title: cc.label, icon: cc.icon } }
      })(c),
      factory: createShowcase(c.id),
    })
  }
})(window.EF = window.EF || {})
