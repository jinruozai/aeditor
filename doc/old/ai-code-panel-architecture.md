# AI Code Panel Architecture

Status: proposed final direction, reviewed

This document replaces the earlier "AI should mainly generate declarative UI
trees" assumption. Declarative UI remains useful as a small static format, but
it is not the primary authoring surface for AI-generated editor panels.

After review, the final direction is stricter:

```txt
AI-created visible UI uses aiditor.createPanel.
aiditor.createPanel accepts one factory function source.
The extension manifest remains an internal implementation detail.
```

AI should not normally call `aiditor.installExtension` for new UI. That tool is
still available for advanced full-extension work, but the stable path for new
panels is `aiditor.createPanel`.

The primary authoring surface should be the same one used by built-in panels:

```txt
Panel = factory(propsSig, ctx) -> HTMLElement
```

The goal is one mental model for everyone:

- framework built-in panels
- app panels
- extension panels
- AI-generated panels

All of them are registered components with a `factory(propsSig, ctx)` function.
AI does not need to learn a private template language. It writes normal
JavaScript panel code and uses the same `aiditor.ui.*`, `ctx`, `aiditor.bus`, and DOM APIs
as built-in panel authors.

## Problem With The Declarative-First Route

The declarative extension runtime is structurally valuable:

- owner-aware install / uninstall
- layer control
- rollback
- dock panel contribution
- permission review
- safe mode
- panel health inspection

But it is the wrong default language for AI-created complex UI.

A model asked to build an inventory, timeline, graph, mini game, canvas view, or
drag-and-drop tool naturally wants loops, conditions, event handlers, local
state, timers, and layout algorithms. If the only available format is a JSON UI
tree, the model tends to invent template syntax:

```txt
{{icon}}
{{empty ? "" : name}}
{{items.map(...)}}
```

`aiditor.ui.renderUITree` does not execute such templates, so the UI can install
successfully while rendering nonsense. This is a contract failure, not a model
failure.

The fix is not to build a larger private DSL. The fix is to make the AI write
the same kind of panel code the framework already understands.

## Final Principle

There is only one best path for generated UI:

```txt
aiditor.createPanel(input)
  -> wraps input as an extension manifest
  -> registers a factory component
  -> places it in a dock
  -> validates panel health
  -> reports execution errors back to the agent
```

The AI-facing API should hide manifest ceremony. The extension runtime still
owns lifecycle internally.

## Design Invariants

These rules keep the design simple and stable.

1. **One authoring model**
   A panel is a `factory(propsSig, ctx) -> HTMLElement`. There is no separate
   "AI panel" model.

2. **One AI entry point for visible UI**
   AI uses `aiditor.createPanel` for a new visible panel. It should not handcraft
   dock panel manifests for normal UI generation.

3. **No template language**
   There is no `{{...}}`, JSX, Vue, React, Handlebars, or mini expression DSL in
   the AI path. Loops and conditions are normal JavaScript.

4. **Dock stays ignorant**
   Dock receives normal registered components. It does not know whether a panel
   is built-in, app-owned, extension-owned, or AI-created.

5. **Extension runtime owns lifecycle**
   Owner, layer, uninstall, update, recovery, rollback, and safe mode stay in
   `aiditor.extensions`.

6. **Preview never runs untrusted code**
   Preview may parse and inspect source text, but does not execute the factory.
   Code execution happens only during apply, after permission approval.

7. **Apply is transactional**
   If registration, dock placement, panel creation, health inspection, or smoke
   validation fails, the operation rolls back and reports failure.

8. **Success means visible runtime success**
   A successful tool result means the panel was installed and rendered without a
   known runtime error. It does not merely mean a manifest was accepted.

## API Shape

AI should primarily use a high-level operation/tool:

```js
aiditor.createPanel({
  id: 'game-inventory',
  title: 'Inventory',
  icon: 'package',
  dock: 'editor',
  layer: 'session',
  props: {},
  source: `
    function (propsSig, ctx) {
      const root = document.createElement('div')
      root.className = 'demo-inventory-panel'

      const title = aiditor.ui.text({ value: 'Inventory', variant: 'h2' })
      root.appendChild(title)

      return root
    }
  `
})
```

Internally, the operation converts this into the existing extension model:

```js
{
  id: 'game-inventory',
  title: 'Inventory',
  layer: 'session',
  contributes: {
    components: [{
      id: 'panel',
      title: 'Inventory',
      icon: 'package',
      kind: 'factory',
      props: {},
      source: 'function (propsSig, ctx) { ... }'
    }],
    dockPanels: [{
      dock: 'editor',
      component: 'panel',
      title: 'Inventory',
      icon: 'package'
    }]
  }
}
```

