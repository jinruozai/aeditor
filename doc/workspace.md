# Workspace

## Definition

A workspace is a bounded file access surface.

It can be backed by:

```text
File System Access API
local bridge
memory files
remote adapter
test fixture
```

A workspace is not a project model. It only answers file operations inside an
authorized root.

When no workspace is bound, `workspace.*` tools are unavailable to the model.
Hosts may choose a memory workspace as an explicit default, but an implicit
memory disk should not be created behind the user's back.

## Core API

```js
aiditor.workspace.openDirectory(options)
aiditor.workspace.restoreDirectory(key, options)
aiditor.workspace.saveDirectoryHandle(key, handle)
aiditor.workspace.fromHandle(handle)
aiditor.workspace.fromBridge(root)
aiditor.workspace.memory(files)
```

Utility helpers in the workspace module may normalize relative paths, hash text,
derive parent paths, and build safe previews. Those helpers support file tools
and adapters; they do not create a project concept.

Implemented helpers include `normalizePath`, `parentPath`, `hashText`,
`diffSummary`, `validateText`, `applyLinePatches`, and `applyTextEdits`.

Each workspace adapter should expose:

```js
workspace.rootId()
workspace.kind()
workspace.list(path)
workspace.search(query, options)
workspace.read(path)
workspace.write(path, text, options)
workspace.patch(path, baseHash, patches)
workspace.delete(path)
workspace.stat(path)
workspace.resolveUrl(path)
```

`watch(path, handler)` may exist when the backend can support it, but the rest of
the system must not require watching.

## Tool Contributions

`workspace` is a Core module, not an AI concept. Like any other module, it may
contribute tools to the AI tool registry. The standard workspace tool prefix is
`workspace.*`:

```text
workspace.listFiles
workspace.fileSummary
workspace.searchFiles
workspace.readFile
workspace.readFileRange
workspace.editFile
workspace.writeFile
workspace.patchFile
workspace.deleteFile
workspace.stat
```

These are ordinary AI tools backed by the current workspace adapter. They are
generic and do not know product descriptors, table schemas, panel registrations,
or build scripts.

Mutating tools (`workspace.editFile`, `workspace.writeFile`,
`workspace.patchFile`, and `workspace.deleteFile`) expose preview/apply phases
so the runtime can review and permission-check writes before applying them.
Their direct `run` functions
remain available for trusted local callers and tests, but model-facing flows
should use preview/apply.

`workspace.editFile`, `workspace.writeFile`, and `workspace.patchFile` validate
JS and JSON before commit. JSON must parse. JS must not contain known truncation
markers, unterminated strings/comments, or unbalanced braces; classic non-module
scripts also receive a syntax parse check. A failed validation leaves the
previous file unchanged. This keeps interrupted provider output from corrupting
workspace files.

Preview reads the current file and returns the same diff summary shape that
apply returns:

```text
before/after hash
before/after size and line count
changed start line
added/removed line count
```

That makes approval UI and autonomous full-access runs inspect the proposed file
change before it is applied.

## Versions And Conflicts

Workspace files use content hashes as `ResourceVersion` values. Any write,
patch, or delete preview records the base hash it inspected. Apply must compare
that base hash with the current file hash before committing.

```text
preview(file@hashA) -> proposed diff with base hashA
apply(diff, file current hashA) -> commit and return hashB
apply(diff, file current hashC) -> stale preview, reject and re-preview
```

This is not a workspace-only rule. Dock trees, settings, extension registries,
and other mutable surfaces use the same versioned-apply model described in
[resource-versioning.md](./resource-versioning.md).

## AI Runtime Binding

The AI runtime may bind one active workspace so `workspace.*` tool calls know
which adapter to use:

```js
aiditor.ai.setWorkspace(workspace, meta)
aiditor.ai.clearWorkspace()
aiditor.ai.selectWorkspaceDirectory(options)
aiditor.ai.currentWorkspace()
aiditor.ai.workspaceMeta()
aiditor.ai.workspaceLabel()
aiditor.ai.workspaceVersion()
```

This binding is not a second workspace API and not a project model. It is only
the runtime's current file boundary for `workspace.*` tools. If no file access
is needed, leave it empty.

## Domain Tools

Domain-level file handling should be exposed as domain tools outside Core:

```text
gde.table.readSchema
gde.table.patchRows
gde.asset.rename
ani.timeline.readClip
ani.timeline.patchKeys
```

Those tools can use the active workspace internally, but their names and schemas
belong outside Core. There is still only one AI tool registry.

Verification is also adapter-backed, not a workspace responsibility. Hosts that
can run checks may register `verify.*` tools with
`aiditor.ai.configureVerify(adapter)`. The workspace module still only provides
bounded file access.

The bundled local bridge can provide this adapter over `/verify/*`, but it is
still a host concern: bridge commands run in an explicitly allowed local working
directory, never from framework code.

Local bridges, git, verify, and command runners are host adapters. They must
declare allowed roots, timeouts, output limits, command policy, and audit fields.
The framework consumes their contract; it does not treat them as ordinary
browser workspace APIs.

The Aiditor demo uses this pattern for workspace-backed UI generation. See
[agent-workspace-editing.md](./agent-workspace-editing.md): agents write
workspace files, reload the demo workspace app, and add panels by registered
component name.

## Safety Rules

1. All workspace paths are relative to the workspace root.
2. Writes require permission.
3. Patches require `baseHash` for existing content.
4. Deletes are separate from writes.
5. Large reads should use search or range reads first.
6. Workspace adapters enforce the boundary. Tools should not accept absolute
   paths.
7. Existing source files should usually be changed with `workspace.editFile`:
   search, read the exact range, then replace a unique `oldText` with
   `baseHash`. See [workspace-precise-editing.md](./workspace-precise-editing.md).
8. Full-file writes are for complete new files or deliberate replacement.
9. Line patches are an escape hatch for mechanical edits and must still use
   `baseHash`.
