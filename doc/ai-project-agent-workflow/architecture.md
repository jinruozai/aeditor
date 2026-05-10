# AEditor Project Agent Architecture

This document defines the final design for AI-assisted project editing in
AEditor.

The target quality bar:

- Simple for editor authors.
- Strong enough for large projects.
- Stable under long sessions.
- Precise enough for table, asset, panel, and code edits.
- Compatible with the existing Dock / Panel / Component model.

## 1. First Principles

AI project editing is not chat. Chat is only the surface.

The real system is:

```text
state observation
  -> context selection
  -> model step
  -> tool execution
  -> verification
  -> memory update
```

If any step is vague, the model guesses. If every step is typed and bounded, the
model can act precisely.

Therefore AEditor needs five primitives:

1. `ProjectWorkspace` - the authorized root and file boundary.
2. `ProjectMap` - a compact index of files, panels, components, data resources,
   bus topics, operations, commands, checks, and important symbols.
3. `ContextRouter` - decides what exact context enters each model call.
4. `ProjectTools` - read/search/range/patch/write/check/reload/inspect.
5. `ProjectMemory` - compact summaries, decisions, diffs, and unresolved tasks.

Everything else is UI around those primitives.

## 2. Runtime Shape

```text
EF.project
  opens descriptor
  owns project lifecycle
  owns project registries through owner scope

EF.workspace
  bounds local file access
  exposes list/read/range/search/write/patch/delete/watch

EF.ai.project
  builds context views
  exposes project tools
  records event log and summaries
  coordinates checks and repair loops

EF.dock / EF.ui / EF.bus
  remain the visual and interaction runtime
```

The existing UI framework does not become an AI-specific framework. AI simply
gets better project and runtime tools.

## 3. Project Directory

Recommended shape:

```text
my-editor/
  editorframe.project.json
  layout.json
  AGENTS.md
  src/
    main.js
    panels/
    components/
    ai/
      tools.js
      resources.js
      checks.js
  data/
  assets/
  styles/
```

`editorframe.project.json` remains the descriptor defined in
`doc/project-runtime-architecture.md`.

`AGENTS.md` is the project-level instruction file. It should be concise and
versioned with the project.

`src/ai/` is optional. It is where an editor project can register domain-specific
tools and resources, such as table row patching or animation clip validation.

## 4. Workspace API

Public shape:

```js
workspace.root()
workspace.kind()
workspace.list(path, options)
workspace.search(query, options)
workspace.read(path, options)
workspace.readRange(path, startLine, endLine)
workspace.write(path, text, options)
workspace.patch(path, baseHash, patch)
workspace.delete(path, options)
workspace.stat(path)
workspace.watch(path, handler)
workspace.resolveUrl(path)
```

Rules:

1. Paths are relative to the selected root.
2. `..` escape is rejected.
3. Binary files are described by metadata unless explicitly requested.
4. Large reads return preview and hash by default.
5. Patches require a matching `baseHash`.
6. Deletes have their own permission.
7. All writes create an undo journal entry.

Adapters:

| Adapter | Purpose |
| --- | --- |
| `browser-fsa` | Chromium File System Access API. |
| `bridge` | Local helper for stronger desktop workflows. |
| `memory` | Tests and demos. |
| `sandbox` | Future isolated execution. |

## 5. Context Router

The Context Router creates the LLM input for each turn.

It must never blindly append everything. It builds a budgeted view:

```text
system contract
project rules digest
active task state
selected UI references
project map digest
recent changed files summary
recent tool results summary
exact file ranges requested by current task
open questions / approvals
```

### 5.1 Context Tiers

Tier 0: Always-on

- framework contract
- current project id/title
- permission profile
- selected workspace root label
- compact project rules digest

Tier 1: Active UI context

- selected panel/component/resource
- current dock/panel ids
- attached `add to chat` references
- current runtime errors

Tier 2: Project map

- file tree digest
- component registrations
- panel files
- command/tool/reference ids
- bus topics and custom events
- data resources and schemas

Tier 3: Exact source

- line ranges
- search hits
- changed hunks
- failing check excerpts

Tier 4: Full source

- explicit only
- rare
- shown in UI as high-context operation

### 5.2 Source Projections

Each source reference supports projections:

| Projection | Use |
| --- | --- |
| `summary` | path, hash, size, exports, registrations, health. |
| `outline` | functions, classes, component factories, bus events. |
| `schema` | expected data shape, table columns, panel props. |
| `events` | bus topics, DOM listeners, cleanup handlers. |
| `range` | exact lines. |
| `full` | explicit full text. |

Dynamic panels and project files use the same projection mechanism. A generated
panel should not require sending its whole source just to answer a question.

## 6. Project Map

`ProjectMap` is the repo map adapted to editor projects.

It stores:

