# aeditor optimization plans

This directory tracks the route from the current working framework to the target state:

- simple and elegant API
- detached-DOM performance as a hard invariant
- stable lifecycle cleanup
- decoupled panel communication
- zero-dependency delivery with enough verification to trust changes

## Current plan set

| Plan | Purpose | Status |
| --- | --- | --- |
| [2026-05-perfect-state/00-overview.md](./2026-05-perfect-state/00-overview.md) | Overall assessment, target state, scoring model, execution order | Draft |
| [2026-05-perfect-state/01-lifecycle-runtime.md](./2026-05-perfect-state/01-lifecycle-runtime.md) | Dock/runtime/component cleanup, layout destroy, runtime GC | Draft |
| [2026-05-perfect-state/02-ui-cleanup-contract.md](./2026-05-perfect-state/02-ui-cleanup-contract.md) | aeditor.ui cleanup rules, compound components, virtualization, overlays | Draft |
| [2026-05-perfect-state/03-bus-and-context.md](./2026-05-perfect-state/03-bus-and-context.md) | Scoped bus, component context lifetime, error attribution | Draft |
| [2026-05-perfect-state/04-migration-drag-interactions.md](./2026-05-perfect-state/04-migration-drag-interactions.md) | Pop-out protocol, file:// behavior, drag session cancellation | Draft |
| [2026-05-perfect-state/05-test-and-ci.md](./2026-05-perfect-state/05-test-and-ci.md) | Zero-dependency test strategy and CI gates | Draft |
| [2026-05-perfect-state/06-docs-package-boundaries.md](./2026-05-perfect-state/06-docs-package-boundaries.md) | Design authority, README/package boundary, temp/GameDataEditor boundary | Draft |
| [2026-05-perfect-state/07-parallel-execution.md](./2026-05-perfect-state/07-parallel-execution.md) | Multi-agent work split, ownership boundaries, dependency order | Draft |
| [2026-05-ai-gde-final/00-overview.md](./2026-05-ai-gde-final/00-overview.md) | Final AI + GameDataEditor integration route | Active |

## Planning rules

- `temp/GameDataEditor` is treated as an independent project that happens to live in this repository for Codex convenience. It can be used as an integration reference, but framework fixes must not couple `src/` to it.
- `tools/build.mjs` remains the source of truth for source bundle order.
- Changes to `src/` require rebuilding `dist/aeditor.js` and `dist/aeditor.css`.
- Plans here do not override `AGENTS.md` yet. One of the planned work items is to cleanly re-establish the design authority chain.
