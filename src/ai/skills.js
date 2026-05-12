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
      'For hover tips or floating UI, prefer aeditor.ui.tooltip/popover/menu. If floating DOM is manually appended outside the panel root, register it with aeditor.ui.registerScopedOverlay(anchor, close).',
      'Durable AI-authored UI is file-backed: inspect workspace files, write or patch component files, then ask the host to mount an already registered component by name. Do not pass source code inside panel or dock tool arguments.',
      'Keep generated panel files concise. For existing or large files, read the current hash and use workspace.patchFile instead of rewriting the whole file. If a write fails validation, inspect the file/range and repair with a small patch; do not repeat the same broad rewrite.',
      'If no file workspace is available for a durable UI request, do not search for legacy panel creation workarounds. Tell the user to open or select a workspace first.',
    ],
  })
})(window.aeditor = window.aeditor || {})