- file paths, sizes, hashes, mtimes
- component names and source files
- panel ids, titles, component ids, owner/layer
- `EF.registerComponent` calls
- `EF.ai.references`, `EF.ai.operations`, `EF.commands`, project tools
- `ctx.bus.on`, `ctx.bus.emit`, `EF.bus` topics
- descriptors and layout nodes
- data schemas and table columns when known
- test/check commands

It is updated incrementally:

```text
file write/patch/delete
  -> update hash
  -> rescan one file
  -> update component/resource indexes
  -> mark dependent panels stale
```

No embeddings are required for version 1. Lexical search plus explicit indexes
is enough and easier to debug. Embeddings can be added later behind the same
`project.search` interface.

## 7. Project Tools

Core tool set:

```text
project.describe
project.search
project.read
project.readRange
project.readProjection
project.patch
project.write
project.create
project.delete
project.reload
project.inspectPanel
project.runCheck
project.undo
project.diff
project.listChangedFiles
```

Tool contracts:

- Every tool returns structured status.
- Failed tools return a repairable reason.
- Read tools include `hash`.
- Write and patch tools return changed file hashes and diff summary.
- UI tools include panel id, component id, owner, active dock, and health.
- Failed operations do not show approval controls.

## 8. Patch Protocol

Preferred write path:

```text
readRange/readProjection -> patch(baseHash, hunks) -> runCheck -> inspectPanel
```

Patch request:

```js
{
  "path": "src/panels/inventory.panel.js",
  "baseHash": "sha256:...",
  "hunks": [
    {
      "old": "exact old text",
      "new": "replacement text"
    }
  ]
}
```

Why exact patch first:

- It avoids silent overwrites.
- It catches stale context.
- It keeps prompts small.
- It is understandable to users.

Full write is reserved for new files, generated assets, or deliberate rewrites.

## 9. Permission Model

Permission evaluation order:

```text
deny rules
permission mode
allow rules
runtime approval callback
```

Modes:

| Mode | Meaning |
| --- | --- |
| `review` | Read/search only. Writes become proposed diffs. |
| `auto-edit` | Writes inside project root allowed. Commands still ask. |
| `full-access` | Allowed project tools run without approval. Risky external actions still obey deny rules. |

Permission categories:

```text
workspace.read
workspace.write
workspace.delete
workspace.external
command.run
project.reload
project.code.load
panel.create
panel.promote
extension.installCode
```

Full access must be internally consistent. If a tool is allowed, the UI should
not show an approval toggle for it. If a tool failed, it should show failure
only, not Apply/Reject controls.

## 10. Agent Loop

The main loop:

```text
receive user task
record event
build context view
call model stream
show raw preview strip for every received delta
execute tool calls
record observations
compact noisy observations
continue until model stops or max steps
verify changed state
summarize result
update project memory
```

Important rule:

> Tool calls are part of the turn, not a reason to stop the agent loop.

After every tool observation, the orchestrator must resume the model with the
corresponding tool result unless the user cancels or the model has finished.

## 11. Event Log And Condensation

Store conversation as append-only events:

```text
user_message
assistant_delta
assistant_message
tool_call
tool_result
permission_request
permission_decision
file_change
check_result
summary
condensation
```

Prompt input is a view over the event log.

Condensation keeps:

- first system/project contract events
- latest user request
- active plan
- changed files and hashes
- important decisions
- failing checks
- unresolved questions
- recent tail events

It summarizes:

- old search results
- repeated file reads
- verbose tool output
- obsolete failed attempts

The UI can still show full history from event storage, but the model receives a
clean view.

## 12. Subagents

Subagents are optional but valuable.

Recommended types:

| Agent | Tools | Purpose |
| --- | --- | --- |
| `explore` | read/search only | Find relevant files and summarize. |
| `review` | read/search/diff/check | Review changed files. |
| `scout` | web/docs/search only | External documentation research. |
| `repair` | project read/write/check | Fix a specific failing panel or check. |

Rules:

1. Subagents run in separate context windows.
2. They inherit the project workspace boundary.
3. They can have stricter permissions than the parent.
4. They return summaries, file lists, risks, and recommended next reads.
5. They should not flood the parent context with raw files or logs.

Version 1 can implement this as queued internal sessions rather than true
parallel execution.

## 13. UI Authoring

There is one UI code shape:

```js
EF.registerComponent('project.inventory', {
  factory: function (propsSig, ctx) {
    const root = EF.ui.h('div', 'inventory')
    return root
  }
})
```

Built-in, app, project, and AI-created panels use the same shape.

Guidance injected to AI:

- Prefer `EF.ui.*` components when available.
- Use `ctx.bus` for panel-to-panel communication.
- Use `ctx.onCleanup` for timers/listeners/resources.
- Use scoped overlay helpers for tooltip/popover/menu behavior.
- Design for resizable docks with stable min sizes.
- Do not mount global floating DOM unless it is scoped and cleaned up.

