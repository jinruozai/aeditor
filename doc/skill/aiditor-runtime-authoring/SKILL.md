---
name: aiditor-runtime-authoring
description: Use when an AI agent is running inside an Aiditor host and needs to create, edit, load, mount, or replace workspace-backed panels/components in the live editor dock runtime.
---

# Aiditor Runtime Authoring

Use this skill when you are already inside an Aiditor-powered editor and the
user asks you to make UI appear in the current editor, such as "put a panel in
the main dock" or "replace this panel".

This is not the skill for designing an app from scratch in an external code
repo. For that, use `aiditor-library-authoring`.

## First Move

1. Read the skill index if you are not sure this is the right workflow:

```js
aiditor.readReference({ uri: 'aiditor://skills' })
```

2. Read the generated API index when you need exact call shape:

```js
aiditor.searchReferences({ query: 'api', limit: 50 })
aiditor.readReference({ uri: 'aiditor://api' })
```

3. Inspect the live dock runtime:

```js
aiditor.inspectDocks({})
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
aiditor.addPanelToDock({
  dock: 'dock-id-from-inspectDocks',
  component: 'component-id',
  path: 'component-file.js',
  title: 'Panel Title',
})
```

For replacing an existing panel:

```js
aiditor.replacePanel({
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
aiditor.reloadPanel({
  panelId: 'panel-id-from-inspectDocks',
  path: 'component-file.js',
})
```

Use `reloadPanel` for "same component, new code". Use `replacePanel` only when
changing the panel to a different component.

## Component File Pattern

```js
;(function (aiditor) {
  'use strict'

  aiditor.registerComponent('demo.login', {
    category: 'panel',
    label: 'Login',
    defaults: function () {
      return { title: 'Login', icon: 'log-in', props: {} }
    },
    factory: function (propsSig, ctx) {
      const ui = aiditor.ui
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
})(window.aiditor = window.aiditor || {})
```

If the host has a project wrapper such as `Demo.project.component(id, spec)`,
use that wrapper instead of `aiditor.registerComponent`. Use one registration
path per file, never both.

## Rules

- Do not hand-write layout JSON for live placement.
- Do not pass source code inside dock/panel tool arguments.
- Do not use React, Vue, JSX, TSX, TypeScript annotations, `import`, or
  `export` in zero-build Aiditor workspace scripts.
- Prefer `aiditor.ui.*` controls when available.
- Use `aiditor.ui.view` for primary scroll surfaces.
- Use `aiditor.ui.propertyForm` for local schema-driven forms.
- Use `aiditor.inspector` providers for shared selection inspection.
- If `addPanelToDock` says the component is not registered, pass the workspace
  file `path` explicitly.
- After changing the file for an already-mounted panel, call
  `aiditor.reloadPanel({ panelId, path })`; do not use `replacePanel` as a
  refresh shortcut.
- If no writable workspace is open, tell the user to open/select a workspace
  before creating durable UI.

## References

- `../aiditor-authoring/references/component-patterns.md`
- `../aiditor-authoring/references/ai-workflow.md`
