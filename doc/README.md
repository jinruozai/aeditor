# AEditor Design

AEditor is a frontend editor framework with an optional AI host. The design has
one goal: keep the core concepts small, clear, and composable.

The framework itself has four layers:

```text
AEditor
+-- Core
+-- UI
+-- AI
`-- Extension
```

## Authority

Use documents in this order:

```text
AGENTS.md          current project state and hard rules
doc/*.md           current architecture, excluding doc/old
doc/current-gaps.md known implementation gaps and migration debt
doc/old/**         historical material only
```

Do not implement from files under `doc/old/` unless a current document
explicitly references one.

## Boundary Summary

| Area | Responsibility | Does Not Own |
| --- | --- | --- |
| Core | Shared infrastructure such as signals, log, bus, history, settings, commands, theme, i18n, and workspace adapters. | Editor business rules. |
| UI | Component registry, dock layout/runtime, toolbar records, theme consumption, and UI widgets. | AI execution or domain data semantics. |
| AI | Agents, chat, skills, providers, streaming, permissions, tools, context, operations, and targets. | Domain data models. |
| Extension | Package and load components, tools, context, operations, settings, commands, and styles. | A second registry model. |

## Core Principles

1. Keep the concept budget small.
   AEditor has four framework areas: Core, UI, AI, Extension. New features must
   fit one of these areas before adding new top-level vocabulary.

2. Names are structure.
   Dotted names such as `workspace.readFile`, `ui.createPanel`, and
   `gde.table.patchRows` are the only grouping mechanism for AI registries.

3. Modules contribute to the same AI registries.
   `workspace`, `theme`, `dock`, `ui`, and extensions expose AI-facing behavior
   by registering tools, context, or operations. There is no special per-module
   AI path.

4. AI has three extension points.
   Tools do work, context provides readable model context, and operations describe previewable
   changes.

5. The framework has no built-in project model.
   `workspace` is a Core module for bounded file access. Project semantics are
   outside AEditor framework.

6. Extensions package existing extension points.
   An extension does not create a parallel runtime. It registers components,
   tools, context, operations, settings, and commands through the same
   framework APIs.

7. Prefix is lifecycle.
   Dotted prefixes are identity, grouping, and uninstall boundaries. Metadata
   may describe entries, but it should not become a second lifecycle system.

8. Domain meaning stays outside Core.
   Game data tables, animation clips, asset databases, and scene graphs are not
   AEditor Core concepts.

## Document Map

- [architecture.md](./architecture.md): the full layer model.
- [core.md](./core.md): core infrastructure that already exists.
- [ui.md](./ui.md): component registry, dock layout/runtime, toolbar records, and UI library.
- [ai.md](./ai.md): AI host, tools, context, operations, targets, permissions.
- [ai-runtime.md](./ai-runtime.md): agents, skills, messages, queues, quests, live run state, persistence.
- [ai-context-compaction.md](./ai-context-compaction.md): context budgeting, semantic compaction, memory, and long-session request assembly.
- [ai-registries.md](./ai-registries.md): tools, context, references, operations, targets, and migration naming.
- [provider.md](./provider.md): connection, auth, transport, model, streaming.
- [workspace.md](./workspace.md): bounded file access.
- [extensions.md](./extensions.md): extension packaging and lifecycle.
- [implementation-map.md](./implementation-map.md): source-file coverage map for current implementation.
- [current-gaps.md](./current-gaps.md): current code that differs from the final shape and must be handled deliberately.
