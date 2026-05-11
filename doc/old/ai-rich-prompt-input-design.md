# AI Rich Prompt Input

Status: final design contract
Scope: AEditor framework-level rich prompt input for AI chat/send panels

This document defines how AI prompt input embeds resources, editor targets, files, images, paths, and other AI-addressable objects directly inside the text flow. It replaces the "attachment chips above the textarea" mental model with inline references that preserve natural language context.

The design goal is not to build a general rich text editor. The goal is a small, reliable, high-performance prompt editor for AI workflows.

## Goals

- **Natural**: users can write "compare this image [icon.png] with [icon2.png]" without saying "attachment 1".
- **Precise**: AI receives the inline position of each reference and the resolved resource payload.
- **Stable**: editing, deletion, copy, paste, drag, and IME input must not corrupt references.
- **Small**: no dependency on ProseMirror, Lexical, Slate, Quill, or a full document model.
- **Serializable**: draft state can be persisted, diffed, tested, and reconstructed.
- **Safe**: inline references never grant mutation permission. Tools and permissions still gate data access.
- **Fast**: prompt input should handle many references and long text without layout-heavy rich document reconciliation.

## Non-Goals

Do not implement a full rich text editor:

- no bold/italic/heading/list/table editing
- no arbitrary HTML import
- no nested inline objects
- no block widgets
- no markdown formatting model
- no collaborative editing protocol
- no business-specific resource behavior in the UI component

Only these inline atom types are in scope for v1:

- `ref`: an AI resource/target/file/path reference rendered as one chip
- text and newline characters

## Core Decision

AEditor uses a **plain string with private token characters plus a sidecar token map**.

```js
{
  text: "Compare \uE000 with \uE001",
  tokens: {
    "\uE000": {
      type: "ref",
      resourceId: "res_icon",
      label: "icon.png",
      kind: "file.image"
    },
    "\uE001": {
      type: "ref",
      resourceId: "res_icon_2",
      label: "icon2.png",
      kind: "file.image"
    }
  }
}
```

The token character is an internal implementation detail. Users never see it. The UI renders each token as a `contenteditable=false` inline chip.

Why this design:

- A reference is length 1 in the text model, matching the mainstream inline atom/embed model used by mature editors.
- Deleting a reference is deleting one character from `text`.
- Selection and slicing remain string-based.
- No offsets need to be maintained.
- No escaping format like `{{...}}` is required.
- No markdown ambiguity is introduced.
- Resource identity stays in the sidecar map and resource pool, not in visible text.

## Token Character Space

Use Basic Multilingual Plane Private Use Area code points:

```txt
U+E000 .. U+F8FF
```

This gives 6,400 token characters per draft, far beyond a sane prompt input limit.

Rules:

- Each token character must be unique within one draft.
- A token character may appear multiple times only if the user duplicated the same inline reference intentionally.
- Token allocation starts at `U+E000` and picks the first unused code point.
- If the BMP private area is exhausted, the component rejects additional inline references with a user-visible error. Do not use surrogate-pair private planes in this component; they make cursor math and deletion less simple.
- Token characters are never exposed in final model prompts, exported plain text, or logs.

## Data Model

### Rich Prompt Draft

```js
{
  text: string,
  tokens: {
    [tokenChar: string]: RichPromptToken
  }
}
```

### Rich Prompt Token

```js
{
  type: "ref",
  resourceId: string,
  label: string,
  kind?: string,
  uri?: string,
  title?: string,
  meta?: object
}
```

`resourceId` points to an entry in `aeditor.ai` resource storage. The token is only the inline reference. The resource pool owns payload resolution, deduplication, permissions, and persistence.

### Normalization

Every draft write must normalize:

- remove token map entries not present in `text`
- remove private token characters from `text` if no matching token exists
- preserve repeated uses of a token only if the token exists
- collapse unsupported control characters except `\n`, `\t`, and known token chars
- convert CRLF/CR to LF
- keep text as a JavaScript string, not HTML

No business code should mutate `text` and `tokens` separately. All mutations go through `aeditor.ui.richPromptInput` helpers.

## Resource Lifecycle

There are two distinct stores:

1. **Resource pool**: deduplicated real resources, targets, files, images, paths.
2. **Draft references**: token chars pointing at resource IDs.

When a resource is dropped or inserted:

1. Normalize or create the resource in the resource pool.
2. Allocate a token char.
3. Add a token map entry.
4. Insert the token char at the current selection.
5. Render the token as an inline chip.

When a token chip is deleted:

1. Remove the token char from `text`.
2. Normalize the draft.
3. If no remaining token references the resource and the resource is only pending for this draft, remove it from pending resources.
4. Never delete persisted/shared resources from the global resource pool just because a draft reference disappeared.

Deduplication remains resource-level. The same `asset://icon.png` dropped three times should create one resource and three references, unless the insertion policy decides to reuse the same token char for exact duplicate references. The default policy is:

