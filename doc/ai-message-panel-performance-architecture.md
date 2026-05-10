# AI Message Panel Performance Architecture

Status: design proposal  
Scope: `ai-messages`, `ai-chatinput`, AI message store signals, streaming UI update path  
Goal: make the chat surface stable with very large transcripts while keeping the implementation small, framework-native, and zero-dependency.

## 1. Problem

The current AI message panel is correct at small scale, but its update model is too broad:

- `ai-messages` subscribes to the global `EF.ai.agents()` signal.
- Any message update can cause the transcript panel to schedule a full render.
- Full render clears the scroll container and rebuilds every visible message node.
- Tool call blocks are `<details>`, so their open state is lost whenever the row is recreated.
- `ai-chatinput` also reads the active agent and performs context estimation from message history, so streaming updates can create work outside the transcript panel.

This means true provider streaming can still feel non-streaming or stuttery in the browser. The transport may deliver incremental tokens, but the UI turns those small deltas into unnecessarily large DOM and JavaScript work.

The desired model is the opposite:

- transcript size can be huge;
- rendered DOM stays close to the viewport size;
- streaming only patches the currently running assistant message;
- input composition and caret blinking are isolated from transcript updates;
- tool call expansion, scroll position, selection, and user interaction state are stable.

## 2. First Principles

### 2.1 The DOM Is The Scarce Resource

A transcript can contain thousands of messages, but the screen can only show a small number of rows. The framework should optimize for this fact:

```
Total messages:        100000
Messages in JS store:  100000
Messages in DOM:       visible range + overscan
Streaming patch:       one message part
```

The cost of rendering should be proportional to visible content, not transcript length.

### 2.2 Message Identity Must Be Stable

Every message already has a stable id. The UI should treat that id as the row identity. A row should be created once, updated while it remains in the viewport, and disposed only when it leaves the virtual window or the panel is destroyed.

### 2.3 Streaming Is A Patch, Not A Render

During streaming, the common case is text append. The fast path should update one text node:

```
delta text -> update message model -> patch current Text node
```

Markdown parsing, code block shaping, copy button rebuilding, metrics recalculation, and tool block layout should not run for every token batch.

### 2.4 User Interaction State Belongs To The View Runtime

Open tool calls, selected tool tabs, scroll anchor, and "stick to bottom" are view runtime state. They must not be stored in the message payload and must not be lost when data updates.

### 2.5 Input Must Not Subscribe To The Hot Path

The composer is latency-sensitive. Cursor blink, IME composition, typing, paste, and selection must not depend on message stream updates. Context estimation is useful, but it is not allowed to scan history on every streaming delta.

## 3. Target Architecture

```
EF.ai.store
  agents metadata
  activeAgentId
  messages by agent
  per-agent message version
  per-message version

EF.ai.runtime
  provider stream reader
  stream buffer
  frame/timer batching
  message patch publication

ai-messages panel
  transcript viewport
  virtual message list
  keyed message rows
  message part patchers
  live run strip
  view runtime state

ai-chatinput panel
  local draft state
  stable active-agent metadata subscription
  debounced context estimate
```

The important shape is separation:

- store owns data;
- runtime owns streaming and tool execution;
- transcript owns viewport and row lifetimes;
- composer owns draft and user input.

No React-style full component tree render is needed. This remains a small IIFE implementation using the existing `EF.signal`, `EF.effect`, `EF.ui`, and cleanup conventions.

## 4. Store Shape

The existing `EF.ai.agents` array can remain as a compatibility surface, but the hot UI path needs narrower subscriptions.

Recommended internal model:

```js
agentIndex = {
  [agentId]: {
    meta,
    messageIds,
    messageMap,
    version,
    messageListVersion,
  }
}

messageVersions = {
  [agentId + '/' + messageId]: number
}
```

Recommended public or internal helpers:

```js
EF.ai.activeAgentMeta()
EF.ai.agentMessageIds(agentId)
EF.ai.readMessage(agentId, messageId)
EF.ai.messageVersion(agentId, messageId)
EF.ai.messageListVersion(agentId)
EF.ai.activeRunState(agentId)
```

Compatibility:

- `EF.ai.agents()` can still return the full array for older panels.
- New hot panels should not subscribe to full `EF.ai.agents()` during streaming.
- `appendMessage`, `updateMessage`, and tool-result operations update the narrow versions first, then refresh compatibility snapshots.

