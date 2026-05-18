// Built-in AI skills for AEditor.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  if (!ai.skills || !ai.skills.register) return

  const COMMON_RULES = [
    'Write AEditor UI as plain .js scripts. Do not create .tsx, .jsx, TypeScript annotations, import/export statements, React hooks, or framework-specific component syntax in zero-build AEditor code.',
    'The UI authoring model is a registered component: spec.defaults() returns title/icon/props, and spec.factory(propsSig, ctx) returns one HTMLElement root.',
    'propsSig is a signal function. Read props with propsSig.peek() for one-shot reads, or with propsSig() inside aeditor.effect. Do not use propsSig.get() or propsSig.on().',
    'Panel roots must fit resizable docks: height:100%, minHeight:0, boxSizing:border-box, and flex/grid layouts that adapt to narrow and wide dock sizes.',
    'Prefer aeditor.ui.* controls over hand-built controls when the UI layer has a suitable component. Use aeditor.ui.view for primary scroll surfaces.',
    'For schema-driven local fields, use aeditor.ui.propertyForm. For generic selection properties shared across panels, register an inspector provider and select targets with aeditor.inspector.select.',
    'When an API shape is unclear, search generated API references first: aeditor.searchReferences({ query: "api", limit: 50 }) and aeditor.readReference({ uri: "aeditor://api" }).',
  ]

  const RUNTIME_RULES = COMMON_RULES.concat([
    'Use this skill when running inside an AEditor host and the user wants UI created, mounted, or replaced in the current live editor.',
    'Durable live UI is file-backed: inspect workspace files, edit/write component files, inspect docks, then call aeditor.addPanelToDock with component name, returned dock id, and path when the component file was just written.',
    'After editing the file for an already-mounted panel, call aeditor.reloadPanel with panelId and path. Do not use replacePanel to refresh the same component.',
    'To replace one existing panel, call aeditor.replacePanel with the returned panelId and the same component/path/title/icon/props shape. It keeps the dock position and returns a fresh panel id.',
    'Do not pass source code inside panel or dock tool arguments. Do not hand-write layout JSON for live placement. Do not guess dock names.',
    'If no writable workspace is available for a durable UI request, tell the user to open or select a workspace first instead of looking for a workaround.',
  ])

  const LIBRARY_RULES = COMMON_RULES.concat([
    'Use this skill when coding an AEditor-based repository or host app directly, outside the live editor agent runtime.',
    'Standalone AEditor code registers with aeditor.registerComponent(name, spec). Host applications may provide their own wrapper; use exactly one registration path for a file.',
    'Load the smallest bundle the host needs: aeditor-kernel for dock runtime, aeditor-ui for widgets, aeditor-ai for AI Host/Extension Runtime, aeditor-core for Kernel+UI, and aeditor-full for everything.',
    'App menus, save/open behavior, app shortcuts, project formats, provider transports, and privileged filesystem bridges belong to the host app, not framework core.',
    'After changing AEditor src/ in this repo, rebuild with node tools/build.mjs and run checks before handing off.',
  ])

  ai.skills.register('aeditor.runtime-authoring', {
    title: 'AEditor Runtime Authoring',
    description: 'Create, edit, load, mount, or replace workspace-backed AEditor panels in the current live editor.',
    whenToUse: 'Use when the agent is running inside an AEditor host and the user asks for UI to appear in current docks.',
    whenNotToUse: 'Do not use for standalone repository or host-app implementation work outside the live editor runtime.',
    relatedApis: ['aeditor.inspectDocks', 'aeditor.addPanelToDock', 'aeditor.reloadPanel', 'aeditor.replacePanel', 'aeditor.registerComponent', 'aeditor.runtime.loadScript'],
    relatedTools: ['workspace.fileSummary', 'workspace.writeFile', 'workspace.editFile', 'aeditor.inspectDocks', 'aeditor.addPanelToDock', 'aeditor.reloadPanel', 'aeditor.replacePanel'],
    docPath: 'doc/skill/aeditor-runtime-authoring/SKILL.md',
    systemPrompt: 'You are running inside an AEditor host. Create durable UI by writing plain JavaScript workspace component files, then mount or replace registered components in live docks through AEditor tools.',
    rules: RUNTIME_RULES,
  })

  ai.skills.register('aeditor.library-authoring', {
    title: 'AEditor Library Authoring',
    description: 'Use AEditor as a zero-build JavaScript UI framework in a repository or host app.',
    whenToUse: 'Use when coding an AEditor-based project, host app, demo, layout, or component library outside the live editor agent runtime.',
    whenNotToUse: 'Do not use when the task is to place UI into the currently running editor dock; use aeditor.runtime-authoring instead.',
    relatedApis: ['aeditor.registerComponent', 'aeditor.ui.propertyForm', 'aeditor.inspector.registerProvider', 'aeditor.runtime.loadScript'],
    relatedTools: ['workspace.searchFiles', 'workspace.readFile', 'workspace.editFile', 'workspace.writeFile'],
    docPath: 'doc/skill/aeditor-library-authoring/SKILL.md',
    systemPrompt: 'Use AEditor as a zero-build, plain JavaScript editor UI library in a repository or host app. Author registered components and host integration code without React, TSX, JSX, import/export, or bundled-module assumptions.',
    rules: LIBRARY_RULES,
  })

  ai.skills.register('aeditor.authoring', {
    title: 'AEditor Authoring',
    description: 'Compatibility umbrella for AEditor authoring. Prefer the focused runtime or library authoring skills.',
    whenToUse: 'Use only for older agents or when a focused AEditor authoring skill is unavailable.',
    whenNotToUse: 'Prefer aeditor.runtime-authoring in live editor sessions and aeditor.library-authoring in repository work.',
    relatedApis: ['aeditor.registerComponent', 'aeditor.inspectDocks', 'aeditor.addPanelToDock'],
    relatedTools: ['aeditor.inspectDocks', 'aeditor.addPanelToDock'],
    docPath: 'doc/skill/aeditor-authoring/SKILL.md',
    systemPrompt: 'Compatibility skill for AEditor authoring. Prefer aeditor.runtime-authoring inside the live editor, and aeditor.library-authoring when coding a host app or repository.',
    rules: [
      'Choose aeditor.runtime-authoring for live editor workspace edits and dock mounting.',
      'Choose aeditor.library-authoring for repository or host-app code that uses AEditor as a library.',
    ].concat(COMMON_RULES),
  })
})(window.aeditor = window.aeditor || {})
