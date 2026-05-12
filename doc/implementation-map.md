# Implementation Map

This map links current source files to the new design documents. It is a guard
rail for refactors: if a file is listed here, its implemented behavior should be
preserved or deliberately replaced.

## Core

| Source | Document | Notes |
| --- | --- | --- |
| `src/core/signal.js` | [core.md](./core.md) | Signals, effects, derived values, cleanup. |
| `src/core/log.js` | [core.md](./core.md) | Log stream, error reporting, safe call boundary. |
| `src/core/names.js` | [core.md](./core.md), [architecture.md](./architecture.md) | Dotted-prefix name matching helper. |
| `src/core/bus.js` | [core.md](./core.md) | Pub/sub communication. |
| `src/core/history.js` | [core.md](./core.md) | Generic history, transactions, undo/redo. |
| `src/core/theme.js` | [core.md](./core.md), [ui.md](./ui.md) | Theme mode and tokens. |
| `src/style/theme-settings.js` | [core.md](./core.md), [ui.md](./ui.md) | Theme module settings contribution. |
| `src/core/i18n.js` | [core.md](./core.md) | Language strings. |
| `src/core/settings.js` | [core.md](./core.md) | Settings sections, schemas, pages, persistence, prefix cleanup. |
| `src/core/commands.js` | [core.md](./core.md) | Commands, menus, and prefix cleanup. |
| `src/core/shortcuts.js` | [core.md](./core.md) | Shortcut infrastructure. |
| `src/core/workspace.js` | [workspace.md](./workspace.md) | Workspace adapters and path safety. |

## UI

| Source | Document | Notes |
| --- | --- | --- |
| `src/tree/tree.js` | [ui.md](./ui.md) | Immutable dock tree and pure layout functions. |
| `src/core/registry.js` | [ui.md](./ui.md) | Component registry and prefix cleanup. |
| `src/core/context.js` | [ui.md](./ui.md), [core.md](./core.md) | Component context and cleanup. |
| `src/dock/runtime.js` | [ui.md](./ui.md) | Dock runtime, panel materialization, and detached DOM. |
| `src/dock/render.js` | [ui.md](./ui.md) | Dock reconciliation and toolbar rendering. |
| `src/dock/interactions.js` | [ui.md](./ui.md) | Splitter, split, merge, drag hover. |
| `src/dock/panel-drag.js` | [ui.md](./ui.md) | Panel/tab drag and dock drop. |
| `src/dock/menu.js` | [ui.md](./ui.md) | Dock and tab menus. |
| `src/dock/migrate.js` | [ui.md](./ui.md) | Pop-out and cross-window migration. |
| `src/dock/layout.js` | [ui.md](./ui.md) | `createDockLayout`. |
| `src/ui/**` | [ui.md](./ui.md) | Generic UI component library and built-in generic panel components. |
| `src/style/**` | [ui.md](./ui.md) | Theme, dock, UI, AI, and settings styles. |

## AI Runtime

| Source | Document | Notes |
| --- | --- | --- |
| `src/ai/name-generator.js` | [ai-runtime.md](./ai-runtime.md) | Agent name generation. |
| `src/ai/store.js` | [ai-runtime.md](./ai-runtime.md), [ai-context-compaction.md](./ai-context-compaction.md), [ai-registries.md](./ai-registries.md) | Agents, messages, quests, permissions, persistence, memory, attachments. |
| `src/ai/compaction.js` | [ai-context-compaction.md](./ai-context-compaction.md), [ai-runtime.md](./ai-runtime.md) | Semantic compaction records, safe range planning, request filtering, and compaction context messages. |
| `src/ai/runtime.js` | [ai-runtime.md](./ai-runtime.md) | Scheduler, runs, resume, tool approval flow. |
| `src/ai/orchestration.js` | [ai-runtime.md](./ai-runtime.md) | Agent, quest, message tools. |
| `src/ai/request.js` | [ai-runtime.md](./ai-runtime.md), [ai-context-compaction.md](./ai-context-compaction.md), [ai-registries.md](./ai-registries.md) | Runtime prompt/context construction, attachments, and current budget fallback. |
| `src/ai/context.js` | [ai-runtime.md](./ai-runtime.md), [ai-registries.md](./ai-registries.md) | `ai.tools`/`ai.context` facades, skill registry, plugin hooks, and tool-call lifecycle. |
| `src/ai/skills.js` | [ai-runtime.md](./ai-runtime.md) | Built-in framework skills, including `aeditor.authoring`. |
| `src/ai/reference.js` | [ai-registries.md](./ai-registries.md) | Reference provider and operation protocol with prefix cleanup. |
| `src/ai/target.js` | [ai-registries.md](./ai-registries.md) | Add-to-chat targets, drag/drop, file targets. |
| `src/ai/rich-prompt.js` | [ai-registries.md](./ai-registries.md) | Inline references in prompt text. |
| `src/ai/change-set.js` | [ai-registries.md](./ai-registries.md) | Grouped review and apply/reject. |
| `src/ai/workdir.js` | [workspace.md](./workspace.md) | Workspace module tool contributions and preview/apply file writes. |

## Outside Framework Bundle

| Source | Document | Notes |
| --- | --- | --- |
| `demo/project.js` | [architecture-notes.md](./architecture-notes.md), [agent-workspace-editing.md](./agent-workspace-editing.md) | Demo-only workspace app loader and `demo.project.*` tools, intentionally outside `src/`. |

## Provider System

| Source | Document | Notes |
| --- | --- | --- |
| `src/ai/provider.js` | [provider.md](./provider.md) | Provider helper utilities and usage cost. |
| `src/ai/adapter.js` | [provider.md](./provider.md) | Request/response adapter and text tool protocol. |
| `src/ai/connection.js` | [provider.md](./provider.md) | Connection, auth driver, transport driver registries. |
| `src/ai/provider-auth.js` | [provider.md](./provider.md) | Built-in auth drivers. |
| `src/ai/provider-transports.js` | [provider.md](./provider.md) | Built-in transport drivers. |
| `src/ai/provider-connections.js` | [provider.md](./provider.md) | Built-in connections. |

## Extensions

| Source | Document | Notes |
| --- | --- | --- |
| `src/core/extensions.js` | [extensions.md](./extensions.md), [architecture-notes.md](./architecture-notes.md) | Extension install/review/recovery/dynamic UI. |

## AI Panels

| Source | Document | Notes |
| --- | --- | --- |
| `src/ai/panels/agents.js` | [ai-runtime.md](./ai-runtime.md), [ui.md](./ui.md) | AI module component for the agent list panel. |
| `src/ai/panels/rich-prompt-input.js` | [ai-registries.md](./ai-registries.md), [ui.md](./ui.md) | AI-owned `aeditor.ui.richPromptInput` helper for inline references. |
| `src/ai/panels/settings-ai.js` | [ai-runtime.md](./ai-runtime.md), [core.md](./core.md) | AI module settings contribution. |
| `src/ai/panels/chat.js` | [ai-runtime.md](./ai-runtime.md), [ai-registries.md](./ai-registries.md) | AI module component for chat input. |
| `src/ai/panels/transcript.js` | [ai-runtime.md](./ai-runtime.md) | AI module component for message transcript. |
| `src/ai/panels/chat-combined.js` | [ai-runtime.md](./ai-runtime.md) | AI module component for combined chat. |
| `src/ai/panels/message-live-strip.js` | [ai-runtime.md](./ai-runtime.md), [provider.md](./provider.md) | AI module component for live run preview. |
| `src/ai/panels/message-virtualizer.js` | [ai-runtime.md](./ai-runtime.md) | Transcript rendering performance. |