This avoids forcing every AI panel to wake up when one message receives more text.

## 5. Runtime Streaming Path

The provider path can remain truly streaming. The required change is how stream deltas are published to UI.

### 5.1 Stream State

Each running assistant message has a mutable stream state owned by runtime:

```js
{
  agentId,
  messageId,
  text,
  reasoning,
  toolCalls,
  usage,
  firstTokenAt,
  lastPublishedAt,
  lastPreviewText,
  previewTail,
  dirtyFields
}
```

This mutable object is not exposed to components. It is a buffer that lets runtime coalesce deltas.

### 5.2 Publish Cadence

Use a single policy:

- publish text at most once per animation frame or every `STREAM_UI_UPDATE_MS`, whichever is later for the current implementation target;
- publish immediately for structural changes such as new tool call, status change, usage/final stats, approval state, or error;
- publish final state synchronously when the provider finishes.

The transcript panel still receives real incremental updates, but the browser is not asked to rebuild content faster than it can paint.

### 5.3 Patch Type

Message updates should describe what changed:

```js
{
  type: 'message.patch',
  agentId,
  messageId,
  fields: {
    content: true,
    reasoning_content: true,
    toolCalls: true,
    status: true,
    stats: true
  }
}
```

The view may ignore the field map in the first implementation, but keeping it in the design makes the final system simple to optimize without changing API shape again.

## 6. Live Run Strip

The message panel needs a tiny realtime status strip at the end of the transcript. Its job is not to render the final answer. Its job is to answer one question at all times:

```
Is the model/runtime doing work, and did any new model text arrive?
```

This strip should be driven by runtime telemetry, not by full message rendering. It must update even when the transcript virtualizer is busy, the user is scrolled away from the last message, or Markdown rendering is deferred.

### 6.1 Placement

The strip lives inside `ai-messages`, visually after the last transcript item and before the composer when the layout places composer below messages.

It is not a normal message row:

- it is not persisted into `agent.messages`;
- it is not copied with the transcript;
- it does not affect virtual row heights except as one fixed bottom element;
- it can stay visible while the latest assistant row is outside the rendered range.

### 6.2 Shape

The strip is a compact two-line status area:

```text
row 1:  [subtle preview plate: status indicator + live preview tail]
row 2:  plain footer text: elapsed time, token/speed/cost metrics
```

Row 1:

- has a subtle bottom-anchored plate/background;
- left: status indicator;
- right: a single-line preview tail;
- max preview length: approximately 120 characters by default;
- overflow behavior: keep the newest tail and let new text push old text out from the left;
- whitespace: collapse newlines to visible spaces so the strip always remains one line.

Row 2:

- has no separate plate/background;
- reuses the same quiet visual language as the current per-message footer metrics;
- elapsed time for the current run;
- token usage when known;
- average output speed when known or estimable;
- cost when known;
- optional TTFT once first token arrives.

Example text:

```text
[ ● 正在输出  ...then the newest model text keeps sliding in from the right ]
12.4 s   1,572 tok   41.6 tok/s   $0.0002
```

The copy can be localized later. The runtime shape should not depend on display language.

### 6.3 Status States

Recommended visual states:

| State | Meaning | Indicator |
|---|---|---|
| `idle` | no active run | small white/neutral dot |
| `queued` | user message queued, not sent yet | muted yellow dot |
| `connecting` | request started, no token/tool event yet | yellow pulse |
| `thinking` | reasoning token or provider thinking event received | violet/blue soft pulse |
| `receiving` | assistant text token received | green breathing light |
| `tool` | executing or preparing tool calls | blue segmented spinner |
| `waiting_approval` | tool/user approval required | amber steady pulse |
| `stopped` | user stopped this run | neutral hollow dot |
| `error` | provider/runtime failed | red dot |

Only `receiving`, `thinking`, and `tool` should animate continuously. `idle` must be visually calm.

### 6.4 Runtime Data

Runtime should publish a narrow run-state signal:

```js
{
  agentId,
  runId,
  messageId,
  state,             // idle | queued | connecting | thinking | receiving | tool | waiting_approval | stopped | error
  previewTail,       // newest normalized model text tail
  previewUpdatedAt,
  startedAt,
  firstTokenAt,
  updatedAt,
  completedAt,
  usage,
  outputTokens,
  totalTokens,
  cost,
  error
}
```

