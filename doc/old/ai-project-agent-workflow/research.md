# Research: Mainstream AI Coding Agent Workflows

This document summarizes what is worth borrowing from modern AI coding tools
for AIditor. The goal is not to copy any one project. The goal is to distill
the mechanics that make AI modify real projects reliably.

Primary sources:

- OpenCode docs: [tools](https://opencode.ai/docs/tools/),
  [agents](https://opencode.ai/docs/agents/),
  [permissions](https://opencode.ai/docs/permissions/),
  [rules](https://opencode.ai/docs/rules/),
  [custom tools](https://opencode.ai/docs/custom-tools/)
- Aider docs: [repository map](https://aider.chat/docs/repomap.html)
- Cline docs: [what is Cline](https://docs.cline.bot/getting-started/what-is-cline),
  [adding context](https://docs.cline.bot/core-workflows/working-with-files)
- OpenHands docs: [SDK architecture](https://docs.openhands.dev/sdk/arch/overview),
  [workspace](https://docs.openhands.dev/sdk/arch/workspace),
  [context condenser](https://docs.openhands.dev/sdk/arch/condenser),
  [skills](https://docs.openhands.dev/overview/skills)
- Claude Code docs: [subagents](https://code.claude.com/docs/en/sub-agents),
  [permissions](https://code.claude.com/docs/en/agent-sdk/permissions)
- OpenAI Codex CLI help: [getting started and approval modes](https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-tarted)

## 1. Shared Pattern

The mature pattern is surprisingly consistent:

```text
project root
  -> project rules and config
  -> searchable file map / symbol map / docs map
  -> exact file reads or range reads
  -> patch/write tools with permission gates
  -> run checks
  -> summarize only what matters back into conversation
```

The best tools do not try to make the model remember the whole project. They
make the model ask for the right slices.

## 2. OpenCode

OpenCode is useful for us because it is close to the terminal-agent shape we
want inside AIditor.

Important observations:

- It separates primary agents from subagents. Build can edit, Plan is
  restricted, Explore is read-only, Scout is for external research, and hidden
  agents handle compaction, titles, and summaries.
- Tool permission is the primary control surface. The same permission key gates
  related operations, for example edit covers edit/write/apply_patch.
- It has project-level rules via `AGENTS.md`, project config, markdown-defined
  agents, custom tools, MCP servers, and LSP support.
- Its built-in tools are project-shaped: read, grep, glob, edit, write,
  apply_patch, bash, LSP, todo, web fetch/search, question.
- It supports granular patterns such as allowing `git status` while asking for
  broader `git *`, and treats external directories as a separate permission.

What AIditor should borrow:

- Agent modes should be permission profiles, not separate implementations.
- Project rules should live in the project directory and be loaded every time.
- All file paths in tools should be relative to the selected project root.
- Read-only exploration must be cheap and encouraged before writes.
- Tool calls need typed results and enough UI observability that the user can
  see whether the agent is exploring, patching, checking, or blocked.

What AIditor should not copy directly:

- A terminal-first UI. AIditor should use panels, dock state, selected UI
  references, and live previews as first-class context.
- A separate extension format for project UI. Our UI runtime already has one
  component model.

## 3. Aider

Aider's key contribution is the repository map. It sends a compact view of the
repository containing files, important symbols, and critical definition lines.
This gives the model architectural awareness without sending every file.

What AIditor should borrow:

- Maintain a cheap project map that includes files, component registrations,
  panel ids, bus topics, operations, references, exports, and important symbols.
- Send the map by default, but keep it compact and budgeted.
- Let the model request exact ranges after it finds the relevant file.

What AIditor should adapt:

- Editor projects contain non-code artifacts: layout trees, panel descriptors,
  data tables, assets, themes, and domain resources. The project map must cover
  both code and editor resources.

## 4. Cline

Cline emphasizes direct editor context and explicit user-chosen context. Its
docs recommend adding files, folders, problems, terminal output, git changes,
URLs, and drag/drop references through the chat UI.

What AIditor should borrow:

- "Right context, not more context" should be a product rule.
- `add to chat` should feed structured references, not pasted text only.
- The user must be able to attach selected panels, selected table rows, current
  errors, console output, git diffs, and screenshots as typed context.
- The context UI should reveal what the agent knows and what it is missing.

What AIditor should adapt:

- AIditor has richer runtime objects than a normal code editor: docks, panels,
  UI components, property rows, selected resources, and domain data. Context
  should preserve these types so tools can modify them precisely.

## 5. OpenHands

OpenHands is most useful as a systems architecture reference.

Important observations:

- It separates SDK, tools, workspace implementations, and agent server.
- Workspace abstracts local, remote, and sandboxed execution while exposing
  command execution and file operations.
- The agent uses a typed reasoning/action loop with events, tools, workspaces,
  security policies, and a condenser.
- The condenser compresses long event histories by keeping key head/tail events
  and summarizing middle history.
- Skills are split into always-on repository context and optional on-demand
  skills that reveal full content only when needed.

What AIditor should borrow:

- Workspace must be an adapter. Browser File System Access, local bridge, memory
  tests, and possible future sandboxed execution should share one interface.
- Conversation history should be an event log. The prompt is a view over that
  log, not the log itself.
- Context compression must preserve goals, decisions, touched files, current
  plan, diffs, failing checks, and unresolved questions.
- Optional skills are a better fit than stuffing every guideline into the system
  prompt.

What AIditor should avoid:

- A backend-first architecture as the only path. AIditor must still work as a
  local frontend editor where possible.

## 6. Claude Code / Codex CLI

Claude Code and Codex CLI reinforce two points that matter to us:

- Permission modes are product-level primitives. Suggest/read-only, auto-edit,
  and full-auto/full-access are different user trust states.
- Subagents or side workers are useful when exploration would flood the main
  conversation. They keep high-volume reads, logs, and search results out of the
  main context and return compact summaries.

What AIditor should borrow:

- Permission evaluation must be deterministic: deny rules first, then mode, then
  allow rules, then runtime approval.
- Subagents should have independent context windows, tool scopes, and summaries.
- Full access should mean no approval UI for operations already allowed by the
  active policy. Failed operations should not present Apply buttons.

## 7. Common Failure Modes

The failures we have seen in AIditor match common agent pitfalls:

1. The model sees too much generated source and loses the exact contract.
2. It receives runtime failure after the fact but has no structured repair loop.
3. It modifies UI by huge blobs instead of small patches.
4. Tool results are appended forever, creating repeated and stale context.
5. Permission state is split between UI, transport, and operation runtime.
6. Dynamic code is not inspected through the same file/search/check loop as
   normal project code.
7. The UI does not clearly show whether the model is silent, streaming,
   thinking, running a tool, waiting for approval, or failed.

## 8. Research Verdict

The strongest architecture for AIditor is not a larger prompt. It is a smaller
and sharper runtime:

```text
project workspace
+ project map
+ typed context attachments
+ exact range reads
+ base-hash patches
+ deterministic permissions
+ event-log condensation
+ checks and panel inspection
+ file-backed UI components
```

This is simpler than keeping many parallel dynamic UI formats, and stronger
than only generating panels in memory.
