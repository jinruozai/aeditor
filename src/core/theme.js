// Theme runtime helpers.
//
// CSS owns the visual system; this file only provides a tiny public API for
// choosing a theme on :root or one aeditor root and applying token
// overrides without forcing users to manipulate attributes manually.
;(function (aeditor) {
  'use strict'

  const ATTR = 'data-aeditor-theme'
  const DENSITY_ATTR = 'data-aeditor-density'
  const DEFAULT = 'dark'
  const DEFAULT_DENSITY = 'default'

  const authoringTokens = [
    '--aeditor-surface-canvas',
    '--aeditor-surface-lower',
    '--aeditor-surface-frame',
    '--aeditor-surface-panel',
    '--aeditor-surface-field',
    '--aeditor-surface-hover',
    '--aeditor-surface-active',
    '--aeditor-surface-raised',
    '--aeditor-text-primary',
    '--aeditor-text-body',
    '--aeditor-text-label',
    '--aeditor-text-muted',
    '--aeditor-text-disabled',
    '--aeditor-stroke-subtle',
    '--aeditor-stroke-strong',
    '--aeditor-stroke-field',
    '--aeditor-stroke-hover',
    '--aeditor-brand',
    '--aeditor-brand-hover',
    '--aeditor-brand-contrast',
    '--aeditor-state-success',
    '--aeditor-state-warning',
    '--aeditor-state-danger',
    '--aeditor-state-info',
  ]

  function docEl() {
    return document.documentElement
  }

  function target(root) {
    return root || docEl()
  }

  function set(mode, root) {
    const el = target(root)
    const next = mode || DEFAULT
    if (next === DEFAULT && el === docEl()) el.removeAttribute(ATTR)
    else el.setAttribute(ATTR, next)
    return next
  }

  function get(root) {
    return target(root).getAttribute(ATTR) || DEFAULT
  }

  function setDensity(density, root) {
    const el = target(root)
    const next = density || DEFAULT_DENSITY
    if (next === DEFAULT_DENSITY) el.removeAttribute(DENSITY_ATTR)
    else el.setAttribute(DENSITY_ATTR, next)
    return next
  }

  function getDensity(root) {
    return target(root).getAttribute(DENSITY_ATTR) || DEFAULT_DENSITY
  }

  function apply(tokens, root) {
    const el = target(root)
    for (const k in tokens) el.style.setProperty(k, tokens[k])
    return el
  }

  function reset(root, names) {
    const el = target(root)
    const list = names || authoringTokens
    for (let i = 0; i < list.length; i++) el.style.removeProperty(list[i])
    return el
  }

  function read(name, root) {
    return getComputedStyle(target(root)).getPropertyValue(name).trim()
  }

  function exportCss(root, names) {
    const list = names || authoringTokens
    const lines = [':root {']
    for (let i = 0; i < list.length; i++) {
      const value = read(list[i], root)
      if (value) lines.push('  ' + list[i] + ': ' + value + ';')
    }
    lines.push('}')
    return lines.join('\n')
  }

  aeditor.theme = {
    attr: ATTR,
    densityAttr: DENSITY_ATTR,
    default: DEFAULT,
    defaultDensity: DEFAULT_DENSITY,
    authoringTokens: authoringTokens.slice(),
    set: set,
    get: get,
    setDensity: setDensity,
    getDensity: getDensity,
    apply: apply,
    reset: reset,
    read: read,
    exportCss: exportCss,
  }
})(window.aeditor = window.aeditor || {})
