# Component Patterns

Load this reference when you are writing or reviewing AEditor component code.

## Component Contract

```js
aeditor.registerComponent('domain.name', {
  category: 'panel',
  label: 'Readable Name',
  defaults: function () {
    return { title: 'Readable Name', icon: 'square', props: {} }
  },
  factory: function (propsSig, ctx) {
    const root = document.createElement('div')
    return root
  },
})
```

`defaults()` returns panel defaults. `factory()` returns one HTMLElement. The
framework owns panel lifecycle; the component owns only its returned subtree and
any resources it creates.

## Signals

Use AEditor signals for component state:

```js
const value = aeditor.signal('hello')

ctx.onCleanup(aeditor.effect(function () {
  const props = propsSig() || {}
  value(props.text || '')
}))
```

Use `propsSig.peek()` for one-time reads. Use `propsSig()` only inside an
effect or derived signal. Do not call `propsSig.get()` or `propsSig.on()`.

## Layout

Panel roots should be stable inside split docks:

```js
root.style.height = '100%'
root.style.minHeight = '0'
root.style.boxSizing = 'border-box'
root.style.display = 'grid'
root.style.gridTemplateRows = 'auto minmax(0, 1fr)'
```

Use `minmax(0, 1fr)` or flex children with `minHeight: 0` for scrollable middle
areas. Avoid fixed viewport sizes inside panels.

## UI Library

Prefer AEditor UI primitives when the UI layer is loaded:

```js
const name = aeditor.signal('Untitled')

root.appendChild(aeditor.ui.view({
  scroll: 'y',
  padding: true,
  children: [
    aeditor.ui.input({ value: name, placeholder: 'Name' }),
    aeditor.ui.button({
      text: 'Save',
      icon: 'save',
      kind: 'primary',
      onClick: function () { ctx.panel.setDirty(false) },
    }),
  ],
}))
```

Use the matching component for buttons, icon buttons, form fields, lists, trees,
tables, menus, popovers, modals, drawers, toasts, and scroll surfaces.

If the host loaded only `aeditor-kernel`, write plain DOM inside component
roots or ask the host to load `aeditor-ui` before using `aeditor.ui.*`.

## Property Forms And Inspector

Use `aeditor.ui.propertyForm` when the current component owns the objects being
edited:

```js
const targets = aeditor.signal([{ name: 'Node', visible: true }])
root.appendChild(aeditor.ui.propertyForm({
  targets: targets,
  schema: {
    name: { type: 'string' },
    visible: { type: 'bool' },
  },
  onChange: function (field, value) {
    targets.set(targets.peek().map(function (item) {
      const next = Object.assign({}, item)
      next[field] = value
      return next
    }))
  },
}))
```

Use `aeditor.inspector` when selection comes from different panels or canvases
and a shared dock panel should inspect it. Register one provider per domain
target type, call `aeditor.inspector.select(targets)` from selection surfaces,
and mount the built-in `inspector` component.

Inspector multi-selection is ordered. The first target is primary and supplies
displayed values. A field is editable only when every selected target has that
field and the provider allows writing it. Do not invent a mixed-value state.

## Cleanup

Register external resources with `ctx.onCleanup`:

```js
const off = ctx.bus.on('selection.changed', function (payload) {
  // update local state
})

const timer = setInterval(tick, 1000)
ctx.onCleanup(function () { clearInterval(timer) })
ctx.onCleanup(function () { aeditor.ui.dispose(root) })
```

`ctx.bus.on` already auto-cleans when the panel is disposed. Call the returned
disposer only if you need to unsubscribe early.

## Toolbar Items

Toolbar components use the same component contract. Static toolbar items have
`ctx.dock` and no `ctx.panel`, because they belong to the dock rather than one
panel.

```js
aeditor.registerComponent('demo.toolbar.tabs', {
  category: 'toolbar',
  defaults: function () { return { props: {} } },
  factory: function (_, ctx) {
    const root = aeditor.ui.h('div', 'demo-toolbar-tabs')
    ctx.onCleanup(aeditor.effect(function () {
      const panels = ctx.dock.panels()
      const activeId = ctx.dock.activeId()
      root.textContent = panels.map(function (panel) {
        return panel.id === activeId ? '[' + panel.title + ']' : panel.title
      }).join(' ')
    }))
    return root
  },
})
```

## Anti-Patterns

- Registering the same component twice.
- Passing source code as a panel prop.
- Writing large app state into `ctx.panel.updateProps` on every animation frame.
- Using hidden DOM panels instead of AEditor's detached inactive panel model.
- Adding application shortcuts to framework source.
