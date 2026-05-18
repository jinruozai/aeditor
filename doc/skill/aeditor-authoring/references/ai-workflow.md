# AI Workflow

Load this reference when the task touches AEditor AI Host behavior or asks an
agent to modify editor source code.

## Concepts

AEditor AI Host keeps the model-facing concept set small:

```text
Agent       runtime identity and transcript
Tool        executable action
Reference   stable pointer to bounded readable context
Operation   preview/apply mutation
ChangeSet   grouped review and apply
Skill       behavior guidance, not an action channel
```

Tools, operations, ChangeSet apply, workspace writes, extension install, and
host-adapter calls all go through the unified permission resolver.

## Workspace-Backed Editing

Durable UI authoring should edit files:

```text
search/map files
read exact current content
edit with base hash and exact old text
verify syntax/build
inspect docks
mount registered component name into a returned dock id, passing path for new files
```

Do not ask tools to create panels from source strings. A panel should reference
an already registered component.

When placing a panel, do not hand-write layout JSON and do not guess dock names.
Call `aeditor.inspectDocks`, choose a returned `dockId` from its position,
size, and existing panels, then call `aeditor.addPanelToDock` with that dock id
and the component name. If the component was just written to the workspace,
include its `path` so the runtime loads the script before placing the panel.
If `path` is omitted, the tool tries to infer one unique matching JS file and
asks for an explicit retry when the match is missing or ambiguous.
When replacing an existing panel, call `aeditor.replacePanel` with the returned
`panelId`; it uses the same component/path/title/icon/props parameters as
`addPanelToDock` and keeps the dock position.
After editing the file for the same mounted component, call
`aeditor.reloadPanel` with `panelId` and `path`; it keeps the same panel id and
rebuilds the component runtime. Do not use `replacePanel` as a refresh shortcut.
Layout persistence is a separate host/save concern.

## Registry Shape

Use dotted names for public grouping:

```js
aeditor.ai.tools.register('workspace.readFile', tool)
aeditor.ai.context.register('workspace.summary', provider)
aeditor.ai.references.register('file', provider)
aeditor.ai.operations.register('workspace.editFile', operation)
aeditor.ai.skills.register('domain.authoring', skill)
```

Default registry behavior rejects duplicate names. Replace only through an
explicit replacement path provided by the registry or host.

## Authoring Skill

`aeditor-ai` and `aeditor-full` include focused AEditor skills:

```text
aeditor.runtime-authoring
aeditor.library-authoring
aeditor.authoring
```

`aeditor.runtime-authoring` tells live editor agents to:

- write plain JavaScript AEditor components;
- avoid React, TSX, JSX, import/export, and TypeScript syntax in zero-build
  projects;
- prefer `aeditor.ui.*`;
- use `aeditor.ui.propertyForm` for local schema forms and `aeditor.inspector`
  providers for shared selection inspection;
- use workspace-backed precise edits;
- inspect docks before mounting by registered component name.
- reload the same mounted panel with `aeditor.reloadPanel` after editing its
  component file.

`aeditor.library-authoring` is for repository or host-app code that uses
AEditor as a library. `aeditor.authoring` remains as a compatibility umbrella.

Host apps may add domain-specific skills. Domain skills should explain project
data and workflows, not create private tool systems.

## Review And Apply

For mutable resources:

1. Preview against a resource version.
2. Show the diff or effect.
3. Apply with compare-and-set semantics.
4. If the resource changed, re-preview or rebase.

Never silently apply stale previews.