`previewTail` is fed directly by provider deltas before any expensive message row rendering. If the provider sends one character, that character should appear in the strip on the next UI tick.

Important distinction:

- message content is the durable transcript;
- live preview tail is ephemeral telemetry.

The preview tail may be shorter, normalized, or dropped after completion. The durable message content remains the source of truth.

### 6.5 Update Rules

- On user send: state becomes `queued` or `connecting`, elapsed timer starts.
- Before first token: show state and elapsed time even with an empty preview, so the user knows the request is in flight.
- On reasoning delta: state becomes `thinking`; preview can show a reasoning tail only if the provider exposes it and the app decides it is safe to display.
- On text delta: append normalized text to `previewTail`, set state to `receiving`, update first-token time if needed.
- On tool-call delta or tool execution: state becomes `tool`; preview keeps the latest text tail unless tool status text is more useful.
- On waiting approval: state becomes `waiting_approval`; animation slows/stops and metrics remain visible.
- On finish: keep final metrics briefly, then settle to `idle` or hide preview text.
- On error: show concise error state and preserve elapsed time.

### 6.6 Performance Rules

The live strip must be cheaper than the transcript:

- one small DOM subtree;
- one text node for preview;
- one text node for elapsed/metrics;
- no Markdown parsing;
- no tool body rendering;
- no transcript scan;
- no subscription to `EF.ai.agents()`.

Elapsed time can update once per second. Preview can update at the same cadence as stream UI patches or via a separate lightweight `requestAnimationFrame` queue. It should never force message rows to render.

### 6.7 Why This Solves The Ambiguity

The strip separates three states that currently feel identical:

- API has not produced anything: `connecting`, elapsed grows, preview empty.
- API is producing but transcript rendering is delayed: `receiving`, preview tail updates.
- run is blocked on a tool or approval: `tool` / `waiting_approval`, metrics visible.

This makes the chat feel honest even when the full message row is intentionally delayed or virtualized.

## 7. Transcript View Runtime

`ai-messages` should have a local runtime object:

```js
{
  agentId,
  viewportEl,
  spacerBefore,
  spacerAfter,
  rowById,
  order,
  expandedToolCalls,
  rowHeights,
  estimatedRowHeight,
  anchor,
  stickToBottom,
  liveRunStrip
}
```

The panel runtime is disposable with the normal `ui.collect` / `EF.ui.dispose` convention.

## 8. Virtual Message List

### 8.1 Layout Model

Use a simple vertical virtualizer:

```text
scroll area
  top spacer
  visible message rows
  bottom spacer
```

The virtualizer maintains:

- `messageIds`
- `rowHeights`
- prefix height estimate
- visible start/end indexes
- overscan count or overscan pixels

This can live in a small internal helper file if it becomes reusable:

```text
src/ai/message-virtualizer.js
```

It does not need to become a generic framework component on day one. The transcript has special needs: sticky bottom, streaming rows, and tool expansion state.

### 8.2 Initial Simplicity

The first implementation can use an estimated fixed row height plus measured corrections:

- default estimate: one compact assistant/user message height;
- measure rows after insertion with `ResizeObserver` when available;
- update spacer heights when a row changes size;
- keep a small overscan buffer above and below the viewport.

No binary indexed tree is needed initially. A prefix array rebuilt on message list changes is enough because list structure changes are much rarer than token deltas.

### 8.3 Stick To Bottom

Stick-to-bottom is explicit state:

- if the user is near bottom before an update, keep bottom pinned;
- if the user scrolls up, never force-scroll during streaming;
- when a new user message is sent from this composer, the transcript may opt back into bottom stickiness.

This prevents the panel from fighting the user while they inspect previous tool calls.

## 9. Keyed Message Rows

Each visible row is keyed by `message.id`:

```js
row = {
  id,
  el,
  message,
  partViews,
  update(message, changedFields),
  dispose()
}
```

Row update rules:

- same id: patch existing DOM;
- new visible id: create row;
- id leaves virtual window: dispose row;
- order changes: move existing row element instead of recreating it.

