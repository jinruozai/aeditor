// Theme runtime helpers.
//
// CSS owns the visual system; this file only provides a tiny public API for
// choosing a theme on :root or one editorframe root and applying token
// overrides without forcing users to manipulate attributes manually.
;(function (EF) {
  'use strict'

  const ATTR = 'data-ef-theme'
  const DENSITY_ATTR = 'data-ef-density'
  const DEFAULT = 'dark'
  const DEFAULT_DENSITY = 'default'

  const authoringTokens = [
    '--ef-surface-canvas',
    '--ef-surface-lower',
    '--ef-surface-frame',
    '--ef-surface-panel',
    '--ef-surface-field',
    '--ef-surface-hover',
    '--ef-surface-active',
    '--ef-surface-raised',
    '--ef-text-primary',
    '--ef-text-body',
    '--ef-text-label',
    '--ef-text-muted',
    '--ef-text-disabled',
    '--ef-stroke-subtle',
    '--ef-stroke-strong',
    '--ef-stroke-field',
    '--ef-stroke-hover',
    '--ef-brand',
    '--ef-brand-hover',
    '--ef-brand-contrast',
    '--ef-state-success',
    '--ef-state-warning',
    '--ef-state-danger',
    '--ef-state-info',
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

  EF.theme = {
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
})(window.EF = window.EF || {})
