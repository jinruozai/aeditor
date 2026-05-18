# Quality Optimization Plan

This plan keeps AIditor aligned with the product principles: simple, elegant, efficient, visually consistent, and cleanly separated from project code.

## 1. Security And Permission Boundaries

- AI runtime must apply the same permission gate to resolved payloads and resource metadata.
- Tools that mutate data must preview first unless the permission policy explicitly allows direct apply.
- Project adapters may construct targets and patches, but framework APIs own storage, resource attachment, and permission checks.

## 2. Framework / Project Boundary

- `src/` owns reusable systems: dock, UI widgets, settings, AI target/resource/tool/runtime infrastructure.
- `temp/GameDataEditor/src/` owns game-data semantics: table schema, entity IDs, assets, card styles, GDE tools, and GDE skills.
- GDE must not duplicate framework resource attachment, prompt, menu, settings, history, or shortcut primitives.
- Framework widgets should expose callbacks for app-specific semantics instead of calling app globals.

## 3. UI Consistency

- No browser-native `prompt/confirm/alert` in editor workflows; use `aiditor.ui.prompt`, `aiditor.ui.confirm`, or callback-provided dialogs.
- All user-visible text in GDE goes through `t()` / `I18N`.
- User-facing strings must be valid UTF-8 and free of mojibake.
- CSS color must use `--aiditor-*` semantic tokens or project-level `--gde-*` tokens derived from them.

## 4. CSS Structure

- Each framework subsystem owns one stylesheet:
  - `ui-ai.css` for AI panels.
  - `ui-settings.css` for Settings.
  - data/form/base/container/editor/overlay remain separate.
- Large app CSS sections should be grouped by panel or extracted when a panel becomes independently reusable.

## 5. Size And Complexity

- Files above ~800 lines are review candidates.
- Files above ~1000 lines require an explicit split plan unless the content is mostly data tables.
- Preferred split points:
  - `inspector.js`: entity inspector, table meta inspector, type override inspector, card-style node inspector.
  - `cardstyle-editor.js`: canvas input, transform tools, selection/marquee, context menu, rendering bridge.
  - `state.js`: table ops, entity ops, type config ops, card-style ops, project metadata.

## 6. Verification Gates

Before delivery:

- `npm run check`
- `npm run check:dist`
- `npm run check:gde`
- Rebuild `dist/aiditor.js` and `dist/aiditor.css`.
- Sync `temp/GameDataEditor/vendor/aiditor.js` and `aiditor.css`.

