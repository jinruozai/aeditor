---
name: aiditor-authoring
description: Use when an AI agent needs to build, modify, review, or mount AIditor editor UI: registered components, dock layouts, panels, toolbar items, aiditor.ui controls, AI tools/context/operations, extension manifests, or workspace-backed editor code. Use for zero-build plain JavaScript AIditor projects and to avoid React, TSX, JSX, import/export, or bundled-module patterns.
---

# AIditor Authoring

This is the compatibility umbrella skill. Prefer the focused skills:

- `aiditor-runtime-authoring`: live AIditor agent, workspace files, runtime dock
  mounting/replacing.
- `aiditor-library-authoring`: Codex-like repository work using AIditor as a
  library.

Use AIditor as a zero-dependency, zero-build editor framework. Build durable
editor UI as plain JavaScript files that register AIditor components, then mount
those registered component names into dock panels.

## Current Runtime Shape

Load only the layer the host needs:

```text
aiditor-kernel    core services + component registry + tree + dock runtime
aiditor-ui        aiditor.ui.* widgets, propertyForm, Inspector, settings UI, tab/log panels
aiditor-ai        AI Host + Extension Runtime add-on
aiditor-core      classic Kernel + UI bundle
aiditor-full      Kernel + UI + AI Host + Extension Runtime
```

If a host loaded only `aiditor-kernel`, do not assume `aiditor.ui.*`,
`tab-standard`, `log`, AI tools, or extension APIs exist. Check the loaded
surface before using optional layers.

## First Steps

1. Inspect the host workspace before writing code. Find how it loads scripts,
   registers components, creates the layout, and stores demo or project state.
2. When an API shape is unclear, search the generated runtime API references
   before guessing. Use `aiditor.searchReferences` with the API name, then
   `aiditor.readReference` on the returned `aiditor://api/...` URI.
3. Use one component registration path for each file. Standalone code uses
   `aiditor.registerComponent(name, spec)`. If the host provides a wrapper, use
   that wrapper instead.
4. Prefer editing or adding real source files. Do not pass source code inside
   dock, panel, or extension tool arguments.
5. Keep changes small and framework-shaped: Component for UI, Dock for layout,
   Panel for mounted content, Tool/Context Reference/Operation/ChangeSet for AI
   work.

## Hard Rules

- Write plain `.js` scripts. Do not create React, Vue, TSX, JSX, TypeScript
  annotations, `import`, or `export` unless the existing host app already owns a
  build system for that layer.
- Do not add app-level shortcuts to framework code. Hosts may bind commands;
  framework components only own their internal semantic keys.
- Components receive `factory(propsSig, ctx)` and return one HTMLElement root.
  `propsSig` is a signal function: use `propsSig.peek()` for a one-time read,
  or `propsSig()` inside `aiditor.effect`.
- Clean up with `ctx.onCleanup(fn)`. If you create nested AIditor UI elements,
  call `aiditor.ui.dispose(root)` from cleanup when the subtree needs disposal.
- Panel roots must survive resizable docks: set `height: 100%`, `minHeight: 0`,
  `boxSizing: border-box`, and use flex or grid layouts that adapt.
- Prefer `aiditor.ui.*` controls over raw controls when the UI layer is loaded
  and one exists. Use `aiditor.ui.view` for primary scroll surfaces.
- Use `aiditor.ui.propertyForm` for schema-driven fields owned by one component.
  Use `aiditor.inspector` plus a provider when many editor surfaces need to
  inspect the current selection in a shared dock panel.
- Toolbar tab components are normal toolbar components. Static toolbar items
  have `ctx.dock` but no `ctx.panel`.
- `tab-standard` does not show a `+` button by default. To add one, configure
  the toolbar item with JSON data such as
  `{ props: { addPanel: { component: 'app.emptyScene' } } }`; the tab component
  merges that record over the target component defaults and calls
  `ctx.dock.addPanel`.
- A non-root dock normally disappears when its last panel is closed or moved
  away. Set `removeWhenEmpty:false` on `aiditor.dock(...)` when the host wants
  an empty dock placeholder to remain.
- Use `dockMenu: true` only when the host wants AIditor default dock menu
  contributions. Menus and commands are opt-in host choices.
