---
name: aiditor-library-authoring
description: Use when coding an Aiditor-based project or host app directly in a repository, outside the live editor agent runtime. Covers using Aiditor as a zero-build JavaScript library.
---

# Aiditor Library Authoring

Use this skill when writing project code that uses Aiditor as a library:
`index.html`, host scripts, registered components, layout creation, demo apps,
or framework integration code.

If you are an agent already inside an Aiditor editor and need to put a panel
into the current dock, use `aiditor-runtime-authoring`.

## Runtime Shape

Load the smallest layer the app needs:

```text
aiditor-kernel    core services + component registry + tree + dock runtime
aiditor-ui        aiditor.ui.* widgets, propertyForm, Inspector, settings UI, tab/log panels
aiditor-ai        AI Host + Extension Runtime add-on
aiditor-core      Kernel + UI
aiditor-full      Kernel + UI + AI Host + Extension Runtime
```

Aiditor is plain browser JavaScript. Source files are IIFEs; consumer projects
can run with classic `<script>` tags and no bundler.

## Rules

- Write plain `.js` scripts unless the host app already owns a separate build
  system.
- Do not use React, Vue, JSX, TSX, TypeScript annotations, `import`, or
  `export` in zero-build Aiditor scripts.
- Register UI with `aiditor.registerComponent(name, spec)`.
- Components receive `factory(propsSig, ctx)` and return one HTMLElement root.
- Panel roots must fit resizable docks: `height:100%`, `minHeight:0`,
  `boxSizing:border-box`, and flex/grid layouts with `minmax(0, 1fr)` or
  `minHeight:0` scroll children.
- Prefer `aiditor.ui.*` controls when the UI layer is loaded.
- Use `aiditor.ui.propertyForm` for local object editing.
- Use `aiditor.inspector` when multiple editor surfaces share one properties
  dock.
- App menus, save/open behavior, app shortcuts, and project formats belong to
  the host app, not framework core.

## Component Pattern

```js
;(function (aiditor) {
  'use strict'

  aiditor.registerComponent('app.notes', {
    category: 'panel',
    label: 'Notes',
    defaults: function () {
      return { title: 'Notes', icon: 'file-text', props: { text: '' } }
    },
    factory: function (propsSig, ctx) {
      const ui = aiditor.ui
      const text = aiditor.signal((propsSig.peek() || {}).text || '')
      const root = ui.h('div', 'app-notes')

      root.style.height = '100%'
      root.style.minHeight = '0'
      root.style.boxSizing = 'border-box'
      root.style.display = 'flex'

      root.appendChild(ui.view({
        scroll: 'y',
        padding: true,
        children: ui.textarea({
          value: text,
          onChange: function (value) {
            text(value)
            ctx.panel.updateProps({ text: value })
          },
        }),
      }))

      ctx.onCleanup(function () { ui.dispose(root) })
      return root
    },
  })
})(window.aiditor = window.aiditor || {})
```

## API Docs

Generated API docs are available when the AI layer is loaded:

```js
aiditor.readReference({ uri: 'aiditor://skills' })
aiditor.searchReferences({ query: 'api', limit: 50 })
aiditor.readReference({ uri: 'aiditor://api' })
```

Static docs live in `doc/api`.

## References

- `../aiditor-authoring/references/component-patterns.md`
- `../aiditor-authoring/references/extension-runtime.md`
