# AI + GameDataEditor final delivery plan

## Goal

Make editorframe's AI system a reusable editor capability, then make GameDataEditor a first-class example of precise AI-assisted editing.

The final model is:

```text
editor object -> AI Target -> resource resolver -> tool/patch -> ChangeSet -> approval -> history
```

The framework-level review contract is defined in `doc/change-set-review-system.md`. GDE patch previews must convert to `ef.changeSet` instead of inventing a private diff UI.

The framework owns the generic protocol, UI panels, agent/group store, connection/auth/transport runtime, permissions, target transport, tool-call lifecycle, and settings integration.

GameDataEditor owns game-data semantics: tables, type config, entity IDs, asset references, card styles, validation rules, and GDE-specific tools/skills.

## Product Principles

- **Precise**: AI never guesses where to edit. It receives stable target URIs and calls tools for full data.
- **Safe**: Every mutation goes through ChangeSet preview/approval/history unless explicitly configured otherwise by the host.
- **Composable**: Any editor built on editorframe can register targets, tools, skills, and plugins without modifying framework internals.
- **Low ceremony**: Adding AI to a panel should usually mean binding targets and registering a few tools.
- **No compatibility baggage**: final IDs and schemas only. No legacy aliases or silent format adapters.

## Final Surface Summary

Framework panel component IDs:

```txt
ai-agents-list
ai-chatinput
ai-messages
```

GDE canonical patch tools:

```txt
gde.validatePatch
gde.previewPatch
gde.applyPatch
```

AI operation rules:

- Before any edit, read the relevant target with `gde.get*` or `gde.queryRows`.
- Before any bulk edit, use `gde.queryRows` to enumerate affected IDs, then preview the exact patch.
- Every entity field must be declared in `struct_def`.
- Every `struct_def` field type must resolve through builtin/project `type_config` or be introduced by the same patch with `upsertType`.
- `ref_id` values must resolve to existing entity IDs unless intentionally empty.
- Child agents stay shallow by default: a child agent does not create deeper child agents unless the user explicitly asks for nested delegation.
- No old component IDs, old tool IDs, or compatibility patch envelopes are part of final behavior.

## Current Status

Done:

- Framework AI store, connections, messages, tool-call lifecycle, settings, target protocol.
- Framework panels:
  - `ai-agents-list`
  - `ai-chatinput`
  - `ai-messages`
- GDE loads the AI adapter and owns project-specific persistence.
- GDE has initial targets for table/entity/field/asset/card-style.
- GDE has initial tools for summary, schema, row query, entity/field read, references, search, card style, patch preview/apply.
- GDE patch flow writes through `State` and captures history.
- Framework ChangeSet design contract is documented and will govern patch preview rendering.

Main gaps:

- Not all editable GDE surfaces are target-bound yet.
- Patch schema is powerful but not fully tested.
- Tool-call message UI needs framework ChangeSet rendering and GDE semantic renderers.
- Permission UI and tool approval still need final polish.
- GDE skill needs stricter operational guidance for bulk edits and type config.
- Browser-level smoke is still manual.

## Execution Phases

1. **Plan and Tests**
   - Write this plan set.
   - Add GDE AI tool/patch smoke tests.
   - Keep `npm run check`, `check:dist`, and `check:gde` green after every phase.

2. **Target Coverage**
   - Bind AI targets to table tree rows, table cards, inspector fields, asset items, type config rows, card style list items, object tree nodes, and card style canvas nodes.
   - Support right-click "Ask AI" and drag-to-chat for all targetable surfaces.
   - Make selection expansion deterministic: multi-selection becomes concrete target refs, not a vague global selection when concrete refs exist.

3. **Tool And Patch Hardening**
   - Expand GDE tools for bulk operations, field/type introspection, reference-safe edits, asset replacement, and card style node edits.
   - Tighten patch validation for table field/type config consistency.
   - Ensure every write returns a preview that can be rendered in `ai-messages`.

4. **Approval And History Loop**
   - Render GDE patch previews through `EF.ui.changeReview`.
   - Convert GDE patch previews to `ef.changeSet`.
   - Apply only after explicit approval.
   - Capture one history entry per approved patch.
   - Provide clear failure output when validation or permission fails.

5. **Agent Workflow**
   - Make the default GDE agent useful without extra setup.
   - Add templates for table design, balance review, asset pass, and card-style editing.
   - Keep delegation shallow by default: main agent can create child agents; child agents do not create deeper children unless user explicitly requests it.

6. **Final UI Polish**
   - Make AI panels visually consistent with the rest of editorframe.
   - Keep Chat in the lower dock, Message in the right dock, AgentList in the left dock for GDE.
   - Ensure settings, connection selection, model loading, permission selection, target chips, and tool blocks are compact and readable.

7. **Docs And Release Gate**
   - Update design docs with final IDs only.
   - Remove stale AI names and transitional notes.
   - Run full checks and GDE browser smoke before pushing.

## Quality Gates

- No pre-final AI component IDs or aliases.
- Framework source never imports or references GDE.
- GDE never duplicates framework target attachment/storage logic.
- All GDE AI mutations go through `GDE.ai.patch`.
- All `src/` changes rebuild `dist`.
- GDE vendor stays in sync with `dist`.
