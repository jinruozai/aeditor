# Runtime lifecycle hardening

## Problem

The framework has a strong runtime model, but not every lifecycle path is closed.

Known gaps:

- `createDockLayout()` creates the reconcile effect but does not expose `destroy()`.
- `disposeComponentRuntime()` runs `runtime.cleanups`, optional `spec.dispose`, then directly removes `contentEl`.
- aeditor.ui cleanup lives on `el.__aeditorCleanups` and requires `aeditor.ui.dispose(el)`.
- Context-created `derived()` signals have disposers but are not registered into the runtime cleanup scope.
- Transient panel eviction removes `PanelData` from the tree without disposing any already-created panel runtime.
- Reconcile only GCs disappeared docks, not disappeared panels inside surviving docks.

## Target design

### LayoutHandle.destroy()

Add a public layout-level cleanup API:

```js
layout.destroy()
```

Required semantics:

- idempotent
- stops the reconcile effect
- disposes all dock runtimes
- disposes all panel runtimes and toolbar runtimes
- removes popup/migration message listeners owned by the layout
- cancels active drag sessions owned by the layout if any
- clears the container content
- removes `aeditor-root` from the container if no longer used
- prevents later handle mutations from mutating disposed runtime state

The API is framework-level lifecycle, not an app shortcut, so it belongs in `src/`.

### Runtime disposal path

Every component runtime disposal should run:

1. runtime-owned cleanups
2. component spec `dispose(el)` if supplied
3. default UI cleanup fallback when available
4. DOM removal
5. active signal false
6. context-scope cleanup

The fallback should be carefully defined:

- If `spec.dispose` exists, call it and trust it.
- If no `spec.dispose` exists and `aeditor.ui.dispose` exists, call `aeditor.ui.dispose(contentEl)`.
- If neither applies, remove the node.

This makes built-in and user components safer without forcing every user panel to remember `ctx.onCleanup(() => aeditor.ui.dispose(root))`.

### Context scope disposal

`makeContext()` should register every derived signal it creates into the component runtime cleanup scope.

Candidate approach:

- add helper `scopedDerived(runtime, fn)`
- it calls `aeditor.derived(fn)`
- it pushes `derived.dispose` into `runtime.cleanups`
- all `ctx.dock.*` and `ctx.panel.*` derived signals are created through it

This keeps `signal.js` simple and avoids introducing reverse dependencies.

### Panel runtime GC after tree commits

After `treeSig.set()` and reconcile, every surviving dock runtime should compare:

- panel runtime ids it owns
- current `dockData.panels[].id`

Any runtime not present in current dock data must be disposed.

This fixes:

- transient preview slot eviction
- direct `setTree()` removing panels
- merge discard paths when a dock survives but its panel list changes

Dock disappearance is already handled by dock runtime GC.

## Files likely affected

- `src/dock/layout.js`
- `src/dock/runtime.js`
- `src/dock/render.js`
- `src/core/context.js`
- `tools/build.mjs`
- `dist/aeditor.js`

If a new file is created, candidate name:

- `src/dock/lifecycle.js`
- or keep changes inside existing `layout.js/runtime.js` to avoid file churn

Given the project rule "one independent feature per file", `lifecycle.js` is justified only if layout destroy and runtime GC become large enough to obscure existing files.

## Acceptance criteria

- Repeated `createDockLayout(container, config); layout.destroy();` cycles leave the container empty and no active component effects.
- Destroying a layout containing `tab-standard`, `log`, `propertyPanel`, virtual lists, overlays, and dynamic toolbar items runs all registered UI cleanups.
- Adding a transient panel over an existing transient panel disposes the old panel runtime if it was materialized.
- Direct `layout.setTree(newTreeWithoutPanel)` disposes removed panel runtimes in surviving docks.
- LRU eviction, close, merge discard, transient eviction, and layout destroy all share the same component disposal path.

## Test hooks

Add a test-only or debug-friendly way to inspect:

- current dock runtime count
- current panel runtime count
- current overlay stack depth
- current log count

This can be private (`handle._runtime`) for tests, not public API.

## Risks

- Calling `aeditor.ui.dispose(contentEl)` by default could surprise user components that already remove children in custom `dispose`.
- To avoid double cleanup, only call fallback when no `spec.dispose` exists.
- `ui.dispose()` currently removes the element; after it runs, do not call `contentEl.remove()` again unless checking parent first.