- In the AIditor demo project runtime, component entry files use
  `Demo.project.component(componentId, spec)`. Do not hand-write layout JSON or
  guess dock names. Use `aiditor.inspectDocks`, choose a returned `dockId`, then
  call `aiditor.addPanelToDock` with the registered `component`; include `path`
  when the component file was just written and has not been loaded yet. If
  `path` is omitted, the tool can infer a single matching JS file; retry with an
  explicit `path` if it reports ambiguity. When replacing one existing panel,
  use `aiditor.replacePanel` with the returned `panelId` instead of add/remove
  choreography. After editing the file for the same mounted component, use
  `aiditor.reloadPanel({ panelId, path })` instead of `replacePanel`.

## Component Pattern

```js
;(function (aiditor) {
  'use strict'

  aiditor.registerComponent('demo.notes', {
    category: 'panel',
    label: 'Notes',
    defaults: function () {
      return {
        title: 'Notes',
        icon: 'file-text',
        props: { text: '' },
      }
    },
    factory: function (propsSig, ctx) {
      const ui = aiditor.ui
      const root = ui.h('div', 'demo-notes')
      const initial = (propsSig.peek() || {}).text || ''
      const text = aiditor.signal(initial)

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

For more patterns, read
`doc/skill/aiditor-authoring/references/component-patterns.md`.

## Inspector Pattern

Do not build an ad hoc inspector panel for generic editor selection. Register
an Inspector provider for the domain target type, let editor surfaces select
ordered targets, and mount the built-in `inspector` component where the host
wants properties to appear.

```js
aiditor.inspector.registerProvider('app.node', {
  inspect: function (targets, inspectCtx) {
    return {
      schema: {
        name: { type: 'string' },
        visible: { type: 'bool' },
      },
      values: targets.map(function (target) { return nodeStore.get(target.id) }),
      write: function (field, change, ctx) {
        ctx.targets.forEach(function (target, index) {
          nodeStore.patch(target.id, {
            [field]: ctx.valueForChange(change, target, index, ctx),
          })
        })
      },
    }
  },
})

aiditor.inspector.select({ type: 'app.node', id: 'node-1', title: 'Node 1' })
```

The provider API is `registerProvider(type, provider, meta)`. Do not pass a
single object with `id/get/set`; that is not the AIditor Inspector protocol.
If inspected state changes outside the form and no `subscribe(refresh)` hook is
available, call `aiditor.inspector.refresh()`.

For the exact generated API document, search:

```text
aiditor.searchReferences({ query: "aiditor.inspector.registerProvider" })
```

Multi-target Inspector edits show the first selected target as primary. A field
is editable only when every selected target has that field and the provider
allows writing it. There is no mixed-value state.

## AI Authoring Workflow

When an AI agent modifies AIditor code, use the workspace-backed path:

1. Map or search files first.
2. Read the exact range you will edit.
3. For existing files, use exact edits with the current base hash and exact
   `oldText`.
4. For new files, write the component file.
5. Inspect docks with `aiditor.inspectDocks`, then mount by registered
   component name and returned dock id with `aiditor.addPanelToDock`. Include
   the workspace file `path` so the runtime loads the component before mounting.
   If the tool can infer one matching JS file, it may fill `path` itself.
   To replace an existing panel, use `aiditor.replacePanel` with the target
   `panelId`; it keeps dock position and returns a fresh panel id.
6. After editing the file for an already-mounted panel, use
   `aiditor.reloadPanel({ panelId, path })` to rebuild the same panel instance.
7. If the edit is stale or ambiguous, reread and retry with a narrower change.

For AI registry details, read
`doc/skill/aiditor-authoring/references/ai-workflow.md`.

## Extension Workflow

Use an extension when the work is packaged, reviewable, installable, and
uninstallable. The host must load `aiditor-ai` or `aiditor-full` for extension
APIs. Use ordinary component files when the host simply needs project UI.
Extensions contribute to existing registries; they do not create a second
component, tool, or AI model.

For extension details, read
`doc/skill/aiditor-authoring/references/extension-runtime.md`.

## Verification

After changing `src/`, rebuild committed bundles:

```bash
node tools/build.mjs
```

Recommended checks:

```bash
npm.cmd run check
npm.cmd run check:dist
git diff --check
```

If only host demo files changed, rebuild is not required unless the host loads
from `dist`.
