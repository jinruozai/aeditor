// Built-in AI skills for AEditor.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  if (!ai.skills || !ai.skills.register) return

  ai.skills.register('aeditor.authoring', {
    title: 'AEditor Authoring',
    systemPrompt: 'Use AEditor as a zero-build, plain JavaScript editor UI framework. Author panels and UI as registered AEditor components, not as React, TSX, Vue, JSX, or bundled modules.',
    rules: [
      'Write AEditor UI files as plain .js scripts. Do not create .tsx, .jsx, TypeScript annotations, import/export statements, React hooks, or framework-specific component syntax.',
      'The one UI authoring model is a registered component: spec.defaults() returns title/icon/props, and spec.factory(propsSig, ctx) returns one HTMLElement root.',
      'propsSig is a signal function. Read props with const props = propsSig.peek() || {} for one-shot reads, or inside aeditor.effect with const props = propsSig() || {} for reactive rendering. Do not use propsSig.get() or propsSig.on().',
      'Standalone AEditor code registers with aeditor.registerComponent(name, spec). Host applications may provide their own component registration wrapper; if a host-specific authoring skill is active, follow that wrapper instead. Use exactly one registration path for a file; do not register the same component twice.',
      'Panel roots must fit resizable docks: height:100%, minHeight:0, boxSizing:border-box, and flex/grid layouts that adapt to narrow and wide dock sizes.',
      'Prefer aeditor.ui.* controls over hand-built controls when the library has a suitable component.',
      'For view surfaces and scrollable panel content, use aeditor.ui.view instead of raw native overflow scrollbars. Do not set raw overflowY/overflow:auto on primary panel content unless aeditor.ui.view cannot fit the case.',
      'For buttons, icon buttons, cards, lists, trees, tables, form fields, and scroll containers, use the matching aeditor.ui component first, then add only the minimal layout CSS the panel needs.',
      'For schema-driven local fields, use aeditor.ui.propertyForm. For generic selection properties shared across panels, register an aeditor.inspector provider and use the built-in inspector panel; do not build ad hoc inspector panels for generic editor selection.',
      'For hover tips or floating UI, prefer aeditor.ui.tooltip/popover/menu. If floating DOM is manually appended outside the panel root, register it with aeditor.ui.registerScopedOverlay(anchor, close).',
      'Durable AI-authored UI is file-backed: inspect workspace files, edit/write component files, make sure the host loads the registered component, inspect docks, then add the component by name to a returned dock id. Do not pass source code inside panel or dock tool arguments, do not guess dock names, and do not hand-write layout JSON.',
      'For existing source files, use map/search first, read the exact range, then call workspace.editFile with baseHash and exact oldText/newText. Use workspace.writeFile for new files, and workspace.patchFile only for mechanical line patches. If an edit is stale or ambiguous, reread the current range and retry with a more precise oldText.',
      'If no file workspace is available for a durable UI request, do not search for alternate panel creation workarounds. Tell the user to open or select a workspace first.',
    ],
  })
})(window.aeditor = window.aeditor || {})