Draft path:

```text
editor.createPanel
  -> session draft
  -> inspect health
  -> promote to project file when durable
```

Durable path:

```text
project.create src/panels/foo.panel.js
project.patch layout.json
project.reload
project.inspectPanel
```

## 14. Domain Data Editing

GameDataEditor-like projects need precise data operations.

Domain tools should expose schemas, not just raw JSON:

```text
gde.describeTable(tableId)
gde.searchRows(tableId, query)
gde.readRows(tableId, rowIds)
gde.patchRows(tableId, baseHash, patches)
gde.replaceTable(tableId, baseHash, rows)
gde.validateTable(tableId)
```

Each tool returns:

- table id
- schema version
- primary key
- changed rows
- validation errors
- new hash

This lets AI know exact data formats and prevents accidental shape drift.

## 15. Checks And Verification

A task is not complete just because a tool applied.

Verification ladder:

1. Syntax/build check if code changed.
2. Project-specific check if registered.
3. Panel creation/health inspect if UI changed.
4. Optional screenshot or visual smoke test when available.
5. Diff summary.

The agent should not claim success while checks are failed or unknown, unless it
explicitly says what remains unverified.

## 16. Performance

The message panel should not rerender the world for every token.

Model streaming and UI rendering should be split:

```text
transport stream
  -> event buffer
  -> live preview strip updates cheaply
  -> transcript commits stable blocks
  -> virtualized message list renders visible rows
```

For project context:

- cache project map
- cache projections by file hash
- avoid rereading unchanged ranges
- collapse old tool output
- never attach full generated source unless explicitly requested

This is what keeps huge histories and large projects usable.

## 17. Safety And Recovery

Safety layers:

1. Workspace path boundary.
2. Permission policy.
3. Base-hash patches.
4. Undo journal.
5. Last-good project runtime.
6. Safe mode without project code.
7. Owner-scoped cleanup for generated panels/extensions.

Recovery commands:

```text
project.undoLastChange
project.restoreFile
project.reloadSafeMode
project.inspectLastError
project.disableOwner
project.clearSessionDrafts
```

Same-page project code is trusted once loaded. It is not a sandbox. Untrusted
future code should run in iframe/worker/sandbox adapters.

## 18. Implementation Plan

Phase 1: Workspace hardening

- Finalize project-wide workspace API.
- Remove remaining per-agent workdir concepts.
- Add undo journal and base-hash write checks.
- Ensure permission UI reflects allowed/failed states exactly.

Phase 2: Project map

- Add file scanner and map cache.
- Extract component registrations, panels, bus topics, operations, commands,
  layouts, descriptors, and data schemas.
- Add `project.describe`, `project.search`, and `project.readProjection`.

Phase 3: Project file tools

- Add read range, patch, create, delete, diff, changed files.
- Add large-file preview behavior.
- Add source projections for dynamic panels and file panels.

Phase 4: Context router

- Build prompt views from event log, selected refs, project map, exact ranges,
  recent diffs, and compacted tool results.
- Add token budget categories.
- Add full-source explicit opt-in.

Phase 5: Agent loop robustness

- Make tool-call continuation impossible to skip.
- Persist tool results before resume.
- Treat approval pending/resolved/failed as first-class states.
- Keep raw live preview for every model delta.

Phase 6: Domain tool pattern

- Add schema-first data editing helpers for GDE-style tables.
- Add examples for row patch, batch patch, whole table replacement, and
  validation.

Phase 7: Promotion workflow

- Promote session draft panels to project files.
- Update descriptor/layout.
- Reload and inspect.

Phase 8: Subagents

- Add read-only explore and review agents as internal sessions.
- Return summaries only.

## 19. Fit With Existing Architecture

This design fits AEditor because it does not replace the framework:

- Dock still owns layout.
- Panel still references registered components.
- Component factory remains the UI authoring contract.
- Bus remains the panel communication contract.
- Extension runtime remains the owner/lifecycle layer.
- Project runtime becomes the file-backed app layer.
- AI runtime becomes a project-aware code agent layer.

The result is simpler than the current mixed world:

```text
temporary UI draft when experimenting
real project files when keeping it
same component API in both places
same dock runtime everywhere
same workspace boundary for every agent
```

## 20. Final Verdict

This is the most balanced final form:

- Strong: can build real editors, panels, data tools, checks, and project
  modifications.
- Simple: one component model, one workspace, one context router, one tool set.
- Stable: event log, condensation, permissions, undo, last-good runtime.
- Efficient: project map and projections avoid full-source repetition.
- AI-friendly: the model learns one way to write UI and one way to edit files.

The implementation should optimize for this final shape only. Avoid temporary
parallel APIs, duplicate dynamic UI formats, or hidden special cases.
