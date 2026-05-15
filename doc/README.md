# AEditor Design

AEditor is a zero-dependency frontend editor framework with optional upper
layers. Its goal is simple: keep the kernel small, then let host apps build
powerful editors and AI workflows on top of that small kernel.

```text
AEditor Kernel              core services, component registry, tree, dock runtime
AEditor UI                  optional widget and built-in panel layer
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
doc/old/**         archived reference only
```

Do not implement from files under `doc/old/` unless a current document
explicitly references one.

## Boundary Summary

| Area | Responsibility | Does Not Own |
| --- | --- | --- |
| Kernel | Shared infrastructure: signals, log, bus, history, settings, commands, theme, i18n, workspace contracts, component registry, dock tree, and dock runtime. | Editor business rules, product project formats, or widget catalog breadth. |
| UI | `aeditor.ui.*` widgets, settings UI, built-in tab/log panel components, and theme consumption. | AI execution or domain data semantics. |
| AI Host | Agents, providers, streaming, permissions, tools, context references, operations, ChangeSet, compaction, and memory. | Product data models or hidden host privileges. |
| Extension Runtime | Package, review, install, disable, and uninstall contributions through existing registries. | A second component/tool/context model. |
| Host Adapters | File-system bridges, provider transports, git, verification, and other privileged integrations. | Framework policy bypasses. |

Domain-specific editors, demos, project loaders, app menus, app shortcuts, and
workflow decisions are host code. They use AEditor; they are not AEditor layers.

## Distribution Contract

The repository may contain source, tests, demos, internal handoff files, and
archived notes. The published runtime package should stay small and public:

```text
dist/aeditor-core.js
dist/aeditor-core.css
dist/aeditor-full.js
dist/aeditor-full.css
dist/aeditor-kernel.js
dist/aeditor-kernel.css
dist/aeditor-ui.js
dist/aeditor-ui.css
dist/aeditor-ai.js
dist/aeditor-ai.css
dist/aeditor.js
dist/aeditor.css
README.md
LICENSE
```

Internal coordination files such as `AGENTS.md` and `CLAUDE.md`, source tests,
screenshots, tools, demos, and `doc/old/**` are repository material, not npm
runtime package contents.

Optional layers must be optional in distribution as well as in architecture. The
runtime distribution should provide:

```text
aeditor-kernel    Core services + tree + dock runtime
aeditor-ui        UI widget and built-in panel add-on
aeditor-ai        AI Host + Extension Runtime add-on
aeditor-core      classic Kernel + UI bundle
aeditor-full      Kernel + UI + AI Host + Extension Runtime
```

Host apps that only need dock layout should be able to load the kernel bundle.
Apps that need the classic UI framework can load `aeditor-core` without AI,
extension runtime, AI panels, or AI-specific styles.

## Core Principles

1. Keep the concept budget small.
   Public architecture has Kernel, UI, optional AI Host, and optional Extension
   Runtime. Host apps sit outside the framework.

2. Names are structure.
   Dotted names such as `workspace.readFile`, `ui.setProp`, and
   `gde.table.patchRows` are the public grouping shape for registries. Owner
   metadata is used when an installed extension needs exact lifecycle cleanup.

3. Modules contribute to the same AI registries.
   `workspace`, `theme`, `dock`, `ui`, extensions, and domain modules expose
   model-facing behavior by registering tools, context references, or
   operations. There is no per-module AI path.

4. AI exposes five action/context concepts.
   Agent, Tool, Context Reference, Operation, and ChangeSet are the model
   developers need for work. Skills are behavior profiles. Targets,
   attachments, rich prompt ranges, quests, inboxes, bundles, and templates are
   runtime or UX details.

5. The framework has no built-in project model.
   `workspace` is bounded file access. Project descriptors, file loaders, and
   domain schemas belong to host apps.

6. Extensions package existing extension points.
   An extension installs contributions into normal registries and removes its
   owner from those registries. It does not create a parallel runtime.

7. Permission is one resolver.
   Tools, operations, ChangeSet apply, workspace writes, extension install, and
   host-adapter calls all pass through the same actor/target/scope decision
   model. Context and reference reads are not a bypass.

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
- [ai-context-assembly.md](./ai-context-assembly.md): budgeted request context layers and model-facing context order.
- [ai-context-compaction.md](./ai-context-compaction.md): context budgeting, semantic compaction, memory, and long-session request assembly.
- [ai-registries.md](./ai-registries.md): concrete registry APIs and current implementation notes.
- [provider.md](./provider.md): connection, auth, transport, model, streaming, and reliability contract.
- [workspace.md](./workspace.md): bounded file access and workspace tool contribution.
- [workspace-precise-editing.md](./workspace-precise-editing.md): search/read/exact-edit workflow for safe code mutation.
- [resource-versioning.md](./resource-versioning.md): versioned mutation contract, CAS apply, and conflict handling.
- [agent-workspace-editing.md](./agent-workspace-editing.md): recommended file-first agent workflow for demo workspace code edits.
- [extensions.md](./extensions.md): extension packaging, trust tiers, and lifecycle.
- [skill/aeditor-authoring/SKILL.md](./skill/aeditor-authoring/SKILL.md): copyable AI skill for authoring AEditor components, panels, dock layouts, AI contributions, and extensions.
- [implementation-map.md](./implementation-map.md): source-file coverage map for current implementation.
- [architecture-notes.md](./architecture-notes.md): intentional implementation notes for review-sensitive areas.
