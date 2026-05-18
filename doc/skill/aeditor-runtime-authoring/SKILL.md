---
name: aeditor-runtime-authoring
description: Use when an AI agent is running inside an AEditor host and needs to create, edit, load, mount, or replace workspace-backed panels/components in the live editor dock runtime.
---

# AEditor Runtime Authoring

Use this skill when you are already inside an AEditor-powered editor and the
user asks you to make UI appear in the current editor, such as "put a panel in
the main dock" or "replace this panel".

This is not the skill for designing an app from scratch in an external code
repo. For that, use `aeditor-library-authoring`.

## First Move

1. Read the skill index if you are not sure this is the right workflow:

```js
aeditor.readReference({ uri: 'aeditor://skills' })
```

2. Read the generated API index when you need exact call shape:

```js
aeditor.searchReferences({ query: 'api', limit: 50 })
aeditor.readReference({ uri: 'aeditor://api' })
```

3. Inspect the live dock runtime:

```js
aeditor.inspectDocks({})
```

Use a returned dock id or panel id. Do not guess names like `main` unless the
runtime inspection returned that id/name.

## Workflow

For a new panel:

1. Inspect the workspace with `workspace.fileSummary` / search tools.
2. Write a plain `.js` file in the workspace.
3. Register exactly one component in that file.
4. Inspect docks.
5. Mount the component:

```js
aeditor.addPanelToDock({
  dock: 'dock-id-from-inspectDocks',
  component: 'component-id',
  path: 'component-file.js',
  title: 'Panel Title',
})
```

For replacing an existing panel:

```js
aeditor.replacePanel({
  panelId: 'panel-id-from-inspectDocks',
  component: 'component-id',
  path: 'component-file.js',
  title: 'Panel Title',
})
```

Use `discardDirty: true` only when the user explicitly accepts replacing a dirty
panel.

For refreshing the same mounted panel after editing its component file:

```js
aeditor.reloadPanel({
  panelId: 'panel-id-from-inspectDocks',
  path: 'component-file.js',
})
```

Use `reloadPanel` for "same component, new code". Use `replacePanel` only when
changing the panel to a different component.

## Component File Pattern

```js
;(function (aeditor) {
  'use strict'

  aeditor.registerComponent('demo.login', {
    category: 'panel',
    label: 'Login',
    defaults: function () {
      return { title: 'Login', icon: 'log-in', props: {} }
    },
    factory: function (propsSig, ctx) {
      const ui = aeditor.ui
      const root = ui.h('div', 'demo-login')
      root.style.height = '100%'
      root.style.minHeight = '0'
      root.style.boxSizing = 'border-box'
      root.style.display = 'grid'
      root.style.placeItems = 'center'

      root.appendChild(ui.view({
        padding: true,
        children: [
          ui.input({ placeholder: 'Email' }),
          ui.input({ type: 'password', placeholder: 'Password' }),
          ui.button({ text: 'Sign in', kind: 'primary' }),
        ],
      }))

      ctx.onCleanup(function () { ui.dispose(root) })
      return root
    },
  })
})(window.aeditor = window.aeditor || {})
```

If the host has a project wrapper such as `Demo.project.component(id, spec)`,
use that wrapper instead of `aeditor.registerComponent`. Use one registration
path per file, never both.

## Rules

- Do not hand-write layout JSON for live placement.
- Do not pass source code inside dock/panel tool arguments.
- Do not use React, Vue, JSX, TSX, TypeScript annotations, `import`, or
  `export` in zero-build AEditor workspace scripts.
- Prefer `aeditor.ui.*` controls when available.
- Use `aeditor.ui.view` for primary scroll surfaces.
- Use `aeditor.ui.propertyForm` for local schema-driven forms.
- Use `aeditor.inspector` providers for shared selection inspection.
- If `addPanelToDock` says the component is not registered, pass the workspace
  file `path` explicitly.
- After changing the file for an already-mounted panel, call
  `aeditor.reloadPanel({ panelId, path })`; do not use `replacePanel` as a
  refresh shortcut.
- If no writable workspace is open, tell the user to open/select a workspace
  before creating durable UI.

## References

- `../aeditor-authoring/references/component-patterns.md`
- `../aeditor-authoring/references/ai-workflow.md`