- same resource, same insertion event: one token
- same resource inserted later: new token pointing to the same `resourceId`

This preserves sentence semantics such as "compare [A] with [A] after editing".

## Rendering Model

The component owns a `contenteditable` surface but the DOM is never canonical.

Canonical data:

```txt
RichPromptDraft
```

Render path:

```txt
draft.text + draft.tokens
  -> text nodes and chip spans
  -> contenteditable DOM
```

Commit path:

```txt
contenteditable DOM
  -> RichPromptDraft
  -> normalize
  -> value signal update
```

Chip DOM:

```html
<span
  class="aeditor-richprompt-token"
  data-aeditor-token="..."
  data-aeditor-resource-id="res_icon"
  contenteditable="false"
  role="button"
  aria-label="Reference icon.png"
>
  <span class="aeditor-richprompt-token-label">icon.png</span>
  <button class="aeditor-richprompt-token-remove" type="button" tabindex="-1">x</button>
</span>
```

The chip must behave as one inline atom:

- clicking selects/focuses the chip
- Backspace/Delete removes the whole chip
- arrow keys step over the chip as one unit
- mouse selection may include it as one unit
- remove button deletes only this inline reference

## Editing Behavior

### Text Input

- Normal typing inserts text.
- IME composition must be respected. Do not serialize DOM during active composition except for visual-only updates.
- `Enter` submits when configured by the host.
- `Shift+Enter` inserts newline.
- The component exposes `onSubmit`, but does not hardcode application-level shortcuts beyond prompt-input semantics.

### Deletion

Backspace/Delete behavior:

- If selection contains chips, delete all selected chips and text.
- If caret is after a chip and Backspace is pressed, delete that chip.
- If caret is before a chip and Delete is pressed, delete that chip.
- If caret is inside text, use normal text deletion.

### Paste

Clipboard channels:

```txt
application/x-aeditor-rich-prompt
application/x-aeditor-ai-target-list
application/x-aeditor-ai-target
text/html
text/plain
Files
```

Priority:

1. `application/x-aeditor-rich-prompt`: restore draft fragment and referenced resources.
2. AI target MIME: insert target refs.
3. Files: create file resources and insert refs.
4. Sanitized HTML: extract text only, plus safe links if explicitly supported later.
5. Plain text: insert text.

Do not import arbitrary HTML nodes into the editor.

### Copy

Copy must write two representations:

1. `application/x-aeditor-rich-prompt`: preserves token refs inside AEditor.
2. `text/plain`: user-readable fallback.

Plain text conversion:

```txt
Compare [icon.png] with [icon2.png]
```

Do not leak token characters to plain text.

### Drag and Drop

Drop accepts:

- framework AI targets
- GDE targets
- asset browser resources
- external files
- plain URI/text

Drop insertion happens at the current caret or drop position. If no caret can be resolved, insert at the end.

## Sending to AI

Before provider request, convert draft into a model-facing prompt and resource refs.

Input:

```js
{
  text: "Compare \uE000 with \uE001",
  tokens: {
    "\uE000": { resourceId: "res_icon", label: "icon.png" },
    "\uE001": { resourceId: "res_icon_2", label: "icon2.png" }
  }
}
```

Model-facing text:

```md
Compare [icon.png](ref:res_icon) with [icon2.png](ref:res_icon_2)
```

Request resource refs:

```js
["res_icon", "res_icon_2"]
```

Provider/runtime rules:

- Only resources referenced by the submitted draft are included.
- Resource permission checks still apply.
- Image resources are resolved/compressed only at send time.
- Text resources may be resolved into bounded text snippets.
- Large resources should be summarized or exposed through tools rather than injected wholesale.
- GDE targets should include stable URI, title, summary, metadata, and relevant tool names.

The model-facing markdown reference is not the canonical storage format. It is generated output for LLM readability.

## Message Storage

Submitted user messages should store:

```js
{
  role: "user",
  content: {
    type: "rich-prompt",
    text: "Compare \uE000 with \uE001",
    tokens: {
      "\uE000": { resourceId: "res_icon", label: "icon.png" },
      "\uE001": { resourceId: "res_icon_2", label: "icon2.png" }
    },
    renderedText: "Compare [icon.png](ref:res_icon) with [icon2.png](ref:res_icon_2)"
  },
  resourceRefs: ["res_icon", "res_icon_2"]
}
```

`renderedText` is a cache/debug aid and may be regenerated. The canonical message content remains the rich prompt object plus resource refs.

Assistant messages may continue to store markdown/plain text unless they intentionally contain structured tool results.

## Framework API

### UI Component

```js
aeditor.ui.richPromptInput({
  value,             // signal<RichPromptDraft>
  resources,         // optional signal/resource accessor for labels/thumbnails
  placeholder,
  disabled,
  minRows,
  maxRows,
  onSubmit,
  onDropResource,
  renderToken,
})
```

