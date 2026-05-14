# aeditor

A zero-dependency, zero-build frontend framework for building Blender-style web
editors with optional AI and extension runtime layers.

[![npm](https://img.shields.io/npm/v/@gooooo/aeditor.svg)](https://www.npmjs.com/package/@gooooo/aeditor)
[![license](https://img.shields.io/npm/l/@gooooo/aeditor.svg)](./LICENSE)

aeditor keeps the editor core small: docks, panels, registered components,
theme tokens, UI widgets, settings, commands, workspace contracts, and a compact
reactive runtime. AI Host and Extension Runtime are optional layers on top of
that core, not hidden requirements.

```text
Core/UI/Dock                  small editor framework
Optional AI Host              agents, tools, context, operations, ChangeSet
Optional Extension Runtime    package/review/install/disable contributions
Host App                      project model, domain data, privileged bridges
```

## Why

Most editors need the same stable primitives:

- split and mergeable dock layout
- tabbed panels with preserved state
- reusable UI controls and property editors
- settings, commands, logs, themes, and workspace access
- optional AI that can read editor context and apply reviewed changes

aeditor gives those primitives one model:

```text
Layout
`-- Dock
    |-- Toolbar
    |   `-- Component
    `-- Panel
        `-- Component
```

`Component` is the only UI registration unit. Panels and toolbar items are plain
data records that reference registered components by name. Inactive panels are
detached from the DOM, not hidden with CSS, so heavy editors keep their state
without paying layout and paint cost in the background.

## Bundles

Use Core when you want only the editor framework:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aeditor@1/dist/aeditor-core.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aeditor@1/dist/aeditor-core.js"></script>
```

Use Full when you also want AI Host and Extension Runtime:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/aeditor@1/dist/aeditor-full.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/aeditor@1/dist/aeditor-full.js"></script>
```

Classic `dist/aeditor.js` and `dist/aeditor.css` are Core aliases. Published npm
packages contain only runtime dist files, this README, and the license.

```bash
npm install @gooooo/aeditor
```

Everything is exposed through `window.aeditor`.

## Quick Start

```html
<div id="app" style="height:100vh"></div>
<link rel="stylesheet" href="./dist/aeditor-core.css">
<script src="./dist/aeditor-core.js"></script>
<script>
aeditor.registerComponent('demo.editor', {
  category: 'panel',
  defaults: function () {
    return { title: 'Editor', icon: 'file-text', props: { file: 'main.js' } }
  },
  factory: function (propsSig, ctx) {
    var root = document.createElement('div')
    root.style.cssText = 'height:100%;min-height:0;box-sizing:border-box;padding:12px'

    var title = document.createElement('strong')
    var body = document.createElement('pre')
    body.style.marginTop = '12px'
    root.append(title, body)

    ctx.onCleanup(aeditor.effect(function () {
      var props = propsSig() || {}
      title.textContent = props.file || 'untitled'
      body.textContent = 'Build your editor panel here.'
    }))

    return root
  },
})

var tree = aeditor.split('horizontal', [
  aeditor.dock({
    name: 'main',
    toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
    panels: [
      aeditor.panel({ component: 'demo.editor', title: 'main.js', props: { file: 'main.js' } }),
      aeditor.panel({ component: 'demo.editor', title: 'style.css', props: { file: 'style.css' } }),
    ],
  }),
  aeditor.dock({
    name: 'side',
    toolbar: { direction: 'top', items: [{ component: 'tab-compact' }] },
    panels: [
      aeditor.panel({ component: 'log', title: 'Log', icon: 'list' }),
    ],
  }),
], [0.7, 0.3])

var layout = aeditor.createDockLayout(document.getElementById('app'), {
  tree: tree,
  dockMenu: true,
  lru: { max: -1 },
})
</script>
```

`dockMenu: true` enables the optional built-in dock command menu. Omit it when
your host wants to provide its own menu surface.

## Core Concepts

### Component

```js
aeditor.registerComponent('example.panel', {
  category: 'panel',
  defaults: function () {
    return { title: 'Example', icon: 'box', props: {} }
  },
  factory: function (propsSig, ctx) {
    var el = document.createElement('div')
    return el
  },
  dispose: function (el) {},
  serialize: function (el) { return {} },
  deserialize: function (el, state) {},
})
```

Rules:

- Use plain JavaScript IIFEs or scripts. No modules, imports, JSX, TSX, or build
  step are required.
- Props should be JSON-serializable plain objects.
- Use `propsSig.peek()` for one-shot reads and `propsSig()` inside
  `aeditor.effect(...)` for reactive reads.
- Use `ctx.onCleanup(...)` for effects, subscriptions, timers, and overlays.
- Panel roots should fit resizable docks: `height:100%`, `min-height:0`, and
  responsive flex/grid layout.

### Context

Every component factory receives `ctx`:

```js
ctx.panel.title()
ctx.panel.setTitle('New Title')
ctx.panel.setDirty(true)
ctx.panel.updateProps({ file: 'next.js' })
ctx.panel.close()
ctx.panel.popOut()
ctx.panel.promote()

ctx.dock.panels()
ctx.dock.activeId()
ctx.dock.addPanel({ component: 'example.panel', title: 'New' })
ctx.dock.activatePanel(panelId)
ctx.dock.toggleFocus()

ctx.bus.emit('topic', payload)
ctx.bus.on('topic', function (payload) {})

ctx.active
ctx.onCleanup(function () {})
```

Static toolbar components have `ctx.dock` but no `ctx.panel`.

### Layout API

`createDockLayout` returns the runtime handle:

```js
layout.addPanel(dockIdOrName, partialPanel, opts)
layout.removePanel(panelId)
layout.activatePanel(panelId)
layout.promotePanel(panelId)
layout.movePanel(panelId, targetDockIdOrName, targetIndex)
layout.splitDock(dockIdOrName, 'horizontal', 'after', 0.5)
layout.mergeDocks(winnerDockIdOrName, loserDockIdOrName)
layout.tree()
layout.setTree(nextTree)
layout.subscribe(function (tree) {})
layout.destroy()
```

The immutable tree helpers are also public:

```js
aeditor.addPanel(tree, dockId, partial, opts)
aeditor.removePanel(tree, panelId)
aeditor.activatePanel(tree, panelId)
aeditor.movePanel(tree, panelId, targetDockId, targetIndex)
aeditor.movePanelToSplit(tree, panelId, targetDockId, direction, side, ratio)
aeditor.splitDock(tree, dockId, direction, side, ratio, opts)
aeditor.mergeDocks(tree, winnerDockId, loserDockId)
```

### UI Library

`aeditor.ui.*` provides signal-first controls:

```js
var name = aeditor.signal('world')
var input = aeditor.ui.input({ value: name, placeholder: 'Name' })
var button = aeditor.ui.button({
  text: 'Greet',
  onClick: function () { alert('Hello ' + name()) },
})
```

Groups include base controls, form inputs, editor inputs, containers, virtualized
data views, overlays, schema-driven property editors, settings, log, tabs, and
AI-specific panels in the full bundle.

### Theme

Built-in themes:

```js
aeditor.theme.set('dark')
aeditor.theme.set('dracula')
aeditor.theme.set('light')
```

Custom themes should start with semantic authoring tokens such as
`--aeditor-surface-*`, `--aeditor-text-*`, `--aeditor-stroke-*`,
`--aeditor-brand`, and `--aeditor-state-*`.

## Optional AI Host

The AI Host is a framework layer for editor-aware agents. It has five public
concepts:

```text
Agent
Tool
Context Reference
Operation
ChangeSet
```

Register model-callable tools:

```js
aeditor.ai.tools.register('workspace.summarizeOpenFile', {
  title: 'Summarize Open File',
  description: 'Read the active file summary.',
  schema: { type: 'object', properties: {} },
  permissions: ['tool.call'],
  run: function (input, ctx) {
    return { text: 'summary' }
  },
})
```

Register context providers or operations when the editor needs to expose current
selection, bounded reads, previews, or reviewed mutations. All writes should go
through permission and preview/apply paths.

The full bundle includes the built-in `aeditor.authoring` skill, which teaches
agents to create file-backed AEditor components instead of inventing ad hoc
panel code. The copyable skill document lives at
[`doc/skill/aeditor-authoring/SKILL.md`](./doc/skill/aeditor-authoring/SKILL.md).

## Optional Extension Runtime

Extensions package contributions into existing registries:

```text
components
dock panels
tools
context providers
reference providers
operations
settings
commands
menus
```

An extension does not create a second component or AI model. It normalizes a
manifest, reviews trust and conflicts, installs contributions with
`owner: "extension:<id>"`, and removes that owner on disable or uninstall.

## AI Authoring Workflow

For durable AI-generated UI:

1. Open or select a workspace.
2. Let the agent inspect current files and docs.
3. Edit or create plain `.js` component files.
4. Register the component by name.
5. Mount the registered component into a dock.
6. Review and apply file changes through workspace tools.

Do not pass panel source code through dock or extension arguments. Source files
are the durable artifact; dock data only references registered component names.

## Local Development

```bash
git clone https://gitee.com/lazygoo/aeditor.git
cd aeditor
node tools/build.mjs --watch
npx http-server -p 5570
```

Open `http://localhost:5570`.

Changes under `src/` must be rebuilt:

```bash
node tools/build.mjs
npm run check
npm run check:dist
```

`dist/aeditor-core.*`, `dist/aeditor-full.*`, and the `dist/aeditor.*` core
aliases are generated artifacts that stay in the repository for zero-build use.

## Documentation

- [Design index](./doc/README.md)
- [Architecture](./doc/architecture.md)
- [Core](./doc/core.md)
- [UI and dock runtime](./doc/ui.md)
- [AI Host](./doc/ai.md)
- [Extension Runtime](./doc/extensions.md)
- [AEditor authoring skill](./doc/skill/aeditor-authoring/SKILL.md)

## License

[MIT](./LICENSE) (c) gooooo