The public component id remains owner-scoped by the extension runtime:

```txt
game-inventory/panel
```

The dock still receives a normal panel whose `component` field is a registered
component id. Dock does not learn about AI.

## Same Code As Built-In Panels

Built-in panel:

```js
aiditor.registerComponent('inventory-panel', {
  title: 'Inventory',
  icon: 'package',
  defaults: function () {
    return { title: 'Inventory', icon: 'package', props: {} }
  },
  factory: function (propsSig, ctx) {
    const root = document.createElement('div')
    root.textContent = 'Inventory'
    return root
  },
  dispose: function (el) {
    if (aiditor.ui && aiditor.ui.dispose) aiditor.ui.dispose(el)
  },
})
```

AI-generated panel source:

```js
function (propsSig, ctx) {
  const root = document.createElement('div')
  root.textContent = 'Inventory'
  return root
}
```

The source is the same core function. The runtime supplies the registration
wrapper, owner, layer, default dispose, dock placement, and health checks.

## Tool Contract

The AI tool should describe this contract bluntly:

```txt
Use aiditor.createPanel for new UI panels.
Write a JavaScript function expression:

function (propsSig, ctx) {
  const root = document.createElement('div')
  return root
}

Rules:
- Return one HTMLElement.
- Use aiditor.ui.* where useful; prefer framework components over hand-built
  controls when the library already has a suitable component.
- Use aiditor.ui.scrollArea for scrollable content instead of raw native overflow
  scrollbars so the panel matches AIditor styling.
- Use aiditor.ui.tooltip/popover/menu for anchored floating UI. Scoped aiditor.ui overlays
  close automatically when the panel is no longer active. If a panel manually
  appends floating DOM outside its root, register it with
  `aiditor.ui.registerScopedOverlay(anchor, close)`.
- Make the panel root responsive inside a resizable dock: height 100%,
  minHeight 0, boxSizing border-box, no viewport-sized or fixed-width layout.
- Use flex/grid with minmax(), auto-fit, and container-relative sizing for card
  grids.
- Use normal JavaScript for loops, conditions, state, events, canvas, and animation.
- Do not use template syntax such as {{value}}.
- Do not call aiditor.registerComponent; the runtime registers the component.
- Do not mutate unrelated editor state except through approved tools or ctx APIs.
- Clean timers/listeners with aiditor.ui.collect(root, cleanup) or ctx.onCleanup when available.
```

The schema should require `id`, `title`, `dock`, and `source`:

```js
{
  type: 'object',
  required: ['id', 'title', 'dock', 'source'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    icon: { type: 'string' },
    dock: { type: 'string' },
    layer: { type: 'string', enum: ['session', 'user', 'project'] },
    props: { type: 'object' },
    source: {
      type: 'string',
      description: 'JavaScript function expression: function (propsSig, ctx) { return HTMLElement }'
    }
  }
}
```

Reusing the same `id` always replaces the previous generated panel. There is no
separate replace option in the AI contract; repair cycles stay clean by calling
`aiditor.createPanel` again with the same stable id.

## Operation Semantics

`aiditor.createPanel` is both an operation and a tool.

Preview output:

```js
{
  ok: true,
  risk: 'code',
  title: 'Create code panel: Inventory',
  input: { ... },
  extensionId: 'game-inventory',
  component: 'game-inventory/panel',
  dock: 'editor',
  permissions: ['extensions.layer.session.write', 'extensions.code.install'],
  canApply: true
}
```

Apply output:

```js
{
  applied: true,
  ok: true,
  extensionId: 'game-inventory',
  component: 'game-inventory/panel',
  panelId: 'panel-10',
  dock: 'editor',
  replaced: true,
  health: { ok: true, error: null }
}
```

Failure output:

```js
{
  applied: false,
  ok: false,
  phase: 'smoke',
  error: 'Rendered panel contains unresolved template text: {{icon}}',
  extensionId: 'game-inventory',
  component: 'game-inventory/panel',
  rolledBack: true
}
```

The model can repair by calling `aiditor.createPanel` again with the same id.

## Permissions

Code panels are powerful. They must stay behind the existing code permission.

Recommended policy:

- `permissionMode: full` may auto-apply session code panels if the operation
  risk is not destructive or external.
- `auto` should preview and ask.
- `default` should preview and ask.
- `custom` follows explicit operation/tool permission rules.
- Project/user layer promotion should always be reviewable.

Internally, `aiditor.createPanel` sets:

```js
allowCode: true
```

and routes through the same permission checks as `aiditor.installExtension`.

