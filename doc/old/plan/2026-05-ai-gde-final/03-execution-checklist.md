# Execution checklist

## Phase 1 - Foundation

- [x] Final AI panel IDs only.
- [x] GDE project-scoped AI persistence.
- [x] GDE AI patch/tool smoke tests.
- [x] Document final AI/GDE route.

## Phase 2 - Target Coverage

- [x] Table tree rows expose `gde.table`.
- [x] Table cards expose `gde.entity`.
- [x] Inspector fields expose `gde.field`.
- [x] Asset items expose `gde.asset`.
- [x] Type config rows expose `gde.type`.
- [x] Card style list rows expose `gde.card_style`.
- [x] Card style object tree nodes expose `gde.card_node`.
- [x] Card style canvas nodes expose `gde.card_node`.

## Phase 3 - Tool Coverage

- [x] `gde.getAsset`
- [x] `gde.getCardStyleNode`
- [x] `gde.summarizeTable`
- [x] `gde.findInvalidRefs`
- [x] `gde.findUnknownStructFields`
- [x] `gde.planTypeConfigMerge`
- [x] `gde.replaceAssetReferences`
- [x] `gde.patch` supports card style node update/add/delete.

## Phase 4 - Patch UX

- [ ] `aiditor.changeSet` core implemented.
- [ ] `aiditor.ui.changeReview` implemented.
- [ ] `ai-messages` renders `aiditor.changeSet` previews.
- [ ] `GDE.ai.patchPreviewToChangeSet` implemented.
- [ ] GDE patch preview renders through `aiditor.ui.changeReview`.
- [x] Apply requires approval.
- [x] Apply writes one history entry.
- [x] Validation failure displays errors without mutation.

## Phase 5 - Final Verification

- [x] `node --check temp\GameDataEditor\src\ai\skills.js`
- [x] `npm run check:gde`
- [x] `npm run check`
- [x] `npm run check:dist`
- [ ] GDE browser smoke:
  - open demo
  - configure connection
  - send a chat message
  - attach table card target
  - preview patch
  - approve patch
  - undo patch from History
