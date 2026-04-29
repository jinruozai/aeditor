// demo/catalog.js — single source of truth for every component showcased in
// the demo. Each entry describes one component:
//
//   { id, name, category, description, signals(), mount(s), editFor(s) }
//
// Why three functions instead of one build()?
//
// A single component can be showcased in multiple open showcase panels at
// the same time (user opens `showcase-base` twice via the "+" button, for
// example). Each panel must have its own DOM tree (because a DOM node can
// only have one parent), BUT they must share the same signals — editing a
// prop in the property panel should reflect in every mounted showcase card.
//
// Solution: split.
//   • signals()   runs ONCE per component id, cached in Demo.getSignals(id)
//   • mount(s)    runs per panel mount; returns a FRESH DOM element bound to
//                 the shared signals
//   • editFor(s)  returns the { key: signal | {signal, options} } map used by
//                 the property panel. Same object every call (stable shape).
//
// All three functions close over the same signal bag, so edits in the
// property panel flow automatically into every mounted component.
;(function () {
  'use strict'
  const ui = EF.ui

  // ── shared option lists ─────────────────────────────────────────────
  const BUTTON_KINDS = [
    { value: 'default', label: 'Default' },
    { value: 'primary', label: 'Primary' },
    { value: 'ghost',   label: 'Ghost' },
    { value: 'danger',  label: 'Danger' },
  ]
  const SIZES = [
    { value: 'sm', label: 'SM' },
    { value: 'md', label: 'MD' },
    { value: 'lg', label: 'LG' },
  ]
  const TAG_COLORS = [
    { value: 'gray',   label: 'Gray' },
    { value: 'accent', label: 'Accent' },
    { value: 'green',  label: 'Green' },
    { value: 'red',    label: 'Red' },
    { value: 'blue',   label: 'Blue' },
    { value: 'yellow', label: 'Yellow' },
  ]
  const BADGE_KINDS = [
    { value: 'default', label: 'Default' },
    { value: 'accent',  label: 'Accent' },
    { value: 'success', label: 'Success' },
    { value: 'warn',    label: 'Warn' },
    { value: 'error',   label: 'Error' },
  ]
  const ALERT_KINDS = [
    { value: 'info',    label: 'Info' },
    { value: 'success', label: 'Success' },
    { value: 'warn',    label: 'Warn' },
    { value: 'error',   label: 'Error' },
  ]

  const entries = [
    // ═════════════════════ BASE ═════════════════════
    {
      id: 'button', name: 'Button', category: 'base',
      description: 'Text button. Supports kinds, sizes, disabled, click.',
      signals: function () {
        return {
          text:     EF.signal('Click me'),
          kind:     EF.signal('default'),
          size:     EF.signal('md'),
          disabled: EF.signal(false),
        }
      },
      mount: function (s) {
        let clicks = 0
        return ui.button({ text: s.text, kind: s.kind, size: s.size, disabled: s.disabled, onClick: function () {
          clicks++
          EF.log.push('info', { scope: 'component', component: 'button' }, 'clicked (' + clicks + ')')
        }})
      },
      editFor: function (s) { return {
        text:     s.text,
        kind:     { signal: s.kind, options: BUTTON_KINDS },
        size:     { signal: s.size, options: SIZES },
        disabled: s.disabled,
      }},
    },

    {
      id: 'iconButton', name: 'Icon Button', category: 'base',
      description: 'Compact icon-only button. Title is required for a11y.',
      signals: function () { return {
        icon:     EF.signal('★'),
        size:     EF.signal('md'),
        kind:     EF.signal('default'),
        disabled: EF.signal(false),
      }},
      mount: function (s) {
        return ui.iconButton({ icon: s.icon, size: s.size, kind: s.kind, disabled: s.disabled, title: 'Favorite' })
      },
      editFor: function (s) { return {
        icon:     s.icon,
        size:     { signal: s.size, options: SIZES },
        kind:     { signal: s.kind, options: BUTTON_KINDS },
        disabled: s.disabled,
      }},
    },

    {
      id: 'icon', name: 'Icon', category: 'base',
      description: 'Glyph or monospace icon token. Size-aware.',
      signals: function () { return {
        glyph: EF.signal('◆'),
        size:  EF.signal('md'),
      }},
      mount: function (s) { return ui.icon({ glyph: s.glyph, size: s.size }) },
      editFor: function (s) { return { glyph: s.glyph, size: { signal: s.size, options: SIZES } } },
    },

    {
      id: 'tooltip', name: 'Tooltip', category: 'base',
      description: 'Hover tooltip. Wraps any target element.',
      signals: function () { return { text: EF.signal('This is a tooltip') } },
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'display:inline-block' })
        const target = ui.button({ text: 'Hover me', kind: 'ghost' })
        wrap.appendChild(target)
        ui.tooltip(target, { text: s.text })
        return wrap
      },
      editFor: function (s) { return { text: s.text } },
    },

    {
      id: 'kbd', name: 'Keyboard Hint', category: 'base',
      description: 'Styled keycap — decorative only.',
      signals: function () { return { text: EF.signal('Ctrl+K') } },
      mount: function (s) { return ui.kbd({ text: s.text }) },
      editFor: function (s) { return { text: s.text } },
    },

    {
      id: 'badge', name: 'Badge', category: 'base',
      description: 'Small tag label. Supports dot mode and variants.',
      signals: function () { return {
        text: EF.signal('NEW'),
        kind: EF.signal('accent'),
        dot:  EF.signal(false),
      }},
      mount: function (s) { return ui.badge({ text: s.text, kind: s.kind, dot: s.dot }) },
      editFor: function (s) { return {
        text: s.text,
        kind: { signal: s.kind, options: BADGE_KINDS },
        dot:  s.dot,
      }},
    },

    {
      id: 'tag', name: 'Tag', category: 'base',
      description: 'Chip with color + optional close button.',
      signals: function () { return {
        text:  EF.signal('javascript'),
        color: EF.signal('accent'),
      }},
      mount: function (s) {
        return ui.tag({ text: s.text, color: s.color, onClose: function () {
          EF.log.push('info', { scope: 'component', component: 'tag' }, 'tag close clicked')
        }})
      },
      editFor: function (s) { return {
        text:  s.text,
        color: { signal: s.color, options: TAG_COLORS },
      }},
    },

    {
      id: 'spinner', name: 'Spinner', category: 'base',
      description: 'Indeterminate loading spinner.',
      signals: function () { return { size: EF.signal('md') } },
      mount: function (s) { return ui.spinner({ size: s.size }) },
      editFor: function (s) { return { size: { signal: s.size, options: SIZES } } },
    },

    {
      id: 'divider', name: 'Divider', category: 'base',
      description: 'Horizontal or vertical rule with optional label.',
      signals: function () { return {
        label:    EF.signal('Section'),
        vertical: EF.signal(false),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'width:200px' })
        wrap.appendChild(ui.divider({ label: s.label, vertical: s.vertical }))
        return wrap
      },
      editFor: function (s) { return { label: s.label, vertical: s.vertical } },
    },

    {
      id: 'popover', name: 'Popover', category: 'base',
      description: 'Anchored floating panel. Click to toggle.',
      signals: function () { return {} },
      mount: function () {
        const wrap = ui.h('div', null, { style: 'display:inline-block' })
        const btn  = ui.button({ text: 'Open popover', kind: 'primary' })
        let pop = null
        btn.addEventListener('click', function () {
          if (pop) { pop.close(); pop = null; return }
          const body = ui.h('div', null, { style: 'padding:12px;max-width:240px' })
          body.appendChild(ui.h('div', null, { text: 'Floating content. Click outside to dismiss.' }))
          pop = ui.popover({ anchor: btn, content: body, side: 'bottom', align: 'start', onDismiss: function () { pop = null } })
        })
        wrap.appendChild(btn)
        return wrap
      },
      editFor: function () { return {} },
    },

    // ═════════════════════ FORM ═════════════════════
    {
      id: 'input', name: 'Input', category: 'form',
      description: 'Single-line text input. Binds to a signal.',
      signals: function () { return {
        value:       EF.signal('hello world'),
        placeholder: EF.signal('Type here…'),
        disabled:    EF.signal(false),
      }},
      mount: function (s) { return ui.input({ value: s.value, placeholder: s.placeholder, disabled: s.disabled }) },
      editFor: function (s) { return { value: s.value, placeholder: s.placeholder, disabled: s.disabled } },
    },

    {
      id: 'textarea', name: 'Textarea', category: 'form',
      description: 'Multi-line text input. Tab indents, signal-bound.',
      signals: function () { return {
        value:       EF.signal('line one\nline two\nline three'),
        placeholder: EF.signal('Type…'),
        disabled:    EF.signal(false),
        mono:        EF.signal(true),
      }},
      mount: function (s) { return ui.textarea({ value: s.value, placeholder: s.placeholder, disabled: s.disabled, mono: s.mono, rows: 4 }) },
      editFor: function (s) { return { value: s.value, placeholder: s.placeholder, mono: s.mono, disabled: s.disabled } },
    },

    {
      id: 'numberInput', name: 'Number Input', category: 'form',
      description: 'Blender-style scrub + edit number. Min/max/step live.',
      signals: function () { return {
        value:  EF.signal(42),
        min:    EF.signal(0),
        max:    EF.signal(100),
        step:   EF.signal(1),
        label:  EF.signal('Value'),
        suffix: EF.signal('px'),
      }},
      mount: function (s) { return ui.numberInput({ value: s.value, min: s.min, max: s.max, step: s.step, label: s.label, suffix: s.suffix }) },
      editFor: function (s) { return { value: s.value, min: s.min, max: s.max, step: s.step, label: s.label, suffix: s.suffix } },
    },

    {
      id: 'vectorInput', name: 'Vector Input', category: 'form',
      description: 'XYZ vector of linked number inputs.',
      signals: function () { return { value: EF.signal([0, 0, 0]) } },
      mount: function (s) { return ui.vectorInput({ value: s.value, step: 0.1, precision: 2 }) },
      editFor: function () { return {} },
    },

    {
      id: 'slider', name: 'Slider', category: 'form',
      description: 'Horizontal numeric slider with optional value bubble.',
      signals: function () { return {
        value:     EF.signal(0.5),
        min:       EF.signal(0),
        max:       EF.signal(1),
        step:      EF.signal(0.01),
        showValue: EF.signal(true),
        suffix:    EF.signal(''),
      }},
      mount: function (s) { return ui.slider({ value: s.value, min: s.min, max: s.max, step: s.step, showValue: s.showValue, suffix: s.suffix }) },
      editFor: function (s) { return { value: s.value, min: s.min, max: s.max, step: s.step, showValue: s.showValue, suffix: s.suffix } },
    },

    {
      id: 'rangeSlider', name: 'Range Slider', category: 'form',
      description: 'Two-thumb slider for [min, max] ranges.',
      signals: function () { return {
        value: EF.signal([0.2, 0.8]),
        min:   EF.signal(0),
        max:   EF.signal(1),
        step:  EF.signal(0.01),
      }},
      mount: function (s) { return ui.rangeSlider({ value: s.value, min: s.min, max: s.max, step: s.step }) },
      editFor: function (s) { return { min: s.min, max: s.max, step: s.step } },
    },

    {
      id: 'checkbox', name: 'Checkbox', category: 'form',
      description: 'Boolean toggle with label.',
      signals: function () { return {
        value:    EF.signal(true),
        label:    EF.signal('Enable feature'),
        disabled: EF.signal(false),
      }},
      mount: function (s) { return ui.checkbox({ value: s.value, label: s.label, disabled: s.disabled }) },
      editFor: function (s) { return { value: s.value, label: s.label, disabled: s.disabled } },
    },

    {
      id: 'switch', name: 'Switch', category: 'form',
      description: 'Toggle switch — same semantics as checkbox, different look.',
      signals: function () { return {
        value:    EF.signal(false),
        label:    EF.signal('Dark mode'),
        disabled: EF.signal(false),
      }},
      mount: function (s) { return ui['switch']({ value: s.value, label: s.label, disabled: s.disabled }) },
      editFor: function (s) { return { value: s.value, label: s.label, disabled: s.disabled } },
    },

    {
      id: 'radio', name: 'Radio Group', category: 'form',
      description: 'Single-choice radio group.',
      signals: function () { return {
        value:    EF.signal('b'),
        disabled: EF.signal(false),
      }},
      mount: function (s) {
        return ui.radio({
          value: s.value, disabled: s.disabled,
          options: [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
            { value: 'c', label: 'Option C' },
          ],
        })
      },
      editFor: function (s) { return {
        value: { signal: s.value, options: [
          { value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' },
        ]},
        disabled: s.disabled,
      }},
    },

    {
      id: 'segmented', name: 'Segmented', category: 'form',
      description: 'Segmented button group — single selection.',
      signals: function () { return {
        value:    EF.signal('center'),
        disabled: EF.signal(false),
      }},
      mount: function (s) {
        return ui.segmented({
          value: s.value, disabled: s.disabled,
          options: [
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ],
        })
      },
      editFor: function (s) { return {
        value: { signal: s.value, options: [
          { value: 'left', label: 'L' }, { value: 'center', label: 'C' }, { value: 'right', label: 'R' },
        ]},
        disabled: s.disabled,
      }},
    },

    {
      id: 'select', name: 'Select', category: 'form',
      description: 'Dropdown with custom menu (no native <select>).',
      signals: function () { return {
        value:       EF.signal('ts'),
        placeholder: EF.signal('Pick a language…'),
        disabled:    EF.signal(false),
      }},
      mount: function (s) {
        return ui.select({
          value: s.value, placeholder: s.placeholder, disabled: s.disabled,
          options: [
            { value: 'ts', label: 'TypeScript' },
            { value: 'js', label: 'JavaScript' },
            { value: 'py', label: 'Python' },
            { value: 'rs', label: 'Rust' },
            { value: 'go', label: 'Go' },
          ],
        })
      },
      editFor: function (s) { return { placeholder: s.placeholder, disabled: s.disabled } },
    },

    {
      id: 'combobox', name: 'Combobox', category: 'form',
      description: 'Text input with filtered suggestions.',
      signals: function () { return {
        value:       EF.signal(''),
        placeholder: EF.signal('Search fruit…'),
        disabled:    EF.signal(false),
      }},
      mount: function (s) {
        return ui.combobox({
          value: s.value, placeholder: s.placeholder, disabled: s.disabled,
          options: ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Durian', 'Grape', 'Kiwi', 'Lemon', 'Mango', 'Peach', 'Pear'],
        })
      },
      editFor: function (s) { return { value: s.value, placeholder: s.placeholder, disabled: s.disabled } },
    },

    {
      id: 'colorInput', name: 'Color Input', category: 'form',
      description: 'Swatch + HSV picker popover.',
      signals: function () { return { value: EF.signal('#7b6ef6') } },
      mount: function (s) { return ui.colorInput({ value: s.value }) },
      editFor: function (s) { return { value: s.value } },
    },

    {
      id: 'enumInput', name: 'Enum (bitmask)', category: 'form',
      description: 'Multi-flag bitmask toggle.',
      signals: function () { return { value: EF.signal(5) } },
      mount: function (s) {
        return ui.enumInput({
          value: s.value,
          options: [
            { value: 1, label: 'Read' },
            { value: 2, label: 'Write' },
            { value: 4, label: 'Exec' },
            { value: 8, label: 'Admin' },
          ],
        })
      },
      editFor: function () { return {} },
    },

    {
      id: 'tagInput', name: 'Tag Input', category: 'form',
      description: 'Editable chip list — Enter adds, Backspace removes.',
      signals: function () { return {
        value:       EF.signal(['alpha', 'beta', 'gamma']),
        placeholder: EF.signal('add tag…'),
        disabled:    EF.signal(false),
      }},
      mount: function (s) { return ui.tagInput({ value: s.value, placeholder: s.placeholder, disabled: s.disabled }) },
      editFor: function (s) { return { placeholder: s.placeholder, disabled: s.disabled } },
    },

    {
      id: 'dateInput', name: 'Date Input', category: 'form',
      description: 'Native date picker, framed like ui.input.',
      signals: function () { return { value: EF.signal('2026-04-24'), disabled: EF.signal(false) } },
      mount: function (s) { return ui.dateInput({ value: s.value, disabled: s.disabled }) },
      editFor: function (s) { return { value: s.value, disabled: s.disabled } },
    },

    {
      id: 'tab', name: 'Tab Strip', category: 'form',
      description: 'General-purpose tab bar (three visual variants).',
      signals: function () { return {
        active:  EF.signal('overview'),
        variant: EF.signal('bar'),
      }},
      mount: function (s) {
        return ui.tab({
          items: EF.signal([
            { id: 'overview', title: 'Overview', icon: 'eye' },
            { id: 'files',    title: 'Files',    icon: 'folder' },
            { id: 'settings', title: 'Settings', icon: 'settings', badge: '2' },
          ]),
          active: s.active,
          variant: s.variant,
        })
      },
      editFor: function (s) { return {
        variant: { signal: s.variant, options: [
          { value: 'bar', label: 'bar' },
          { value: 'compact', label: 'compact' },
          { value: 'sidebar', label: 'sidebar' },
        ]},
      }},
    },

    // ═════════════════════ EDITOR ═════════════════════
    {
      id: 'gradientInput', name: 'Gradient Input', category: 'editor',
      stageSize: 'lg',
      description: 'Linear gradient color stop editor.',
      signals: function () { return {
        value: EF.signal({ stops: [
          { pos: 0,    color: '#7b6ef6' },
          { pos: 0.5,  color: '#34d399' },
          { pos: 1,    color: '#fbbf24' },
        ]}),
      }},
      mount: function (s) { return ui.gradientInput({ value: s.value }) },
      editFor: function () { return {} },
    },

    {
      id: 'curveInput', name: 'Curve Input', category: 'editor',
      stageSize: 'lg',
      description: 'Cubic bezier easing curve editor.',
      signals: function () { return { value: EF.signal([0.42, 0, 0.58, 1]) } },
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'height:200px' })
        wrap.appendChild(ui.curveInput({ value: s.value }))
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'codeInput', name: 'Code Input', category: 'editor',
      stageSize: 'lg',
      description: 'Monospace text editor with line numbers.',
      signals: function () { return { value: EF.signal('function greet(name) {\n  return "Hello, " + name\n}') } },
      mount: function (s) { return ui.codeInput({ value: s.value, language: 'js', rows: 5 }) },
      editFor: function () { return {} },
    },

    {
      id: 'pathInput', name: 'Path Input', category: 'editor',
      description: 'File/folder path with browse button.',
      signals: function () { return {
        value:       EF.signal('/usr/local/bin/node'),
        placeholder: EF.signal('Select a file…'),
        mode:        EF.signal('file'),
        disabled:    EF.signal(false),
      }},
      mount: function (s) { return ui.pathInput({ value: s.value, placeholder: s.placeholder, mode: s.mode, disabled: s.disabled, useFileInput: true }) },
      editFor: function (s) { return {
        value:       s.value,
        placeholder: s.placeholder,
        mode:        { signal: s.mode, options: [{ value: 'file', label: 'File' }, { value: 'folder', label: 'Folder' }] },
        disabled:    s.disabled,
      }},
    },

    {
      id: 'fileInput', name: 'File Input', category: 'editor',
      stageSize: 'lg',
      description: 'Drop zone + click-to-pick file input.',
      signals: function () { return { value: EF.signal(null) } },
      mount: function (s) { return ui.fileInput({ value: s.value }) },
      editFor: function () { return {} },
    },

    {
      id: 'assetPicker', name: 'Asset Picker', category: 'editor',
      description: 'Path + preview thumbnail. Drag in files / URLs; drag out to export.',
      signals: function () { return {
        value: EF.signal('https://picsum.photos/seed/ef/120'),
        kind:  EF.signal('image'),
      }},
      mount: function (s) { return ui.assetPicker({ value: s.value, kind: s.kind.peek() }) },
      editFor: function (s) { return {
        value: s.value,
        kind:  { signal: s.kind, options: [
          { value: 'image', label: 'image' },
          { value: 'audio', label: 'audio' },
          { value: 'file',  label: 'file'  },
        ]},
      }},
    },

    {
      id: 'arrayInput', name: 'Array Input', category: 'editor',
      stageSize: 'lg',
      description: 'Generic list editor — add / remove / edit per-row.',
      signals: function () { return { value: EF.signal(['red', 'green', 'blue']) } },
      mount: function (s) { return ui.arrayInput({ value: s.value }) },
      editFor: function () { return {} },
    },

    {
      id: 'structInput', name: 'Struct Input', category: 'editor',
      stageSize: 'lg',
      description: 'Fixed-shape object editor; caller supplies per-field renderer.',
      signals: function () { return {
        value: EF.signal({ title: 'Iron Sword', level: 3, equipped: true }),
      }},
      mount: function (s) {
        return ui.structInput({
          value: s.value,
          fields: [
            { key: 'title',    label: 'Title',    editor: (sig, write) => ui.input({ value: sig, onChange: write }) },
            { key: 'level',    label: 'Level',    editor: (sig, write) => ui.numberInput({ value: sig, onChange: write, step: 1, precision: 0 }) },
            { key: 'equipped', label: 'Equipped', editor: (sig, write) => ui.switch({ value: sig, onChange: write }) },
          ],
        })
      },
      editFor: function () { return {} },
    },

    {
      id: 'propertyPanel', name: 'Property Panel', category: 'editor',
      stageSize: 'lg',
      description: 'Schema-driven form — resolves FieldDef / TypeDef via type_config.',
      signals: function () { return {
        value:  EF.signal({ name: 'Aria', hp: 120, active: true, tint: '#7b6ef6' }),
        schema: EF.signal({
          name:   { type: 'string' },
          hp:     { type: 'int',   type_agv: { min: 0, max: 999 } },
          active: { type: 'bool' },
          tint:   { type: 'color' },
        }),
      }},
      mount: function (s) { return ui.propertyPanel({ value: s.value, schema: s.schema }) },
      editFor: function () { return {} },
    },

    // ═════════════════════ CONTAINER ═════════════════════
    {
      id: 'section', name: 'Section', category: 'container',
      description: 'Collapsible labeled section.',
      signals: function () { return {
        title:     EF.signal('Collapsible Section'),
        collapsed: EF.signal(false),
      }},
      mount: function (s) {
        const content = ui.h('div', null, { style: 'padding:8px 0' })
        content.appendChild(ui.h('div', null, { text: 'Section body — anything goes here.' }))
        content.appendChild(ui.button({ text: 'Inside section' }))
        return ui.section({ title: s.title, collapsed: s.collapsed, children: content })
      },
      editFor: function (s) { return { title: s.title, collapsed: s.collapsed } },
    },

    {
      id: 'propRow', name: 'Prop Row', category: 'container',
      description: 'Blender-style label + control row.',
      signals: function () { return {
        label:    EF.signal('Opacity'),
        hint:     EF.signal('0 means fully transparent'),
        valueSig: EF.signal(0.75),
      }},
      mount: function (s) {
        return ui.propRow({ label: s.label, hint: s.hint, control: ui.slider({ value: s.valueSig, showValue: true }) })
      },
      editFor: function (s) { return { label: s.label, hint: s.hint } },
    },

    {
      id: 'card', name: 'Card', category: 'container',
      description: 'Bordered container with optional title bar.',
      signals: function () { return { title: EF.signal('Card title') } },
      mount: function (s) {
        const body = ui.h('div', null, { style: 'display:flex;flex-direction:column;gap:8px' })
        body.appendChild(ui.h('div', null, { text: 'Card body content.' }))
        body.appendChild(ui.button({ text: 'Action', kind: 'primary' }))
        return ui.card({ title: s.title, children: body })
      },
      editFor: function (s) { return { title: s.title } },
    },

    {
      id: 'scrollArea', name: 'Scroll Area', category: 'container',
      description: 'Themed scroll container (tall content).',
      signals: function () { return {} },
      mount: function () {
        const content = ui.h('div', null, { style: 'padding:8px' })
        for (let i = 0; i < 30; i++) {
          content.appendChild(ui.h('div', null, { text: 'Line ' + (i + 1), style: 'padding:4px 0;border-bottom:1px solid var(--ef-border)' }))
        }
        return ui.scrollArea({ children: content, maxHeight: 140 })
      },
      editFor: function () { return {} },
    },

    {
      id: 'tabPanel', name: 'Tab Panel', category: 'container',
      description: 'In-panel paged view with tab strip + body.',
      signals: function () { return {
        items:  EF.signal([
          { id: 'one',   title: 'One' },
          { id: 'two',   title: 'Two' },
          { id: 'three', title: 'Three' },
        ]),
        active: EF.signal('one'),
      }},
      mount: function (s) {
        const panes = {
          one:   ui.h('div', null, { text: 'First pane',  style: 'padding:12px' }),
          two:   ui.h('div', null, { text: 'Second pane', style: 'padding:12px' }),
          three: ui.h('div', null, { text: 'Third pane',  style: 'padding:12px' }),
        }
        const wrap = ui.h('div', null, { style: 'height:140px;width:280px;border:1px solid var(--ef-border);border-radius:4px' })
        wrap.appendChild(ui.tabPanel({ items: s.items, active: s.active, panes: panes, variant: 'compact' }))
        return wrap
      },
      editFor: function () { return {} },
    },

    // ═════════════════════ DATA ═════════════════════
    {
      id: 'list', name: 'List', category: 'data',
      description: 'Virtualized fixed-row list. Multi-select with ctrl/shift.',
      signals: function () { return {
        items:    EF.signal(Array.from({ length: 200 }, function (_, i) { return 'Item #' + (i + 1) })),
        selected: EF.signal([]),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'height:180px;width:240px;border:1px solid var(--ef-border);border-radius:4px' })
        wrap.appendChild(ui.list({
          items: s.items, selected: s.selected, rowHeight: 26,
          render: function (it) { return ui.h('div', null, { text: it, style: 'padding:4px 8px' }) },
        }))
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'tree', name: 'Tree', category: 'data',
      description: 'Virtualized tree with expand / collapse.',
      signals: function () { return {
        items: EF.signal([
          { id: 'src', label: 'src', icon: '📁', children: [
            { id: 'core', label: 'core', icon: '📁', children: [
              { id: 'signal', label: 'signal.js', icon: '📄' },
              { id: 'errors', label: 'errors.js', icon: '📄' },
            ]},
            { id: 'ui', label: 'ui', icon: '📁', children: [
              { id: 'button',  label: 'button.js',  icon: '📄' },
              { id: 'input',   label: 'input.js',   icon: '📄' },
            ]},
          ]},
          { id: 'demo', label: 'demo', icon: '📁', children: [
            { id: 'catalog', label: 'catalog.js', icon: '📄' },
          ]},
        ]),
        selected: EF.signal([]),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'height:200px;width:240px;border:1px solid var(--ef-border);border-radius:4px' })
        wrap.appendChild(ui.tree({ items: s.items, selected: s.selected }))
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'table', name: 'Table', category: 'data',
      description: 'Virtualized fixed-row table with column headers.',
      signals: function () { return {
        rows: EF.signal(Array.from({ length: 100 }, function (_, i) {
          return { id: i + 1, name: 'Item ' + (i + 1), qty: Math.round(Math.random() * 100), active: i % 2 === 0 }
        })),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'height:200px;width:320px;border:1px solid var(--ef-border);border-radius:4px;display:flex;flex-direction:column' })
        wrap.appendChild(ui.table({
          rows: s.rows,
          columns: [
            { key: 'id',     label: '#',      width: 40 },
            { key: 'name',   label: 'Name' },
            { key: 'qty',    label: 'Qty',    width: 60 },
            { key: 'active', label: 'Active', width: 60, render: function (v) { return v ? '✓' : '—' } },
          ],
        }))
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'breadcrumbs', name: 'Breadcrumbs', category: 'data',
      description: 'Path crumbs with click handlers.',
      signals: function () { return {
        items: EF.signal([
          { label: 'Home', onClick: function () {} },
          { label: 'Docs', onClick: function () {} },
          { label: 'Getting Started' },
        ]),
      }},
      mount: function (s) { return ui.breadcrumbs({ items: s.items }) },
      editFor: function () { return {} },
    },

    {
      id: 'progressBar', name: 'Progress Bar', category: 'data',
      description: 'Linear / circle, three sizes, four kinds, determinate or indeterminate.',
      signals: function () { return {
        value:         EF.signal(0.42),
        indeterminate: EF.signal(false),
        label:         EF.signal('42%'),
        shape:         EF.signal('linear'),
        size:          EF.signal('md'),
        kind:          EF.signal('default'),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'width:220px;display:flex;align-items:center;justify-content:center;min-height:64px' })
        // Shape is picked once per instance (see component note); remount on swap.
        EF.effect(function () {
          const sh = s.shape()
          wrap.innerHTML = ''
          wrap.appendChild(ui.progressBar({
            value: s.value, indeterminate: s.indeterminate, label: s.label,
            shape: sh, size: s.size, kind: s.kind,
          }))
        })
        return wrap
      },
      editFor: function (s) { return {
        value: s.value, indeterminate: s.indeterminate, label: s.label,
        shape: { signal: s.shape, options: [{ value: 'linear', label: 'linear' }, { value: 'circle', label: 'circle' }] },
        size:  { signal: s.size,  options: [{ value: 'sm', label: 'sm' }, { value: 'md', label: 'md' }, { value: 'lg', label: 'lg' }] },
        kind:  { signal: s.kind,  options: [{ value: 'default', label: 'default' }, { value: 'success', label: 'success' }, { value: 'warn', label: 'warn' }, { value: 'error', label: 'error' }] },
      }},
    },

    // ═════════════════════ OVERLAY ═════════════════════
    {
      id: 'menu', name: 'Menu', category: 'overlay',
      description: 'Context / dropdown menu with items, dividers, submenus.',
      signals: function () { return {} },
      mount: function () {
        const wrap = ui.h('div', null, { style: 'display:inline-block' })
        const btn  = ui.button({ text: 'Open menu' })
        btn.addEventListener('click', function () {
          ui.menu({
            anchor: btn,
            items: [
              { type: 'header', label: 'File' },
              { label: 'New',   icon: '＋', kbd: 'Ctrl+N', onSelect: function () { EF.log.push('info', { scope: 'demo' }, 'menu: New') } },
              { label: 'Open…', icon: '📂', kbd: 'Ctrl+O', onSelect: function () { EF.log.push('info', { scope: 'demo' }, 'menu: Open') } },
              { label: 'Save',  icon: '💾', kbd: 'Ctrl+S', onSelect: function () { EF.log.push('info', { scope: 'demo' }, 'menu: Save') } },
              { type: 'divider' },
              { label: 'Recent', items: [
                { label: 'alpha.txt', onSelect: function () {} },
                { label: 'beta.txt',  onSelect: function () {} },
              ]},
              { type: 'divider' },
              { label: 'Delete', icon: '🗑', danger: true, onSelect: function () { EF.log.push('warn', { scope: 'demo' }, 'menu: Delete') } },
            ],
          })
        })
        wrap.appendChild(btn)
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'modal', name: 'Modal', category: 'overlay',
      description: 'Centered modal dialog with backdrop + ESC dismiss.',
      signals: function () { return {} },
      mount: function () {
        const wrap = ui.h('div', null, { style: 'display:inline-block' })
        const btn  = ui.button({ text: 'Open modal', kind: 'primary' })
        btn.addEventListener('click', function () {
          const body = ui.h('div', null, { style: 'display:flex;flex-direction:column;gap:8px;min-width:280px' })
          body.appendChild(ui.h('p', null, { text: 'This is a modal dialog. Click backdrop or press ESC to close.' }))
          body.appendChild(ui.input({ value: EF.signal(''), placeholder: 'Type something…' }))
          const footer = ui.h('div', null, { style: 'display:flex;gap:8px;justify-content:flex-end' })
          const okBtn = ui.button({ text: 'OK', kind: 'primary' })
          const cxBtn = ui.button({ text: 'Cancel', kind: 'ghost' })
          footer.appendChild(cxBtn); footer.appendChild(okBtn)
          const m = ui.modal({ title: 'Demo Modal', content: body, footer: footer })
          okBtn.addEventListener('click', function () { m.close() })
          cxBtn.addEventListener('click', function () { m.close() })
        })
        wrap.appendChild(btn)
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'drawer', name: 'Drawer', category: 'overlay',
      description: 'Slide-in side panel from any edge.',
      signals: function () { return {} },
      mount: function () {
        const wrap = ui.h('div', null, { style: 'display:inline-block' })
        const btn  = ui.button({ text: 'Open drawer' })
        btn.addEventListener('click', function () {
          const body = ui.h('div', null, { style: 'display:flex;flex-direction:column;gap:12px;padding:12px' })
          body.appendChild(ui.h('p', null, { text: 'Drawer content slides in from the right.' }))
          body.appendChild(ui.textarea({ value: EF.signal('Editable scratch area'), rows: 6 }))
          ui.drawer({ side: 'right', title: 'Settings', content: body })
        })
        wrap.appendChild(btn)
        return wrap
      },
      editFor: function () { return {} },
    },

    {
      id: 'banner', name: 'Banner', category: 'overlay',
      description: 'Inline banner — info / success / warn / error.',
      signals: function () { return {
        kind:    EF.signal('info'),
        title:   EF.signal('Heads up!'),
        message: EF.signal('This is an inline status banner.'),
      }},
      mount: function (s) {
        const wrap = ui.h('div', null, { style: 'width:300px' })
        wrap.appendChild(ui.banner({ kind: s.kind, title: s.title, message: s.message }))
        return wrap
      },
      editFor: function (s) { return {
        kind:    { signal: s.kind, options: ALERT_KINDS },
        title:   s.title,
        message: s.message,
      }},
    },

    {
      id: 'toast', name: 'Toast', category: 'overlay',
      description: 'Transient notification in top-right corner.',
      signals: function () { return {} },
      mount: function () {
        const wrap = ui.h('div', null, { style: 'display:flex;gap:6px;flex-wrap:wrap' })
        const kinds = ['info', 'success', 'warn', 'error']
        kinds.forEach(function (k) {
          const b = ui.button({ text: k, kind: k === 'error' ? 'danger' : 'default', size: 'sm' })
          b.addEventListener('click', function () {
            ui.toast({ kind: k, title: k.toUpperCase(), message: 'Example ' + k + ' toast.' })
          })
          wrap.appendChild(b)
        })
        return wrap
      },
      editFor: function () { return {} },
    },

  ]

  window.Demo = window.Demo || {}
  window.Demo.catalog = entries
})()
