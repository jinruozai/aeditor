---
name: aeditor-authoring
description: Use when an AI agent needs to build, modify, review, or mount AEditor editor UI: registered components, dock layouts, panels, toolbar items, aeditor.ui controls, AI tools/context/operations, extension manifests, or workspace-backed editor code. Use for zero-build plain JavaScript AEditor projects and to avoid React, TSX, JSX, import/export, or bundled-module patterns.
---

# AEditor Authoring

Use AEditor as a zero-dependency, zero-build editor framework. Build durable
editor UI as plain JavaScript files that register AEditor components, then mount
those registered component names into dock panels.

## Current Runtime Shape

Load only the layer the host needs:

```text
aeditor-kernel    core services + component registry + tree + dock runtime
aeditor-ui        aeditor.ui.* widgets, settings UI, tab/log panels
aeditor-ai        AI Host + Extension Runtime add-on
aeditor-core      classic Kernel + UI bundle
aeditor-full      Kernel + UI + AI Host + Extension Runtime
```

If a host loaded only `aeditor-kernel`, do not assume `aeditor.ui.*`,
`tab-standard`, `log`, AI tools, or extension APIs exist. Check the loaded
surface before using optional layers.

## First Steps

1. Inspect the host workspace before writing code. Find how it loads scripts,
   registers components, creates the layout, and stores demo or project state.
2. Use one component registration path for each file. Standalone code uses
   `aeditor.registerComponent(name, spec)`. If the host provides a wrapper, use
   that wrapper instead.
3. Prefer editing or adding real source files. Do not pass source code inside
   dock, panel, or extension tool arguments.
4. Keep changes small and framework-shaped: Component for UI, Dock for layout,
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
  or `propsSig()` inside `aeditor.effect`.
- Clean up with `ctx.onCleanup(fn)`. If you create nested AEditor UI elements,
  call `aeditor.ui.dispose(root)` from cleanup when the subtree needs disposal.
- Panel roots must survive resizable docks: set `height: 100%`, `minHeight: 0`,
  `boxSizing: border-box`, and use flex or grid layouts that adapt.
- Prefer `aeditor.ui.*` controls over raw controls when the UI layer is loaded
  and one exists. Use `aeditor.ui.view` for primary scroll surfaces.
- Toolbar tab components are normal toolbar components. Static toolbar items
  have `ctx.dock` but no `ctx.panel`.
- Use `dockMenu: true` only when the host wants AEditor default dock menu
  contributions. Menus and commands are opt-in host choices.
- In the AEditor demo project runtime, component entry files use
  `Demo.project.component(componentId, spec)`. Do not hand-write layout JSON or
  guess dock names. Use `aeditor.inspectDocks`, choose a returned `dockId`, then
  call `aeditor.addPanelToDock` with the registered `component`.

## Component Pattern

```js
;(function (aeditor) {
  'use strict'

  aeditor.registerComponent('demo.notes', {
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
      const ui = aeditor.ui
      const root = ui.h('div', 'demo-notes')
      const initial = (propsSig.peek() || {}).text || ''
      const text = aeditor.signal(initial)

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

For more patterns, read
`doc/skill/aeditor-authoring/references/component-patterns.md`.

## AI Authoring Workflow

When an AI agent modifies AEditor code, use the workspace-backed path:

1. Map or search files first.
2. Read the exact range you will edit.
3. For existing files, use exact edits with the current base hash and exact
   `oldText`.
4. For new files, write the component file, then make sure the host loads it.
5. Inspect docks with `aeditor.inspectDocks`, then mount by registered
   component name and returned dock id with `aeditor.addPanelToDock`.
6. If the edit is stale or ambiguous, reread and retry with a narrower change.

For AI registry details, read
`doc/skill/aeditor-authoring/references/ai-workflow.md`.

## Extension Workflow

Use an extension when the work is packaged, reviewable, installable, and
uninstallable. The host must load `aeditor-ai` or `aeditor-full` for extension
APIs. Use ordinary component files when the host simply needs project UI.
Extensions contribute to existing registries; they do not create a second
component, tool, or AI model.

For extension details, read
`doc/skill/aeditor-authoring/references/extension-runtime.md`.

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
