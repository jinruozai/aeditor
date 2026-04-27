// editorframe — single-file bundler.
//
// § 2.2 says zero-build, so this is *not* a build tool in the webpack sense:
// it's `cat` with banners. Source files are IIFEs already; we concatenate them
// in dependency order into a single dist/ef.js (and dist/ef.css). The output
// is committed so consumers — including our own demo — can double-click
// index.html and have it work without ever running node.
//
// Usage:
//   node tools/build.mjs            one-shot build
//   node tools/build.mjs --watch    rebuild on file change (100ms debounce)

import { readFileSync, writeFileSync, mkdirSync, watch } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC  = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

// ─── load order ────────────────────────────────────────────────────────────
// Must match index.html's old <script> order, plus the new ui/ tree appended
// at the end (UI widgets only depend on core/registry, never on each other).

const JS_ORDER = [
  // Layer 0 — reactivity & log
  'core/signal.js',
  'core/log.js',
  'core/bus.js',

  // Layer 1 — tree (pure data)
  'tree/tree.js',

  // Layer 2 — registry & widget context
  'core/registry.js',
  'core/context.js',

  // Layer 3 — dock runtime
  'dock/runtime.js',
  'dock/render.js',
  'dock/interactions.js',
  'dock/panel-drag.js',
  'dock/migrate.js',
  'dock/layout.js',

  // Layer 5 — UI library internals
  'ui/_internal/_css.js',
  'ui/_internal/_portal.js',
  'ui/_internal/_floating.js',
  'ui/_internal/_drag.js',
  'ui/_internal/_signal.js',
  'ui/_internal/_mixed.js',
  'ui/_internal/_render-tree.js',
  'ui/_internal/_overlay.js',
  'ui/_internal/_dnd.js',

  // Layer 6 — UI library: base
  'ui/base/icon-set.js',   // default icon registry (Lucide subset)
  'ui/base/icon.js',
  'ui/base/button.js',
  'ui/base/iconButton.js',
  'ui/base/tooltip.js',
  'ui/base/popover.js',
  'ui/base/kbd.js',
  'ui/base/badge.js',
  'ui/base/tag.js',
  'ui/base/spinner.js',
  'ui/base/divider.js',
  'ui/base/text.js',

  // Layer 7 — UI library: form
  'ui/form/input.js',
  'ui/form/textarea.js',
  'ui/form/numberInput.js',
  'ui/form/vectorInput.js',
  'ui/form/slider.js',
  'ui/form/rangeSlider.js',
  'ui/form/checkbox.js',
  'ui/form/switch.js',
  'ui/form/radio.js',
  'ui/form/segmented.js',
  'ui/form/select.js',
  'ui/form/combobox.js',
  'ui/form/colorInput.js',
  'ui/form/dateInput.js',
  'ui/form/enumInput.js',
  'ui/form/tagInput.js',
  'ui/form/tab.js',
  // TypeConfig + schema-driven property editing (depends on all form widgets
  // above — it dispatches to them). Keep at the end of the form layer.
  'ui/form/typeconfig.js',
  'ui/form/structInput.js',
  'ui/form/arrayInput.js',
  'ui/form/editorFor.js',
  'ui/form/propertyPanel.js',

  // Layer 8 — UI library: editor specials
  'ui/editor/gradientInput.js',
  'ui/editor/curveInput.js',
  'ui/editor/codeInput.js',
  'ui/editor/pathInput.js',
  'ui/editor/fileInput.js',
  'ui/editor/assetPicker.js',

  // Layer 9 — UI library: containers
  'ui/container/section.js',
  'ui/container/propRow.js',
  'ui/container/card.js',
  'ui/container/scrollArea.js',
  'ui/container/tabPanel.js',
  'ui/container/absolute.js',
  'ui/container/vbox.js',

  // Layer 10 — UI library: data
  'ui/data/list.js',
  'ui/data/tree.js',
  'ui/data/tree-dnd.js',
  'ui/data/table.js',
  'ui/data/breadcrumbs.js',
  'ui/data/progressBar.js',

  // Layer 11 — UI library: overlays
  'ui/overlay/menu.js',
  'ui/overlay/modal.js',
  'ui/overlay/drawer.js',
  'ui/overlay/banner.js',
  'ui/overlay/toast.js',
  'ui/overlay/dialogs.js',  // ui.alert / ui.confirm / ui.prompt / ui.contextMenu — depend on modal + menu

  // Layer 12 — built-in panel widgets (compose EF.ui.* + register via EF.registerComponent)
  'ui/panel/dock-tabs.js',
  'ui/panel/log.js',

  // Layer 13 — palette metadata for built-in ui.* components. Must come last:
  // it touches every ui.* function via EF.registerComponent and only the new
  // EF.ui.text + container/{absolute,vbox,hbox} files self-register.
  'ui/_internal/_register-builtins.js',
]

const CSS_ORDER = [
  'style/theme.css',     // tokens first — everything else uses var(--ef-*)
  'style/dock.css',
  'style/widget.css',
  'style/ui-base.css',
  'style/ui-form.css',
  'style/ui-editor.css',
  'style/ui-container.css',
  'style/ui-data.css',
  'style/ui-overlay.css',
]

// ─── concat ────────────────────────────────────────────────────────────────

function readOptional(path) {
  try { return readFileSync(path, 'utf8') }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

function bundle(order, kind) {
  const parts = []
  const missing = []
  for (const rel of order) {
    const abs = join(SRC, rel)
    const txt = readOptional(abs)
    if (txt == null) { missing.push(rel); continue }
    parts.push('/* ════ ' + rel + ' ════ */\n' + txt.replace(/\s+$/, '') + '\n')
  }
  const banner =
    '/* editorframe — bundled ' + kind + '\n' +
    ' * Generated by tools/build.mjs from src/. Do not edit by hand.\n' +
    ' * Sources: ' + (order.length - missing.length) + ' files concatenated in dependency order.\n' +
    ' */\n\n'
  return { text: banner + parts.join('\n'), missing }
}

function buildOnce() {
  mkdirSync(DIST, { recursive: true })
  const js  = bundle(JS_ORDER,  'JS')
  const css = bundle(CSS_ORDER, 'CSS')
  writeFileSync(join(DIST, 'ef.js'),  js.text)
  writeFileSync(join(DIST, 'ef.css'), css.text)
  const stamp = new Date().toLocaleTimeString()
  console.log('[' + stamp + '] built dist/ef.js (' + js.text.length + ' bytes, ' +
              (JS_ORDER.length - js.missing.length) + '/' + JS_ORDER.length + ' files), ' +
              'dist/ef.css (' + css.text.length + ' bytes, ' +
              (CSS_ORDER.length - css.missing.length) + '/' + CSS_ORDER.length + ' files)')
  if (js.missing.length || css.missing.length) {
    const all = js.missing.concat(css.missing)
    console.log('  · skipped (not yet created): ' + all.join(', '))
  }
}

// ─── watch ─────────────────────────────────────────────────────────────────

function watchMode() {
  buildOnce()
  let timer = null
  const debounced = () => { clearTimeout(timer); timer = setTimeout(buildOnce, 100) }
  watch(SRC, { recursive: true }, (event, file) => {
    if (!file) return
    if (file.endsWith('.js') || file.endsWith('.css')) {
      console.log('  · changed: ' + relative(ROOT, join(SRC, file)))
      debounced()
    }
  })
  console.log('[watch] watching src/ for .js / .css changes (Ctrl+C to stop)')
}

if (process.argv.includes('--watch') || process.argv.includes('-w')) watchMode()
else buildOnce()
