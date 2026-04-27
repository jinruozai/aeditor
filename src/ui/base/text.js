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

  EF.registerComponent('text', {
    label: 'Text', icon: 'type', category: 'display',
    bindable:     ['value'],
    defaultProps: { value: 'Text', align: 'left', variant: 'body', size: 'md' },
    schema: {
      value:   { type: 'string' },
      align:   { type: 'enum_string', type_agv: { options: ['left','center','right'] } },
      variant: { type: 'enum_string', type_agv: { options: ['body','h1','h2','caption'] } },
      size:    { type: 'enum_string', type_agv: { options: ['sm','md','lg'] } },
      weight:  { type: 'enum_string', type_agv: { options: ['normal','bold'] } },
      color:   { type: 'string' },
      clamp:   { type: 'int' },
    },
    factory: function (propsSig) {
      return ui.text(ui.liftProps(propsSig, ['value','align','variant','size','weight','color','clamp']))
    },
  })
})(window.EF = window.EF || {})
