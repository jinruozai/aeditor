// Component-registry sidecar — registers the built-in ui.* widgets as
// palette-able components so EF.ui.renderUITree (and editors / palettes
// built on top of it) can instantiate them by name. Each entry adapts the
// `(propsSig, ctx) → el` factory contract to the underlying ui.* function
// via ui.liftProps, and ships a structconfig schema describing the props
// that property-panel can edit.
//
// Apps add their own components with EF.registerComponent — this file is
// just the bundled defaults. Conventions:
//   bindable[]    — prop keys safe to bind to a data field at runtime.
//                   Editors that wire bindings ignore everything else.
//   defaultProps  — initial props when the component is dragged out of a
//                   palette into a tree.
//   schema        — typeconfig-shaped struct_def for the property panel.
;(function (EF) {
  'use strict'
  const ui = EF.ui
  const reg = EF.registerComponent
  const lift = ui.liftProps

  // ── form ──────────────────────────────────────────────────────────
  reg('input', {
    label: 'Text Input', icon: 'type', category: 'form',
    bindable: ['value'],
    defaultProps: { value: '', placeholder: '' },
    schema: {
      value:       { type: 'string' },
      placeholder: { type: 'string' },
      disabled:    { type: 'bool' },
      readOnly:    { type: 'bool' },
    },
    factory: function (p) { return ui.input(lift(p, ['value','placeholder','disabled','readOnly'])) },
  })

  reg('textarea', {
    label: 'Textarea', icon: 'type', category: 'form',
    bindable: ['value'],
    defaultProps: { value: '', placeholder: '', rows: 4 },
    schema: {
      value:       { type: 'string' },
      placeholder: { type: 'string' },
      rows:        { type: 'int' },
      disabled:    { type: 'bool' },
    },
    factory: function (p) { return ui.textarea(lift(p, ['value','placeholder','rows','disabled'])) },
  })

  reg('numberInput', {
    label: 'Number Input', icon: 'hash', category: 'form',
    bindable: ['value'],
    defaultProps: { value: 0, step: 1, precision: 0 },
    schema: {
      value:     { type: 'float' },
      min:       { type: 'float' },
      max:       { type: 'float' },
      step:      { type: 'float' },
      precision: { type: 'int' },
      disabled:  { type: 'bool' },
    },
    factory: function (p) { return ui.numberInput(lift(p, ['value','min','max','step','precision','disabled'])) },
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
    defaultProps: { value: '', options: [] },
    schema: {
      value:    { type: 'string' },
      options:  { type: 'array' },
      disabled: { type: 'bool' },
    },
    factory: function (p) { return ui.select(lift(p, ['value','options','disabled'])) },
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
    defaultProps: { text: 'Button', kind: 'default', size: 'md' },
    schema: {
      text:     { type: 'string' },
      kind:     { type: 'enum_string', type_agv: { options: ['default','primary','ghost','danger'] } },
      size:     { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      disabled: { type: 'bool' },
    },
    factory: function (p) { return ui.button(lift(p, ['text','kind','size','disabled'])) },
  })

  reg('iconButton', {
    label: 'Icon Button', icon: 'plus', category: 'base',
    bindable: ['icon'],
    defaultProps: { icon: 'plus', size: 'md', kind: 'default' },
    schema: {
      icon:     { type: 'string' },
      title:    { type: 'string' },
      size:     { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      kind:     { type: 'enum_string', type_agv: { options: ['default','primary','ghost','danger'] } },
      disabled: { type: 'bool' },
    },
    factory: function (p) { return ui.iconButton(lift(p, ['icon','title','size','kind','disabled'])) },
  })

  reg('icon', {
    label: 'Icon', icon: 'image', category: 'base',
    bindable: ['name'],
    defaultProps: { name: 'image', size: 'md' },
    schema: {
      name: { type: 'string' },
      size: { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
    },
    factory: function (p) { return ui.icon(lift(p, ['name','size'])) },
  })

  reg('badge', {
    label: 'Badge', icon: 'tag', category: 'display',
    bindable: ['text'],
    defaultProps: { text: 'NEW', kind: 'accent' },
    schema: {
      text: { type: 'string' },
      kind: { type: 'enum_string', type_agv: { options: ['default','accent','success','warn','error'] } },
      dot:  { type: 'bool' },
    },
    factory: function (p) { return ui.badge(lift(p, ['text','kind','dot'])) },
  })

  reg('tag', {
    label: 'Tag', icon: 'tag', category: 'display',
    bindable: ['text'],
    defaultProps: { text: 'tag', color: 'gray' },
    schema: {
      text:  { type: 'string' },
      color: { type: 'enum_string', type_agv: { options: ['gray','accent','green','red','blue','yellow'] } },
    },
    factory: function (p) { return ui.tag(lift(p, ['text','color'])) },
  })

  reg('banner', {
    label: 'Banner', icon: 'alert-triangle', category: 'display',
    bindable: ['title', 'message'],
    defaultProps: { kind: 'info', title: '', message: '' },
    schema: {
      kind:    { type: 'enum_string', type_agv: { options: ['info','success','warn','error'] } },
      title:   { type: 'string' },
      message: { type: 'string' },
    },
    factory: function (p) { return ui.banner(lift(p, ['kind','title','message'])) },
  })

  reg('divider', {
    label: 'Divider', icon: 'minus', category: 'display',
    bindable: ['label'],
    defaultProps: { label: '', vertical: false },
    schema: { label: { type: 'string' }, vertical: { type: 'bool' } },
    factory: function (p) { return ui.divider(lift(p, ['label','vertical'])) },
  })

  reg('progressBar', {
    label: 'Progress', icon: 'spinner', category: 'display',
    bindable: ['value'],
    defaultProps: { value: 0, max: 100, showLabel: true },
    schema: {
      value:     { type: 'float' },
      max:       { type: 'float' },
      showLabel: { type: 'bool' },
    },
    factory: function (p) { return ui.progressBar(lift(p, ['value','max','showLabel'])) },
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
    defaultProps: { text: 'Ctrl+K' },
    schema: { text: { type: 'string' } },
    factory: function (p) { return ui.kbd(lift(p, ['text'])) },
  })

  // ── editor / asset ────────────────────────────────────────────────
  reg('assetPicker', {
    label: 'Asset', icon: 'image', category: 'editor',
    bindable: ['value'],
    defaultProps: { value: '', kind: 'image', placeholder: '' },
    schema: {
      value:       { type: 'string' },
      kind:        { type: 'enum_string', type_agv: { options: ['image','audio','file'] } },
      placeholder: { type: 'string' },
      accept:      { type: 'string' },
    },
    factory: function (p) { return ui.assetPicker(lift(p, ['value','kind','placeholder','accept'])) },
  })
})(window.EF = window.EF || {})
