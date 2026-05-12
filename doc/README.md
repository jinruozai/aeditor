# AEditor Design

AEditor is a zero-dependency frontend editor framework with optional upper
layers. The design goal is not to become a large IDE platform by default; it is
to keep a small framework core that can host powerful editor and AI workflows
when a host application opts in.

```text
AEditor Core/UI             stable framework kernel
AEditor AI Host             optional agent/runtime layer
AEditor Extension Runtime   optional packaging/lifecycle layer
Host Adapters               privileged bridges owned by the host app
```

Applications built with AEditor, including Demo Project Runtime, sit outside
the framework. They may load workspace files, register components, and mount
panels, but they are examples of host code rather than AEditor architecture.

## Authority

Use documents in this order:

```text
AGENTS.md          current repo state, operating rules, and hard constraints
doc/README.md      current architecture index and boundary contract
doc/*.md           current architecture, excluding doc/old
doc/old/**         historical material only
```

Do not implement from files under `doc/old/` unless a current document
explicitly references one.

## Boundary Summary

| Area | Responsibility | Does Not Own |
| --- | --- | --- |
| Core | Shared infrastructure: signals, log, bus, history, settings, commands, theme, i18n, and workspace contracts. | Editor business rules or product project formats. |
| UI | Component registry, dock layout/runtime, toolbar records, UI widgets, and theme consumption. | AI execution or domain data semantics. |
| AI Host | Agents, providers, streaming, permissions, tools, context references, operations, ChangeSet, compaction, and memory. | Product data models or hidden host privileges. |
| Extension Runtime | Package, review, install, disable, and uninstall contributions through existing registries. | A second component/tool/context model. |
| Host Adapters | File-system bridges, provider transports, git, verification, and other privileged integrations. | Framework policy bypasses. |

Domain-specific editors, demos, project loaders, app menus, app shortcuts, and
workflow decisions are host code. They use AEditor; they are not AEditor layers.

## Core Principles

1. Keep the concept budget small.
   Public architecture has four framework areas: Core, UI, optional AI Host, and
   optional Extension Runtime. Host apps sit outside the framework.

2. Names are structure.
   Dotted names such as `workspace.readFile`, `ui.setProp`, and
   `gde.table.patchRows` are the grouping and lifecycle boundary for registries.

3. Modules contribute to the same AI registries.
   `workspace`, `theme`, `dock`, `ui`, extensions, and domain modules expose
   model-facing behavior by registering tools, context references, or
   operations. There is no per-module AI path.

4. AI exposes five public concepts.
   Agent, Tool, Context Reference, Operation, and ChangeSet are the model
   developers need. Targets, attachments, rich prompt ranges, quests, inboxes,
   bundles, and templates are runtime or UX details.

5. The framework has no built-in project model.
   `workspace` is bounded file access. Project descriptors, file loaders, and
   domain schemas belong to host apps.

6. Extensions package existing extension points.
   An extension installs contributions into normal registries and removes them
   by prefix. It does not create a parallel runtime.

7. Permission is a single resolver.
   Tools, operations, ChangeSet apply, workspace writes, extension install, and
   host-adapter calls all pass through the same permission decision model.

8. Versioned apply is mandatory for mutable resources.
   Previews bind to resource versions. Apply uses compare-and-set; stale
   previews must re-preview or rebase.

9. Domain meaning stays outside Core.
   Game data tables, animation clips, asset databases, scene graphs, and demo
   projects are host/domain concepts.

## Document Map

- [architecture.md](./architecture.md): full layer model and naming rules.
- [core.md](./core.md): core infrastructure that already exists.
- [ui.md](./ui.md): component registry, dock layout/runtime, toolbar records, and UI library.
- [ai.md](./ai.md): optional AI Host and the public AI concept model.
- [ai-runtime.md](./ai-runtime.md): agents, skills, messages, queues, live run state, compaction, and persistence.
- [ai-permission-policy.md](./ai-permission-policy.md): unified permission resolver, audit, and always-allow policy.
- [ai-context-compaction.md](./ai-context-compaction.md): context budgeting, semantic compaction, memory, and long-session request assembly.
- [ai-registries.md](./ai-registries.md): concrete registry APIs and current implementation notes.
- [provider.md](./provider.md): connection, auth, transport, model, streaming, and reliability contract.
- [workspace.md](./workspace.md): bounded file access and workspace tool contribution.
- [resource-versioning.md](./resource-versioning.md): resource versions, CAS apply, and conflict handling.
- [agent-workspace-editing.md](./agent-workspace-editing.md): recommended file-first agent workflow for demo workspace code edits.
- [extensions.md](./extensions.md): extension packaging, trust tiers, and lifecycle.
- [implementation-map.md](./implementation-map.md): source-file coverage map for current implementation.
- [architecture-notes.md](./architecture-notes.md): intentional implementation notes for review-sensitive areas.