Security posture:

- Same-page factory panels are trusted code. They can access the page global
  environment because they run in the editor page.
- This is acceptable only because code installation is explicitly permissioned.
- `session` is the default layer because it is easiest to discard.
- Promotion to `project` or `user` is a separate deliberate operation.
- Safe mode must be able to disable generated layers.

This design is not a sandbox. It is a trusted extension model with clear
ownership, permission gates, rollback, and recovery.

## Validation

Validation should be stricter than "manifest installed".

Create panel preview should check:

1. `source` parses as a function expression.
2. The function has arity compatible with `(propsSig, ctx)`.
3. The requested dock exists.
4. The component id does not conflict outside the extension owner.
5. The source does not call registration or extension lifecycle APIs directly:
   - `aiditor.registerComponent`
   - `aiditor.unregisterComponent`
   - `aiditor.extensions.install`
   - `aiditor.extensions.uninstall`
   - `aiditor.installExtension`
6. The source does not contain common unsupported declarative mistakes:
   - `{{`
   - `v-for`
   - `ng-repeat`
   - JSX tags such as `<div>` unless source is explicitly compiled, which it is not.
7. The source is not empty and is below a configurable size limit.

Apply should check:

1. Extension installed transactionally.
2. Dock panel was added.
3. The panel runtime could create an HTMLElement.
4. `layout.inspectPanels()` does not report a creation error for the new panel.
5. The rendered DOM does not contain obvious unresolved template text such as
   `{{...}}`.

If any check fails, rollback and return a structured failure. Do not leave a
broken panel installed while reporting success.

Important detail: source validation is a quality gate, not a security sandbox.
It catches common AI mistakes and accidental lifecycle misuse. Permission gates
and safe mode are the real security boundary for same-page code.

## Runtime Execution

Current extension runtime already supports `kind: 'factory'`:

```js
const maker = Function('aiditor', '"use strict"; return (' + source + ')')(aiditor)
return maker(propsSig, ctx || {})
```

This is enough for same-page trusted code panels. The important change is not a
new execution engine. The important change is the AI-facing operation and its
validation/feedback.

Future sandboxing can be added later through `kind: 'iframe'`, but iframe should
not be the primary authoring model because it makes using `aiditor.ui.*` and `ctx`
less direct.

Factory source constraints:

- Source must evaluate to a function.
- The function is called as `maker(propsSig, ctx)`.
- The return value must be an `HTMLElement`.
- Async factories are not supported in the primary path. If async data is
  needed, return a root element immediately, render a loading state, then update
  it later.
- The factory should not call `aiditor.registerComponent`; the runtime has already
  registered the wrapper component.

Async factories are intentionally excluded because they add lifecycle ambiguity:
the dock expects a content element now, disposal can happen before a promise
settles, and health checks become delayed. A synchronous root with internal async
work is simpler and more robust.

## Cleanup Contract

AI-generated panels should rely on the same cleanup rules as built-ins:

```js
function (propsSig, ctx) {
  const root = document.createElement('div')
  const timer = setInterval(function () {}, 1000)
  if (aiditor.ui && aiditor.ui.collect) aiditor.ui.collect(root, function () { clearInterval(timer) })
  return root
}
```

The extension wrapper should provide default disposal:

```js
dispose: function (el) {
  if (aiditor.ui && aiditor.ui.dispose) aiditor.ui.dispose(el)
}
```

Generated docs and prompt examples should teach `aiditor.ui.collect(root, cleanup)`
for timers, animation frames, DOM listeners not attached through owned elements,
and external resources.

Recommended generated pattern:

```js
function (propsSig, ctx) {
  const root = document.createElement('div')
  let frame = 0

  function tick() {
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  if (aiditor.ui && aiditor.ui.collect) {
    aiditor.ui.collect(root, function () {
      cancelAnimationFrame(frame)
    })
  }

  return root
}
```

The runtime default dispose calls `aiditor.ui.dispose(root)`, so collected cleanups
run exactly like built-in components.

## Feedback Loop

The agent must see whether the panel really worked.

`aiditor.createPanel` result should include:

```js
{
  applied: true,
  extensionId: 'game-inventory',
  component: 'game-inventory/panel',
  panelId: 'panel-10',
  dock: 'editor',
  health: {
    ok: true,
    error: null
  }
}
```

Failure should be equally explicit:

```js
{
  applied: false,
  ok: false,
  phase: 'render',
  error: 'Panel factory did not return an HTMLElement',
  extensionId: 'game-inventory',
  rolledBack: true
}
```