### Draft Helpers

```js
aeditor.ai.richPrompt.empty()
aeditor.ai.richPrompt.normalize(draft)
aeditor.ai.richPrompt.allocateToken(draft)
aeditor.ai.richPrompt.insertText(draft, index, text)
aeditor.ai.richPrompt.insertRef(draft, index, resource)
aeditor.ai.richPrompt.deleteRange(draft, start, end)
aeditor.ai.richPrompt.refs(draft)
aeditor.ai.richPrompt.toPlainText(draft)
aeditor.ai.richPrompt.toModelText(draft)
aeditor.ai.richPrompt.toClipboard(draft)
aeditor.ai.richPrompt.fromClipboard(data)
```

All helpers return new draft objects. They never mutate the input draft.

### Chat Integration

`ai-chatinput` should own:

- active draft signal
- pending resource refs derived from the draft
- file/target drop routing
- send button enabled when draft has visible text or refs
- clear draft after successful submit

The old top attachment chip row should become optional debug/status UI. Inline refs are the primary interaction.

## Performance

Prompt input is small compared with editor documents, but it must remain predictable.

Rules:

- Re-render full input DOM only on external value changes.
- During local typing, update canonical draft from DOM on input/compositionend.
- Avoid expensive `getComputedStyle` or layout reads in input handlers.
- Token lookup is O(1) through `tokens[tokenChar]`.
- Ref scanning is O(n) over `text`, acceptable for prompt length.
- Large resource payloads are never stored in the draft.
- Image thumbnails use object URLs or existing data URLs only when already available; full image compression happens on send.

## Safety

- Never trust pasted HTML.
- Never execute dropped content.
- Never expose API keys or hidden resource payloads in token labels.
- Do not grant tool permissions through inline refs.
- Permission denial must hide both payload and sensitive metadata from model context.
- Plain text export must not include private token chars.

## Accessibility

- Chips have `role="button"` or `role="link"` depending on behavior.
- Chips expose a readable label: `Reference icon.png`.
- Keyboard users can delete chips with Backspace/Delete.
- The editor exposes a useful `aria-label`.
- Empty state uses placeholder text, not fake DOM content in the canonical draft.

## Why Not Delta as Canonical Format

Quill Delta is a mature and good rich text model. It is also heavier than this prompt input needs.

Delta advantages:

- known embed concept
- good operation model
- familiar to rich text developers

Delta drawbacks for AEditor prompt input:

- array operation normalization is required
- business code may be tempted to splice ops directly
- cursor mapping between DOM and ops is more complex than string offsets
- it suggests support for rich formatting we explicitly do not want

AEditor can still export/import a Delta-like shape later if needed. Internally, the PUA token string is smaller and more stable for this exact use case.

## Why Not Markdown Links as Canonical Format

Markdown refs such as:

```md
[icon.png](ref:res_icon)
```

are good for model-facing text, but not for internal editing:

- users may type real markdown links
- escaping labels and parentheses adds complexity
- deleting a ref is deleting many characters, not one atom
- ambiguous text can look like a ref but not resolve to a resource

Markdown refs are generated for AI readability only.

## Why Not Double-Brace Syntax

Formats like:

```txt
{{aeditor-ref:res_icon|icon.png}}
```

are easy to parse, but they are not elegant:

- visible if rendering fails
- requires escaping
- not a mainstream user-facing convention
- deletion and cursor behavior are multi-character

They are acceptable for debugging, not as the final internal contract.

## Implementation Plan

1. Add `src/ai/rich-prompt.js` pure draft helpers and tests.
2. Add `src/ui/editor/richPromptInput.js` as a focused contenteditable component.
3. Add CSS in a dedicated UI stylesheet section, using existing theme tokens.
4. Replace `ai-chatinput` textarea with `aeditor.ui.richPromptInput`.
5. Route dropped files/targets/assets to `insertRef`.
6. Convert send path to `toModelText(draft)` plus `refs(draft)`.
7. Store submitted user messages as rich prompt content.
8. Keep plain text fallback rendering in message views.
9. Remove or demote the old top attachment row after parity is reached.
10. Add tests for normalization, insertion, deletion, plain text, model text, duplicate refs, clipboard payloads, and permission-filtered send requests.

## Acceptance Criteria

- Dragging an asset into chat inserts a chip at the caret.
- Dragging an external image inserts an image chip at the caret.
- The same resource can appear more than once in one prompt.
- Removing the last inline ref removes the pending attachment.
- Sending includes only resources still referenced by the draft.
- Plain text copy never contains private token chars.
- Model text contains readable markdown refs in the correct sentence position.
- Chinese IME input does not duplicate or corrupt chips.
- Backspace/Delete removes chips as one unit.
- Refresh does not restore stale unsent draft unless the host explicitly enables draft persistence.
- No arbitrary HTML survives paste.
