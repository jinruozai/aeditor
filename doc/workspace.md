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

## Core API

```js
aeditor.workspace.openDirectory(options)
aeditor.workspace.fromHandle(handle)
aeditor.workspace.fromBridge(root)
aeditor.workspace.memory(files)
```

Utility helpers in the workspace module may normalize relative paths, hash text,
derive parent paths, and build safe previews. Those helpers support file tools
and adapters; they do not create a project concept.

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
workspace.searchFiles
workspace.readFile
workspace.readFileRange
workspace.writeFile
workspace.patchFile
workspace.deleteFile
workspace.stat
```

These are ordinary AI tools backed by the current workspace adapter. They are
generic and do not know product descriptors, table schemas, panel registrations,
or build scripts.

## AI Runtime Binding

The AI runtime may bind one active workspace so `workspace.*` tool calls know
which adapter to use:

```js
aeditor.ai.setWorkspace(workspace, meta)
aeditor.ai.clearWorkspace()
aeditor.ai.selectWorkspaceDirectory(options)
aeditor.ai.currentWorkspace()
aeditor.ai.workspaceMeta()
aeditor.ai.workspaceLabel()
aeditor.ai.workspaceVersion()
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

## Safety Rules

1. All workspace paths are relative to the workspace root.
2. Writes require permission.
3. Patches require `baseHash` for existing content.
4. Deletes are separate from writes.
5. Large reads should use search or range reads first.
6. Workspace adapters enforce the boundary. Tools should not accept absolute
   paths.
