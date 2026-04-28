// Component-registry sidecar — registers the built-in ui.* widgets as
// palette-able components so EF.ui.renderUITree (and editors / palettes
// built on top of it) can instantiate them by name.
//
// Visual chrome (background / border / radius / padding / font / color /
// text-align / etc) is supplied uniformly via two shared schema fragments
// declared in `_box-style.js` and `_text-style.js`. A component opts in by
// `Object.assign`-ing the fragments into its schema + defaultProps and
// calling `ui.applyBoxStyle(el, props)` / `ui.applyTextStyle(el, props)`
// on its outer element. Empty / null defaults mean "no inline style" which
// lets the framework's CSS rules (theme cascade) win — that's the
// "no edit = use theme" semantics for free.
;(function (EF) {
  'use strict'
  const ui = EF.ui
  const reg = EF.registerComponent
  const lift = ui.liftProps
  const BOX  = ui.BOX_STYLE_SCHEMA
  const BOX_D = ui.BOX_STYLE_DEFAULTS
  const TEXT = ui.TEXT_STYLE_SCHEMA
  const TEXT_D = ui.TEXT_STYLE_DEFAULTS
  function box(el, p)  { ui.applyBoxStyle(el, p) }
  function text(el, p) { ui.applyTextStyle(el, p) }

  // ── form ──────────────────────────────────────────────────────────
  reg('input', {
    label: 'Text Input', icon: 'type', category: 'form',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, { value: '', placeholder: '' }),
    schema: Object.assign({}, BOX, {
      value:       { type: 'string' },
      placeholder: { type: 'string' },
      disabled:    { type: 'bool' },
      readOnly:    { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.input(lift(p, ['value','placeholder','disabled','readOnly']))
      box(el, p)
      return el
    },
  })

  reg('textarea', {
    label: 'Textarea', icon: 'type', category: 'form',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { value: '', placeholder: '', rows: 4 }),
    schema: Object.assign({}, BOX, TEXT, {
      value:       { type: 'string' },
      placeholder: { type: 'string' },
      rows:        { type: 'int' },
      disabled:    { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.textarea(lift(p, ['value','placeholder','rows','disabled']))
      box(el, p); text(el, p)
      return el
    },
  })

  reg('numberInput', {
    label: 'Number Input', icon: 'hash', category: 'form',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, { value: 0, step: 1, precision: 0 }),
    schema: Object.assign({}, BOX, {
      value:     { type: 'float' },
      min:       { type: 'float' },
      max:       { type: 'float' },
      step:      { type: 'float' },
      precision: { type: 'int' },
      disabled:  { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.numberInput(lift(p, ['value','min','max','step','precision','disabled']))
      box(el, p)
      return el
    },
  })

  reg('checkbox', {
    label: 'Checkbox', icon: 'check', category: 'form',
    bindable: ['value'],
    defaultProps: { value: false, label: '' },
    schema: {
      value:    { type: 'bool' },
      label:    { type: 'string' },
      disabled: { type: 'bool' },
    },
    factory: function (p) { return ui.checkbox(lift(p, ['value','label','disabled'])) },
  })

  reg('switch', {
    label: 'Switch', icon: 'toggle-right', category: 'form',
    bindable: ['value'],
    defaultProps: { value: false },
    schema: { value: { type: 'bool' }, disabled: { type: 'bool' } },
    factory: function (p) { return ui.switch(lift(p, ['value','disabled'])) },
  })

  reg('slider', {
    label: 'Slider', icon: 'sliders', category: 'form',
    bindable: ['value'],
    defaultProps: { value: 0, min: 0, max: 100, step: 1, showValue: true },
    schema: {
      value:     { type: 'float' },
      min:       { type: 'float' },
      max:       { type: 'float' },
      step:      { type: 'float' },
      showValue: { type: 'bool' },
      disabled:  { type: 'bool' },
    },
    factory: function (p) { return ui.slider(lift(p, ['value','min','max','step','showValue','disabled'])) },
  })

  reg('select', {
    label: 'Select', icon: 'list', category: 'form',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, { value: '', options: [] }),
    schema: Object.assign({}, BOX, {
      value:    { type: 'string' },
      options:  { type: 'array' },
      disabled: { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.select(lift(p, ['value','options','disabled']))
      box(el, p)
      return el
    },
  })

  reg('colorInput', {
    label: 'Color', icon: 'palette', category: 'form',
    bindable: ['value'],
    defaultProps: { value: '#000000' },
    schema: { value: { type: 'string' }, disabled: { type: 'bool' } },
    factory: function (p) { return ui.colorInput(lift(p, ['value','disabled'])) },
  })

  reg('dateInput', {
    label: 'Date', icon: 'calendar', category: 'form',
    bindable: ['value'],
    defaultProps: { value: '' },
    schema: { value: { type: 'string' }, disabled: { type: 'bool' } },
    factory: function (p) { return ui.dateInput(lift(p, ['value','disabled'])) },
  })

  // ── base / display ─────────────────────────────────────────────────
  reg('button', {
    label: 'Button', icon: 'plus', category: 'base',
    bindable: ['text'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { text: 'Button', kind: 'default', size: 'md' }),
    schema: Object.assign({}, BOX, TEXT, {
      text:     { type: 'string' },
      kind:     { type: 'enum_string', type_agv: { options: ['default','primary','ghost','danger'] } },
      size:     { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      disabled: { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.button(lift(p, ['text','kind','size','disabled']))
      box(el, p); text(el, p)
      return el
    },
  })

  reg('iconButton', {
    label: 'Icon Button', icon: 'plus', category: 'base',
    bindable: ['icon'],
    defaultProps: Object.assign({}, BOX_D, { icon: 'plus', size: 'md', kind: 'default' }),
    schema: Object.assign({}, BOX, {
      icon:     { type: 'string' },
      title:    { type: 'string' },
      size:     { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      kind:     { type: 'enum_string', type_agv: { options: ['default','primary','ghost','danger'] } },
      disabled: { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.iconButton(lift(p, ['icon','title','size','kind','disabled']))
      box(el, p)
      return el
    },
  })

  reg('icon', {
    label: 'Icon', icon: 'image', category: 'base',
    bindable: ['name'],
    defaultProps: { name: 'image', size: 'md', color: '' },
    schema: {
      name:  { type: 'string' },
      size:  { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      color: { type: 'string' },
    },
    factory: function (p) {
      const el = ui.icon(lift(p, ['name','size']))
      // Single-prop "color" maps to el.style.color directly — no need for
      // the full TEXT_STYLE fragment for an icon.
      EF.effect(function () {
        const c = (p() || {}).color
        el.style.color = (c == null || c === '') ? '' : c
      })
      return el
    },
  })

  reg('badge', {
    label: 'Badge', icon: 'tag', category: 'display',
    bindable: ['text'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { text: 'NEW', kind: 'accent' }),
    schema: Object.assign({}, BOX, TEXT, {
      text: { type: 'string' },
      kind: { type: 'enum_string', type_agv: { options: ['default','accent','success','warn','error'] } },
      dot:  { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.badge(lift(p, ['text','kind','dot']))
      box(el, p); text(el, p)
      return el
    },
  })

  reg('tag', {
    label: 'Tag', icon: 'tag', category: 'display',
    bindable: ['text'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { text: 'tag', color: 'gray' }),
    schema: Object.assign({}, BOX, TEXT, {
      text:  { type: 'string' },
      color: { type: 'enum_string', type_agv: { options: ['gray','accent','green','red','blue','yellow'] } },
    }),
    factory: function (p) {
      const el = ui.tag(lift(p, ['text','color']))
      box(el, p); text(el, p)
      return el
    },
  })

  reg('banner', {
    label: 'Banner', icon: 'alert-triangle', category: 'display',
    bindable: ['title', 'message'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { kind: 'info', title: '', message: '' }),
    schema: Object.assign({}, BOX, TEXT, {
      kind:    { type: 'enum_string', type_agv: { options: ['info','success','warn','error'] } },
      title:   { type: 'string' },
      message: { type: 'string' },
    }),
    factory: function (p) {
      const el = ui.banner(lift(p, ['kind','title','message']))
      box(el, p); text(el, p)
      return el
    },
  })

  reg('divider', {
    label: 'Divider', icon: 'minus', category: 'display',
    bindable: ['label'],
    defaultProps: Object.assign({}, BOX_D, { label: '', vertical: false }),
    schema: Object.assign({}, BOX, { label: { type: 'string' }, vertical: { type: 'bool' } }),
    factory: function (p) {
      const el = ui.divider(lift(p, ['label','vertical']))
      box(el, p)
      return el
    },
  })

  reg('progressBar', {
    label: 'Progress', icon: 'spinner', category: 'display',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, { value: 0, max: 100, showLabel: true }),
    schema: Object.assign({}, BOX, {
      value:     { type: 'float' },
      max:       { type: 'float' },
      showLabel: { type: 'bool' },
    }),
    factory: function (p) {
      const el = ui.progressBar(lift(p, ['value','max','showLabel']))
      box(el, p)
      return el
    },
  })

  reg('spinner', {
    label: 'Spinner', icon: 'spinner', category: 'display',
    bindable: [],
    defaultProps: { size: 'md' },
    schema: { size: { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } } },
    factory: function (p) { return ui.spinner(lift(p, ['size'])) },
  })

  reg('kbd', {
    label: 'Keyboard', icon: 'type', category: 'display',
    bindable: ['text'],
    defaultProps: Object.assign({}, BOX_D, TEXT_D, { text: 'Ctrl+K' }),
    schema: Object.assign({}, BOX, TEXT, { text: { type: 'string' } }),
    factory: function (p) {
      const el = ui.kbd(lift(p, ['text']))
      box(el, p); text(el, p)
      return el
    },
  })

  // ── editor / asset ────────────────────────────────────────────────
  reg('assetPicker', {
    label: 'Asset', icon: 'image', category: 'editor',
    bindable: ['value'],
    defaultProps: Object.assign({}, BOX_D, { value: '', kind: 'image', placeholder: '' }),
    schema: Object.assign({}, BOX, {
      value:       { type: 'string' },
      kind:        { type: 'enum_string', type_agv: { options: ['image','audio','file'] } },
      placeholder: { type: 'string' },
      accept:      { type: 'string' },
    }),
    factory: function (p) {
      const el = ui.assetPicker(lift(p, ['value','kind','placeholder','accept']))
      box(el, p)
      return el
    },
  })
})(window.EF = window.EF || {})
