# Zero-dependency test and CI plan

## Principle

Zero dependency does not mean zero verification.

The runtime library can stay zero-dependency while development uses Node built-ins for tests. No bundler, framework, or npm dependency is required.

## Test layers

### 1. Syntax gate

Script:

```bash
node tools/check-syntax.mjs
```

Checks:

- every `src/**/*.js`
- every `demo/**/*.js`
- `dist/aeditor.js`
- `tools/build.mjs`

Implementation can use `node --check`.

### 2. Bundle order and drift gate

Script:

```bash
node tools/check-bundle.mjs
```

Checks:

- every `src/**/*.js` appears in `JS_ORDER`
- every `src/**/*.css` appears in `CSS_ORDER`
- every ordered file exists
- running build would produce the committed `dist/aeditor.js` and `dist/aeditor.css`

This protects the zero-build promise.

### 3. Pure data tests

Script:

```bash
node tests/tree.test.mjs
```

Scope:

- `dock()`, `panel()`, `split()`
- `addPanel`
- transient eviction
- `removePanel`
- `movePanel`
- `splitDock`
- `mergeDocks`
- `setCollapsed`
- `setFocused`
- `findDock`
- `findPanel`
- `findByName`

These can run in Node with a minimal `global.window = { aeditor: {} }` shim or by evaluating IIFE sources in order.

### 4. Reactive core tests

Scope:

- signal read/write
- effect cleanup on rerun
- derived dirty-check
- batch
- untracked

### 5. Runtime lifecycle smoke

Needs a tiny DOM shim or a browser smoke.

Options:

1. Zero external dependency: write a minimal DOM fake for the specific methods runtime uses.
2. Browser manual smoke: keep as manual until a dependency decision is made.
3. Dev-only Playwright: more reliable but violates the current no-dependency preference for development.

Recommendation:

- Start with pure tests and syntax/bundle gates.
- Add a minimal browser smoke later if the user approves dev-only tooling.

### 6. Manual smoke checklist

Keep a document for manual UI validation:

- load `index.html`
- switch all showcase categories
- edit properties and see live update
- split dock by corners
- resize splitters
- merge dock with and without dirty panels
- drag tabs within same dock
- drag tabs across docks
- pop out panel
- switch dark/dracula/light themes
- open/close popover/menu/modal/drawer/toast repeatedly
- test reduced motion visually if possible

## CI target

Minimal CI can run:

```bash
npm run check
npm run build
npm run check:dist
npm pack --dry-run
```

Proposed scripts:

```json
{
  "scripts": {
    "build": "node tools/build.mjs",
    "watch": "node tools/build.mjs --watch",
    "check": "node tools/check-syntax.mjs && node tests/tree.test.mjs && node tests/signal.test.mjs",
    "check:dist": "node tools/check-bundle.mjs"
  }
}
```

No runtime dependency is introduced.

## Acceptance criteria

- `npm run check` passes on a clean clone.
- `npm run build` followed by `npm run check:dist` proves committed dist is current.
- Tests fail if a source file is added but not listed in `tools/build.mjs`.
- Tests fail if transient panel eviction breaks.
- Tests fail if signal cleanup does not run.

## Later optional gate

If approved later, add browser-level smoke:

- use Playwright as a dev dependency only
- run local static server
- open `index.html`
- assert no console errors
- screenshot main demo
- click representative controls

This should be a separate decision because the framework promise is zero runtime dependency, not necessarily zero dev dependency.
