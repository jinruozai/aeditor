# AI Workflow

Load this reference when the task touches AEditor AI Host behavior or asks an
agent to modify editor source code.

## Concepts

AEditor AI Host keeps the model-facing concept set small:

```text
Agent       runtime identity and transcript
Tool        executable action
Context     readable model context or reference
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
mount registered component name
```

Do not ask tools to create panels from source strings. A panel should reference
an already registered component.

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

The full bundle includes `aeditor.authoring`. It tells agents to:

- write plain JavaScript AEditor components;
- avoid React, TSX, JSX, import/export, and TypeScript syntax in zero-build
  projects;
- prefer `aeditor.ui.*`;
- use workspace-backed precise edits;
- mount by registered component name.

Host apps may add domain-specific skills. Domain skills should explain project
data and workflows, not create private tool systems.

## Review And Apply

For mutable resources:

1. Preview against a resource version.
2. Show the diff or effect.
3. Apply with compare-and-set semantics.
4. If the resource changed, re-preview or rebase.

Never silently apply stale previews.