This prevents the bad pattern where a tool says `APPLIED` and the model claims
success while the UI is visually broken.

The result should also include enough repair context:

```js
{
  phase: 'render',
  error: 'ReferenceError: item is not defined',
  sourceLine: 12,
  hint: 'Use normal JavaScript loops inside the factory; no template variables are injected.'
}
```

Line extraction is best-effort. Even without exact line numbers, `phase` and
`hint` are enough for the model to repair the source.

## Relationship To Declarative UI

Declarative UI is not removed. It becomes a secondary capability:

- good for simple static panels
- good for hand-authored schema-driven UI
- good for future visual editors
- not the default AI generation path

AI should prefer `aiditor.createPanel` over `aiditor.installExtension` for new UI.
`aiditor.installExtension` remains the low-level escape hatch for full extension
manifests, commands, references, settings, and operations.

The host reference should say this explicitly. The AI should not need to infer
which route to use.

## Minimal Implementation Surface

Most code should stay in the existing extension module.

Primary file:

```txt
src/core/extensions.js
```

Likely additions:

- `createPanelPreview(input, ctx)`
- `applyCreatePanel(preview, ctx)`
- `makePanelManifest(input)`
- `validateFactorySource(source)`
- `detectUnresolvedTemplateText(rootEl)`
- `createPanelToolDescription`
- AI tool registration: `aiditor.createPanel`
- AI operation registration: `aiditor.createPanel`

Small demo update:

```txt
demo/ai-targets.js
```

Change host capability guidance from "write a declarative manifest" to "use
aiditor.createPanel for new UI panels".

Tests:

```txt
tests/extension-runtime.test.mjs
```

Add coverage for:

- create code panel
- panel source matches built-in factory shape
- auto dock placement
- invalid source rejected
- direct `aiditor.registerComponent` in source rejected
- unresolved template text rejected
- failed render rolls back
- repeated same id replaces instead of duplicating
- uninstall removes generated panel and component

Bundle:

```txt
dist/aiditor.js
```

Rebuild after source changes.

No dock/tree/runtime rewrite is required. Dock still receives normal panels.

## AI Prompt Examples

Good:

```js
function (propsSig, ctx) {
  const root = document.createElement('div')
  root.style.padding = '12px'

  const items = [
    { name: 'Sword', icon: 'sword', count: 1 },
    { name: 'Potion', icon: 'flask', count: 3 }
  ]

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(6, 64px)'
  grid.style.gap = '8px'

  for (let i = 0; i < 24; i++) {
    const item = items[i]
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.textContent = item ? item.icon + ' ' + item.name : ''
    grid.appendChild(cell)
  }

  root.appendChild(grid)
  return root
}
```

Bad:

```js
{
  component: 'text',
  props: { value: '{{item.name}}' }
}
```

Reason: there is no template engine.

Good repair flow:

```txt
Tool failed:
phase: smoke
error: Rendered panel contains unresolved template text: {{icon}}

Repair:
Call aiditor.createPanel again with the same id.
Replace template strings with normal JavaScript loops and textContent.
```

## Why This Is The Best Fit

This design keeps aiditor simple:

```txt
Component registry remains the UI registry.
Dock remains a panel container.
Extension runtime remains lifecycle ownership.
AI writes the same factory function as human authors.
```

It is also the strongest option:

- It can build simple panels.
- It can build complex editor tools.
- It can build visual experiments and mini games.
- It can use existing `aiditor.ui.*`.
- It can use normal JavaScript instead of a private DSL.
- It keeps generated code uninstallable and permission-gated.

The architecture does not need more layers. It needs one clear authoring model.

## Reviewed Assessment

Simplicity:

- One mental model: `factory(propsSig, ctx)`.
- One AI UI tool: `aiditor.createPanel`.
- Existing extension runtime remains the lifecycle shell.

Power:

- Normal JavaScript can express loops, conditions, events, canvas, animation,
  local state, drag/drop, and data transforms.
- Existing `aiditor.ui.*` components remain available.
- Built-in and generated panels share code style.

Stability:

- Preview validates without executing code.
- Apply is transactional.
- Health/smoke checks determine success.
- Repeated repair uses the same id and replaces the prior attempt.

Safety:

- Code panels are permission-gated.
- Same-page execution is treated as trusted extension code, not sandboxed code.
- Safe mode/layer filtering remains the recovery path.
- Project/user persistence requires explicit promotion.

This is simpler and stronger than expanding the declarative DSL. A richer DSL
would still be less expressive than JavaScript and harder for models to learn.
The best fit is to let AI write the same component factory humans write, then
make the runtime strict about installation, cleanup, rollback, and feedback.
