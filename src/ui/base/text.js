// EF.ui.text — display-only styled text. Static content (props.value) or
// signal-bound. Use this anywhere the user shouldn't be able to edit; for
// editing use ui.input / ui.textarea.
//
// opts: {
//   value:   string | signal<any>          stringified for display
//   align?:  'left' | 'center' | 'right' | signal
//   variant?:'body' | 'h1' | 'h2' | 'caption' | signal
//   size?:   'sm' | 'md' | 'lg' | signal
//   weight?: 'normal' | 'bold' | signal
//   color?:  string | signal
//   clamp?:  number | signal               max lines (CSS line-clamp)
// }
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.text = function (opts) {
    const o = opts || {}
    const value   = ui.asSig(o.value   != null ? o.value   : '')
    const align   = ui.asSig(o.align   != null ? o.align   : 'left')
    const variant = ui.asSig(o.variant != null ? o.variant : 'body')
    const size    = ui.asSig(o.size    != null ? o.size    : 'md')
    const weight  = ui.asSig(o.weight  != null ? o.weight  : 'normal')
    const color   = ui.asSig(o.color   != null ? o.color   : '')
    const clamp   = ui.asSig(o.clamp   != null ? o.clamp   : 0)

    const el = ui.h('div', 'ef-ui-text')
    ui.bindClass(el, variant, 'ef-ui-text-')
    ui.bindClass(el, size,    'ef-ui-text-size-')
    ui.bind(el, value,  function (v) { el.textContent = v == null ? '' : String(v) })
    ui.bind(el, align,  function (v) { el.style.textAlign = v || '' })
    ui.bind(el, weight, function (v) { el.style.fontWeight = v || '' })
    ui.bind(el, color,  function (v) { el.style.color = v || '' })
    ui.bind(el, clamp,  function (v) {
      const n = Number(v) || 0
      if (n > 0) {
        el.style.display = '-webkit-box'
        el.style.webkitLineClamp = String(n)
        el.style.webkitBoxOrient = 'vertical'
        el.style.overflow = 'hidden'
      } else {
        el.style.display = ''
        el.style.webkitLineClamp = ''
        el.style.overflow = ''
      }
    })
    return el
  }

  // Visual chrome (background / border / radius / padding / color /
  // font / textAlign / etc) comes from the shared BOX_STYLE + TEXT_STYLE
  // fragments. The text component owns only the semantic shortcuts
  // (variant, size — preset CSS classes for h1/h2/body/caption +
  // sm/md/lg) and content controls (value, clamp). align / color /
  // weight are not passed through ui.text directly — applyTextStyle
  // drives them, so user-set values override and empty values cascade
  // to the theme.
  EF.registerComponent('text', {
    label: 'Text', icon: 'type', category: 'display',
    bindable:     ['value'],
    defaultProps: Object.assign({}, ui.BOX_STYLE_DEFAULTS, ui.TEXT_STYLE_DEFAULTS, {
      value: 'Text', variant: 'body', size: 'md', clamp: null,
    }),
    schema: Object.assign({}, ui.BOX_STYLE_SCHEMA, ui.TEXT_STYLE_SCHEMA, {
      value:   { type: 'string' },
      variant: { type: 'enum_string', type_agv: { options: ['body','h1','h2','caption'] } },
      size:    { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      clamp:   { type: 'int' },
    }),
    factory: function (propsSig) {
      const el = ui.text(ui.liftProps(propsSig, ['value','variant','size','clamp']))
      ui.applyBoxStyle(el, propsSig)
      ui.applyTextStyle(el, propsSig)
      return el
    },
  })
})(window.EF = window.EF || {})
