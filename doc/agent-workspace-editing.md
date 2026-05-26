# Agent Workspace Editing

This document describes the recommended workflow for agents that edit files
through AIditor. The framework has no project concept: it only knows registered
tools, a bounded workspace, and optional host adapters.

## Principle

AIditor framework stays simple:

```text
component registry -> panel data references component name -> dock runtime mounts component
```

Agents must not create UI by passing large code strings into a tool call.
Editor UI is normal workspace code:

```text
write component file -> add panel by component name, loading the file when needed
```

The workspace-backed path is the only agent authoring path. Agents write or
patch files first, then call `aiditor.addPanelToDock` with the registered
component name. If the component file has not been loaded yet, pass its
workspace `path`; the runtime loads it before placing the panel. If `path` is
omitted, the tool attempts to infer one unique matching JS file and uses that;
ambiguous or missing matches are reported as retry errors.

## Framework Tool Groups

All coding abilities are ordinary `aiditor.ai.tools` entries. There is no second
permission model and no capability layer.

```text
workspace.*  bounded file IO
code.*       compact code context over workspace files
git.*        optional host-provided git adapter
verify.*     optional host-provided verification adapter
```

`workspace.*` is the file boundary. It can list, summarize, search, read ranges,
edit by exact replacement, write, patch, delete, and stat files. Mutating tools
return a diff summary with before and after hashes, changed line range, and
size/line counts.
Their preview phase also returns this summary, so file edits are reviewable
before apply.

`code.*` is context shaping, not a business parser. It reads workspace files and
returns compact outlines: symbols, call names, and event/registration-looking
lines. It helps the model decide what to read next without loading whole files.

`git.*` is optional. A host may call `aiditor.ai.configureGit(adapter)` to expose
status, diff, log, show, stage, restore, and commit through the same tool
registry. AIditor does not run shell commands itself.

`verify.*` is optional. A host may call `aiditor.ai.configureVerify(adapter)` to
expose list, run, and diagnostics tools through the same registry. AIditor does
not run tests, shell commands, linters, or typecheckers itself; it only calls the
host adapter when present.

The local bridge exposes matching HTTP endpoints:

```text
GET  /verify/list
POST /verify/run
GET  /verify/diagnostics
POST /verify/diagnostics
```

By default it reads `package.json` in the bridge working directory and exposes
common npm scripts such as `check`, `check:dist`, `test`, `lint`, and
`typecheck`. Hosts can override the working directory and allowed roots with
`AIDITOR_VERIFY_CWD` and `AIDITOR_VERIFY_ROOTS`, or provide explicit checks with
`AIDITOR_VERIFY_CHECKS`.

Permissions are unchanged:

```text
tool.call   read/preview/run phase
tool.apply  mutating apply phase
```

Full access, custom approval, and always-allow behavior all continue to flow
through the existing AI tool permission resolver.

## Host/Demo Mounting

The framework does not know how a workspace app loads source files. A host or
demo can define its own tools on top of the same registry:

```text
demo.project.readDescriptor
demo.project.inspectPanel
demo.project.runCheck
gde.table.patchRows
ani.timeline.insertKeyframes
```

Those tools are domain-specific. They must not leak into framework APIs.

The AIditor demo also wires its project `check` hook into the optional
`verify.*` adapter. That keeps model guidance generic: after editing files, the
agent can call `verify.run` when available instead of learning a second
demo-only check path.

When the demo opens a project, it binds that project's workspace as the active
AI workspace. Agents should therefore use the generic `workspace.*` and `code.*`
tools for file editing/context. `demo.project.*` stays as host-specific glue:
the normal model request sees only descriptor/source projection, panel health,
and project check tools. Lower-level demo project tools remain registered for
host code, but hidden from the model by default.

If no project/workspace is open, workspace-backed authoring is unavailable.
The request builder hides `workspace.*`, `code.*`, and `demo.project.*` tools in
that state. The agent should tell the user to open or select a workspace project
instead of retrying the same goal through low-level extension or dock tools.

## Durable Panel Workflow

For the current demo, a durable panel flow is:

1. Inspect the open workspace app:

```text
demo.project.readDescriptor
workspace.searchFiles
code.outline
demo.project.readSource
```

2. Write or patch the component file.

Project panel files register components through the demo loader:

```js
;(function (aiditor, Demo) {
  'use strict'

  Demo.project.component('sample.panel', {
    defaults: function () {
      return { title: 'Sample Panel', icon: 'box', props: {} }
    },
    factory: function (propsSig, ctx) {
      const root = document.createElement('div')
      root.style.cssText = 'height:100%;min-height:0;box-sizing:border-box;display:flex;flex-direction:column;'
      const scroll = aiditor.ui.view({ children: [] })
      scroll.style.flex = '1 1 auto'
      scroll.style.minHeight = '0'
      root.appendChild(scroll)
      return root
    },
    dispose: function (el) {
      if (aiditor.ui && aiditor.ui.dispose) aiditor.ui.dispose(el)
    },
  })
})(window.aiditor = window.aiditor || {}, window.Demo = window.Demo || {})
```

3. Add the registered component to a runtime dock:

```text
aiditor.inspectDocks({})

aiditor.addPanelToDock({
  dock: "dock id returned by inspectDocks",
  component: "sample.panel",
  path: "src/panels/sample.panel.js",
  title: "Sample Panel",
  icon: "box"
})

aiditor.replacePanel({
  panelId: "panel id returned by inspectDocks",
  component: "sample.panel",
  path: "src/panels/sample.panel.js",
  title: "Sample Panel",
  icon: "box"
})
```

`path` is only needed for newly written or not-yet-loaded workspace scripts.
Use `replacePanel` when the user asks to turn one existing panel into another;
it keeps the dock position and creates a fresh panel instance id.
`aiditor.inspectDocks` returns the current dock ids, viewport rects, active
panels, and panel summaries. Choose a returned `dockId` from that runtime state;
do not guess names such as `main`, and do not hand-write layout JSON. Runtime
panel placement and later layout persistence are separate host concerns.

4. Verify:

```text
demo.project.inspectPanel
demo.project.runCheck
verify.run
verify.diagnostics
```

## Context Strategy

Keep model context small and exact:

```text
map/search first -> read outlines/ranges -> exact edit with baseHash -> reload/check
```

Use full file reads only for small files or when exact rewrite context is
required. For larger code, prefer:

```text
code.map(...)
workspace.fileSummary(...)
code.outline(...)
workspace.searchFiles(...)
workspace.readTextRange(...)
workspace.editText(...)
workspace.patchText(...)
demo.project.readSource({ projection: "outline" })
demo.project.readSource({ projection: "events" })
```

For existing source files, prefer `workspace.editText`: copy `oldText` from a
recent `readTextRange` result and include that file hash as `baseHash`.
`workspace.patchText` is for mechanical line patches. `workspace.writeText` is
for new files or deliberate full replacement.

The transcript is not the source of truth for code. Workspace files are. After a
reload or failed check, reread the relevant file or panel health before
continuing.

## Boundaries

- Framework code has no project concept.
- Demo workspace app loading lives in `demo/project.js`.
- `workspace.*` tools are generic file tools.
- `demo.project.*` tools know the demo descriptor, layout, and component-file
  conventions.
- Domain editors should expose their own tools, such as `gde.table.patchRows`,
  on top of the same AI tool registry.
