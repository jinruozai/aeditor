# Parallel execution plan

## Coordination model

Multiple agents can work in parallel if write scopes are disjoint.

Rules:

- Workers are not alone in the codebase.
- Workers must not revert edits made by others.
- Each worker owns specific files or modules.
- Shared files require sequencing, not parallel edits.
- Any `src/` change must be followed by `node tools/build.mjs`.
- `temp/GameDataEditor` is not part of framework implementation work unless a task explicitly says integration verification.

## Phase 1: design authority and tests scaffold

Can run partly in parallel.

Worker A: docs authority

- Owns `AGENTS.md`, `README.md`, possibly `CLAUDE.md`
- Updates stale `aiditor.errors/error-log/errors.js` references
- Documents `aiditor.log`
- Clarifies temp boundary

Worker B: test scaffold

- Owns `tools/check-syntax.mjs`
- Owns `tools/check-bundle.mjs`
- Owns `tests/signal.test.mjs`
- Owns `tests/tree.test.mjs`
- Owns `package.json` scripts

Conflict file:

- `package.json` may also be touched by package-boundary work, so sequence package edits after test script edits or assign one owner.

## Phase 2: runtime lifecycle

Worker C: layout destroy

- Owns `src/dock/layout.js`
- Possibly owns new `src/dock/lifecycle.js`
- Stores reconcile disposer
- Adds `handle.destroy()`
- Wires migration receiver cleanup

Worker D: runtime disposal and panel GC

- Owns `src/dock/runtime.js`
- Owns relevant hooks in `src/dock/render.js`
- Adds default `aiditor.ui.dispose` fallback
- Adds GC for removed panels in surviving docks

Shared dependency:

- Context derived cleanup from Phase 3 may touch runtime cleanup ordering. Coordinate before final merge.

## Phase 3: context and bus

Worker E: context scope

- Owns `src/core/context.js`
- Adds scoped derived helper
- Ensures ctx-created derived signals are disposed with runtime

Worker F: scoped bus

- Owns `src/core/bus.js`
- Owns `src/core/context.js` only if wrapper belongs there
- Adds subscriber source attribution for `ctx.bus.on`
- Adds tests

Potential conflict:

- Both may touch `context.js`; either sequence them or have one worker own the file and the other provide patch guidance.

## Phase 4: UI cleanup

This phase can split by category.

Worker G: internal helpers

- `src/ui/_internal/_box-style.js`
- `src/ui/_internal/_text-style.js`
- `src/ui/_internal/_render-tree.js`

Worker H: forms and schema editors

- `src/ui/form/editorFor.js`
- `src/ui/form/propertyForm.js`
- `src/ui/form/structInput.js`
- `src/ui/form/arrayInput.js`
- `src/ui/_internal/_register-builtins.js`

Worker I: virtualized data components

- `src/ui/data/list.js`
- `src/ui/data/tree.js`
- `src/ui/data/table.js`
- `src/ui/data/tree-dnd.js` if needed

Worker J: overlays and composite editor widgets

- `src/ui/base/popover.js`
- `src/ui/overlay/modal.js`
- `src/ui/overlay/drawer.js`
- `src/ui/overlay/menu.js`
- `src/ui/editor/assetPicker.js`
- `src/ui/editor/gradientInput.js`

After all UI workers:

- rebuild dist
- run tests
- manually smoke overlay and virtualized components

## Phase 5: migration and drag

Worker K: migration

- Owns `src/dock/migrate.js`
- Fixes `file://` target origin
- Preserves full portable PanelData
- Restricts receiver to popup mode
- Adds cleanup hook for layout destroy

Worker L: drag cancellation

- Owns `src/dock/interactions.js`
- Owns `src/dock/panel-drag.js`
- Adds pointercancel, lost capture, blur, and shared cleanup shape

## Phase 6: accessibility and tokens

Worker M: accessibility

- `src/ui/form/select.js`
- `src/ui/data/list.js`
- `src/ui/data/table.js`
- `src/ui/data/tree.js`

Worker N: tokens

- `src/style/theme.css`
- `src/style/ui-base.css`
- `src/style/ui-form.css`
- `src/style/ui-data.css`
- `src/style/dock.css`

## Final verification

Required before declaring perfect-state milestone done:

- `npm run check`
- `npm run build`
- bundle drift check passes
- demo loads without console errors
- manual smoke checklist completed
- GameDataEditor still loads against synced framework dist/vendor, or documented as intentionally not synced
- AGENTS/README/package all agree on public API names

## Suggested first implementation batch

Start with:

1. `LayoutHandle.destroy()`
2. default `aiditor.ui.dispose` fallback in component runtime disposal
3. panel runtime GC after tree commits
4. context derived cleanup
5. syntax + bundle tests

These five items address the largest reliability gap and give later workers a safer base.