This solves the current `<details>` collapse problem because the row is not destroyed for unrelated updates. For rows that are rebuilt because they leave the virtual window, expansion is restored from `expandedToolCalls`.

## 10. Message Parts

The renderer should normalize messages into parts before painting:

```js
[
  { type: 'text', key: 'content', text },
  { type: 'reasoning', key: 'reasoning', text },
  { type: 'tool-call', key: call.id, call },
  { type: 'contexts', key: 'contexts', refs },
  { type: 'attachments', key: 'attachments', attachments },
  { type: 'footer', key: 'footer', metrics }
]
```

Each part gets a small patcher:

- text part updates only text during streaming;
- completed text can be upgraded to richer paragraph/code rendering;
- tool-call part patches status/actions/result without replacing the whole row;
- footer patches metrics only when stats change.

This is the smallest model that avoids both full transcript rebuilds and full row rebuilds.

## 11. Markdown And Code Rendering Policy

Streaming phase:

- append plain text into a single text node or lightweight block;
- preserve line breaks using CSS;
- do not parse fenced code blocks repeatedly.

Completion phase:

- render paragraphs and code blocks once;
- large code blocks and large tool results default to collapsed preview;
- expanded large blocks render on demand.

This keeps token arrival cheap and makes final messages readable.

## 12. Tool Calls

Tool calls need stable state and predictable lifecycle.

View state:

```js
expandedToolCalls = {
  [agentId + '/' + messageId + '/' + callId]: true
}
```

Rules:

- expansion survives message patching;
- expansion survives row virtualization when the row is recreated;
- approval buttons update only the affected call;
- failed calls do not show approval controls if there is no valid next action;
- large args/results are lazily rendered inside the expanded body.

This directly fixes "I expand a tool call and it immediately collapses".

## 13. Composer Isolation

The `ai-chatinput` panel should not subscribe to full message objects.

Recommended state split:

```js
draftSig                // local, hot, contenteditable-owned
activeAgentMetaSig      // id, status, connection, model, permission
contextEstimateSig      // debounced, cold
providerOptionsSig      // cold
```

Rules:

- typing and IME composition only touch `draftSig`;
- send/stop button reads active status, not full transcript;
- context estimate runs after draft debounce, active-agent switch, message completion, or explicit model change;
- context estimate uses summaries/counts where possible and avoids scanning running assistant text on every stream delta.

If exact token estimate is expensive, the UI should prefer stale-but-stable over exact-but-janky. The meter is informational; input latency is mandatory.

## 14. Scheduling

Use two queues:

### 14.1 Runtime Publish Queue

Owned by `src/ai/runtime.js`.

- coalesces provider deltas;
- publishes message patches at paint-friendly cadence;
- publishes live run-state updates through the lightweight strip path;
- final/error/status updates flush immediately.

### 14.2 View Patch Queue

Owned by `ai-messages`.

- coalesces multiple message patch notices into one frame;
- computes virtual range once per frame;
- patches only visible changed rows;
- never clears the whole scroll container during normal updates.

Implementation can use `requestAnimationFrame` where available and `setTimeout(fn, 16)` fallback for file/local contexts.

### 14.3 Live Strip Queue

Owned by `ai-messages`, separate from row virtualization.

- updates preview text without touching transcript rows;
- updates elapsed time once per second while active;
- patches status class only when state changes;
- patches metrics only when usage/stats change.

## 15. Performance Guarantees

The target behavior:

| Scenario | Expected Work |
|---|---|
| 100000 stored messages, idle | DOM size bounded by viewport + overscan |
| streaming text into visible last row | one text node patch per UI tick |
| streaming text while user scrolled far up | store update only; no visible row patch unless affected row is visible |
| tool result arrives in visible row | patch that tool-call part |
| user expands tool call | local row update, no store write |
| switch active agent | replace virtual runtime for that agent |
| resize dock | recompute viewport range, preserve scroll anchor |
| type in composer during stream | draft DOM remains stable; no transcript scan |
| first model character arrives | live strip preview updates without waiting for full row render |
| request is waiting for API | live strip shows connecting state and elapsed time |
| tool call is executing | live strip shows tool state without rebuilding tool body |

Non-goals:

- keeping every historical row mounted;
- exact token meter on every keystroke and token delta;
- real-time Markdown parsing for partial streaming text;
- preserving browser text selection when the selected row leaves the virtual window.
- using the live strip as the durable source of message content.

