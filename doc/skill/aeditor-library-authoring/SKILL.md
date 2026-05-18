---
name: aeditor-library-authoring
description: Use when coding an AEditor-based project or host app directly in a repository, outside the live editor agent runtime. Covers using AEditor as a zero-build JavaScript library.
---

# AEditor Library Authoring

Use this skill when writing project code that uses AEditor as a library:
`index.html`, host scripts, registered components, layout creation, demo apps,
or framework integration code.

If you are an agent already inside an AEditor editor and need to put a panel
into the current dock, use `aeditor-runtime-authoring`.

## Runtime Shape

Load the smallest layer the app needs:

```text
aeditor-kernel    core services + component registry + tree + dock runtime
aeditor-ui        aeditor.ui.* widgets, propertyForm, Inspector, settings UI, tab/log panels
aeditor-ai        AI Host + Extension Runtime add-on
aeditor-core      Kernel + UI
aeditor-full      Kernel + UI + AI Host + Extension Runtime
```

AEditor is plain browser JavaScript. Source files are IIFEs; consumer projects
can run with classic `<script>` tags and no bundler.

## Rules

- Write plain `.js` scripts unless the host app already owns a separate build
  system.
- Do not use React, Vue, JSX, TSX, TypeScript annotations, `import`, or
  `export` in zero-build AEditor scripts.
- Register UI with `aeditor.registerComponent(name, spec)`.
- Components receive `factory(propsSig, ctx)` and return one HTMLElement root.
- Panel roots must fit resizable docks: `height:100%`, `minHeight:0`,
  `boxSizing:border-box`, and flex/grid layouts with `minmax(0, 1fr)` or
  `minHeight:0` scroll children.
- Prefer `aeditor.ui.*` controls when the UI layer is loaded.
- Use `aeditor.ui.propertyForm` for local object editing.
- Use `aeditor.inspector` when multiple editor surfaces share one properties
  dock.
- App menus, save/open behavior, app shortcuts, and project formats belong to
  the host app, not framework core.

## Component Pattern

```js
;(function (aeditor) {
  'use strict'

  aeditor.registerComponent('app.notes', {
    category: 'panel',
    label: 'Notes',
    defaults: function () {
      return { title: 'Notes', icon: 'file-text', props: { text: '' } }
    },
    factory: function (propsSig, ctx) {
      const ui = aeditor.ui
      const text = aeditor.signal((propsSig.peek() || {}).text || '')
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
})(window.aeditor = window.aeditor || {})
```

## API Docs

Generated API docs are available when the AI layer is loaded:

```js
aeditor.readReference({ uri: 'aeditor://skills' })
aeditor.searchReferences({ query: 'api', limit: 50 })
aeditor.readReference({ uri: 'aeditor://api' })
```

Static docs live in `doc/api`.

## References

- `../aeditor-authoring/references/component-patterns.md`
- `../aeditor-authoring/references/extension-runtime.md`
