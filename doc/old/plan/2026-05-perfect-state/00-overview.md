# Perfect-state roadmap overview

## Product thesis

aiditor is a zero-dependency editor UI framework built around one compositional idea:

```text
registered component -> panel / toolbar item -> dock -> editor layout
```

The developer should not build an editor by wiring direct object references between panes. They should build small panels and toolbar components, register them, place them in docks, and communicate through explicit signals, panel props, and `aiditor.bus` topics.

The dock system is therefore not decorative layout code. It is the application shell:

- empty dock
- pure toolbar dock
- toolbar + content dock
- single-panel dock
- multi-panel dock
- collapsible side/bottom dock
- top/bottom/left/right toolbar direction
- Blender-like split, merge, resize, panel drag, and pop-out behavior

The target state is a framework that makes editor development feel modular and calm while remaining strict internally.

## Current assessment

The architecture is strong. The core model is coherent:

- immutable N-ary split tree
- dock-id keyed reconciliation
- detached DOM for inactive panels
- registered component contract
- signal-first UI library
- static and dynamic toolbar items
- bus-based panel communication
- dist bundle committed for double-click usage

The main gap is not vision. It is hardening.

Current high-risk areas:

1. Lifecycle cleanup is not system-wide yet.
2. UI cleanup conventions are documented but not consistently enforced.
3. `ctx` derived signals and some `aiditor.effect` calls can outlive their components.
4. Transient panel eviction and direct tree replacement can leave orphan runtimes.
5. Bus errors do not yet carry subscriber-side panel/dock attribution.
6. Pop-out migration loses some `PanelData` fields and has fragile `file://` origin behavior.
7. Drag sessions do not consistently handle `pointercancel` and window blur.
8. AGENTS/README/package boundaries have drifted.
9. There is no automated verification entry point.

## Target quality bar

To call the project "excellent", the following must be true:

- Repeated create/destroy cycles leave no live framework effects, panel runtimes, overlays, or bus subscriptions.
- Any panel removal path disposes the same resources: explicit close, transient eviction, LRU eviction, merge discard, dock removal, layout destroy.
- User-created panel components can safely compose `aiditor.ui.*` primitives without memorizing special cleanup rituals.
- Bus errors identify the topic and the subscriber context when the subscriber was registered through `ctx.bus`.
- Pop-out migration preserves the complete portable part of `PanelData`.
- `file://` remains a first-class runtime mode.
- Drag sessions always unwind, including ESC, `pointercancel`, lost capture, and window blur.
- Documentation has one current design authority and no stale API names.
- A zero-dependency test/CI layer catches syntax, bundle drift, pure tree regressions, cleanup regressions, and key API smoke failures.

## Scoring target

| Area | Current estimate | Target |
| --- | ---: | ---: |
| Architecture | 90 | 95 |
| Runtime stability | 65 | 92 |
| UI library consistency | 80 | 92 |
| Documentation authority | 72 | 95 |
| Testability | 35 | 85 |
| Package/release hygiene | 76 | 92 |
| Overall | 82 | 94+ |

## Execution order

1. Lifecycle and runtime cleanup.
2. UI cleanup contract.
3. Scoped bus and context lifetime.
4. Migration and drag hardening.
5. Test and CI baseline.
6. Documentation and package boundary cleanup.
7. Final audit against the target quality bar.

The order matters because tests become much more useful after lifecycle semantics are explicit.

## Non-goals

- Do not add app-level shortcuts to the framework.
- Do not introduce npm runtime dependencies.
- Do not convert source files to ES modules.
- Do not couple framework source to `demo/` or `temp/GameDataEditor`.
- Do not redesign the visual style unless a specific token or accessibility gap requires it.