## 16. File Plan

New or changed files for implementation:

```text
src/ai/store.js
  Add narrow message list/message version accessors while preserving existing APIs.

src/ai/runtime.js
  Keep true streaming, but publish structured patches and live run-state updates through the narrow store path.

src/ai/panels/transcript.js
  Replace full clear/rebuild with virtualized keyed rows, message part patchers, and the live run strip.

src/ai/panels/chat.js
  Isolate composer hot state and debounce/cold-path context estimation.

src/style/ui-ai.css
  Add virtual transcript spacer/row styles, stable streaming text styles, and live run strip states.

tests/ai-message-store.test.mjs
  Verify narrow versions, active run state, and compatibility snapshots.

tests/ai-transcript-virtualization.test.mjs
  Verify range calculation, keyed row preservation, and live strip independence.

tests/ai-chatinput-performance.test.mjs
  Verify context estimation is not invoked on every streaming patch.
```

Optional if the transcript helper becomes cleanly reusable:

```text
src/ai/message-virtualizer.js
src/ai/message-row.js
```

Do not introduce third-party virtual list libraries. The framework is zero-dependency and the required algorithm is small.

## 17. Migration Plan

### Phase 1: Stabilize The View

- Keep existing store shape.
- Add keyed row reconciliation in `ai-messages`.
- Preserve expanded tool calls in local state.
- Stop clearing the entire scroll container on every update.

This phase fixes the most visible bug with the smallest blast radius.

### Phase 2: Add Live Run Strip

- Add runtime run-state telemetry.
- Render the two-line strip at the transcript bottom.
- Feed preview tail directly from provider text deltas.
- Show connecting/thinking/receiving/tool/waiting/error states.

This phase makes the runtime legible before deeper virtualization work.

### Phase 3: Add Virtualization

- Add virtual range calculation.
- Render only visible rows plus overscan.
- Measure row heights and preserve scroll anchor.

This phase makes huge transcripts cheap.

### Phase 4: Narrow Store Signals

- Add per-agent/per-message version accessors.
- Move transcript and composer off global `EF.ai.agents()` hot subscription.
- Keep compatibility APIs.

This phase removes unnecessary wakeups across AI panels.

### Phase 5: Stream-Specific Part Patching

- Normalize message parts.
- Add text/tool/footer part patchers.
- Stream into text node; render rich blocks on completion.

This phase makes streaming feel smooth even while model output is active.

### Phase 6: Composer Cold Path

- Debounce context estimate.
- Recompute after draft pause, active-agent switch, model change, and final message completion.
- Do not scan full history on each stream patch.

This phase protects caret blink, IME, and typing latency.

The phases are implementation steps, not user-facing modes. The final code should not keep duplicate transitional paths.

## 18. Acceptance Criteria

The final implementation is acceptable when:

- sending a message does not freeze the composer caret;
- after the first provider character arrives, the live strip displays it even if the full message row has not updated yet;
- while waiting for API output, the live strip shows a connecting state and elapsed time;
- thinking/tool/approval/error states are visually distinct and do not require opening logs;
- streaming text appears incrementally without rebuilding the transcript;
- expanding a tool call remains expanded through streaming, approval, result, and unrelated message updates;
- a transcript with tens of thousands of messages keeps DOM node count bounded by visible range plus overscan;
- scrolling up during streaming does not snap to bottom;
- resizing docks preserves a sensible scroll anchor and recomputes only visible rows;
- input context meter updates on a cold cadence and never blocks typing;
- `npm run check` and `npm run check:dist` pass after rebuilding `dist`.

## 19. Design Fit

This design matches EditorFrame's existing architecture:

- It uses stable ids and keyed reconciliation, same spirit as dock rendering.
- It keeps component runtime state local to the panel.
- It preserves zero-dependency and zero-module constraints.
- It does not add application-level shortcuts or business policy to the framework.
- It treats the transcript as a panel implementation detail, not as a new framework layer.
- It keeps old AI APIs available while giving performance-sensitive panels better primitives.

The simplest correct mental model is:

```
Messages are data.
Rows are viewport runtime.
Streaming is a patch.
Run telemetry is ephemeral.
The composer is independent.
```

That model is enough to make large transcripts stable without making the whole AI stack heavier.
