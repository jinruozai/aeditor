# Migration and drag interaction hardening

## Pop-out migration

### Design intent

Same-window panel movement is detached DOM movement. It must not serialize.

Cross-window migration must serialize because DOM cannot move across windows.

The protocol should preserve all portable panel state and never silently lose dirty state.

### Current gaps

- Sent panel data omits fields such as `dirty`, `badge`, `transient`, and `name`.
- `targetOriginFor()` can return `'null'` for `file://`, which is fragile as a `postMessage` target origin.
- Receiver binds whenever `window.opener` exists, not only when the page is an editorframe popup.
- Receiver listener is not attached to layout destroy.
- Migration protocol is embedded in `migrate.js`; it is manageable now, but ownership should be clearer as it hardens.

### Target protocol

Source:

1. user calls `ctx.panel.popOut()` or drags outside
2. source serializes portable `PanelData`
3. source serializes component runtime state if `spec.serialize` exists
4. source opens target URL with explicit `ef-popup=1` and transaction id
5. source waits for `ready(txId)`
6. source posts `migrate(txId, panelData, state)`
7. source removes local panel only after `migrate-ack(txId)`

Target:

1. only binds receiver when `ef-popup=1` is present
2. sends `ready(txId)` to opener
3. verifies source and origin
4. finds accepting dock
5. adds panel
6. applies component state if possible
7. sends ack or reject

### Portable PanelData

Preserve:

- `component`
- `title`
- `icon`
- `dirty`
- `badge`
- `props`
- `toolbarItems`
- `name`

Review:

- `transient`: probably should not remain transient after pop-out unless the user explicitly wants preview semantics across windows. Decide before implementation.

Never preserve:

- old framework-generated `id`

### file:// target origin

For `file://`, use a deliberate rule:

- strict same-origin for http/https
- for null-origin file mode, use `'*'` only when both windows are expected editorframe popup participants and `source` checks still match

This keeps double-click mode working while preserving source-window checks.

## Drag sessions

### Current gaps

Splitter, corner drag, and panel drag each implement cleanup independently.

Missing or inconsistent cleanup triggers:

- `pointercancel`
- `lostpointercapture`
- window `blur`
- popup/drop window edge cases

### Target design

Introduce a shared drag session helper or converge the pattern manually.

Every drag session must support:

- start
- move
- commit
- cancel
- cleanup

Cleanup triggers:

- pointerup
- pointercancel
- ESC
- lost pointer capture
- window blur

Cleanup must remove:

- window listeners
- body drag classes
- active splitter classes
- overlays
- ghosts
- drop indicators
- pointer capture where applicable

### Files likely affected

- `src/dock/interactions.js`
- `src/dock/panel-drag.js`
- `src/dock/migrate.js`
- optional `src/dock/drag-session.js`
- `tools/build.mjs`
- `dist/ef.js`

## Acceptance criteria

- Dragging splitter then pressing ESC or switching windows leaves no body drag class.
- OS/browser pointer cancellation leaves no overlay or ghost.
- Corner merge dirty rejection always removes preview overlay.
- Panel drag outside opens popup only when pointer is outside all docks.
- Pop-out from `file://` works.
- Dirty/badge/name panel state survives pop-out where applicable.
- Non-popup opener windows do not register migration receiver behavior.
