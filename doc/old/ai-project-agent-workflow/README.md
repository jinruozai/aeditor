# AI Project Agent Workflow

This directory contains the research and final architecture for AEditor as a
project-aware AI coding editor.

The central decision:

> AEditor should treat AI coding as file-backed project work, not as long
> transient code blobs in chat.

Documents:

- [research.md](research.md) - research notes from mainstream coding agents and
  editor-integrated AI tools.
- [architecture.md](architecture.md) - final AEditor architecture proposal.

## Final Direction

AEditor keeps the current Dock / Panel / Component model as the UI runtime, and
adds one project-level agent layer above it:

```text
AEditor Shell
  project picker, permissions, title bar, global AI sessions

Project Workspace
  authorized local directory, descriptor, layout, source files, data files

Project Agent Runtime
  context router, file tools, patch tools, checks, project memory

AEditor Runtime
  dock tree, panels, UI components, bus, registry, AI references/operations
```

AI-created durable work should be written into the selected project directory:

```text
aeditor.project.json
layout.json
src/
  main.js
  panels/
  components/
  ai/
assets/
data/
AGENTS.md
```

Dynamic same-page panels remain useful for quick drafts. Once the user likes a
draft, AI promotes it into real project files and edits those files afterward.

## Non-Negotiables

1. One UI programming model: built-in panels, project panels, and AI-created
   panels use the same `aeditor.registerComponent` and `factory(propsSig, ctx)` shape.
2. One workspace boundary: all AI file reads and writes go through the selected
   project workspace.
3. One mutation protocol: code changes use patch/write/delete tools with hashes,
   previews, permission gates, and an undo journal.
4. One context strategy: the model receives a compact project map, exact file
   ranges, selected references, recent diffs, and checks. It does not receive
   whole projects or huge panel sources by default.
5. One recovery path: if generated project code fails, the host shell survives,
   keeps the last good project when possible, and exposes repair tools.

## Relationship To Existing Docs

- `doc/project-runtime-architecture.md` defines opening a directory as an
  AEditor project. This directory extends that idea with the agent workflow
  needed to modify that project well.
- `doc/extension-runtime-architecture.md` defines same-page factory panels and
  owner lifecycle. This design keeps it for drafts and session UI.
- `doc/ai-code-panel-architecture.md` remains relevant for quick dynamic panel
  creation, but durable project editing should use this file-backed workflow.
