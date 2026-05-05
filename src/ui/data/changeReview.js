;(function (EF) {
  'use strict'

  const ui = EF.ui

  function read(v) {
    return ui.isSignal(v) ? v() : v
  }

  function text(value) {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    const raw = JSON.stringify(value)
    return raw.length > 240 ? raw.slice(0, 237) + '...' : raw
  }

  function stat(summary) {
    const parts = []
    if (summary.changeCount != null) parts.push(summary.changeCount + ' changes')
    if (summary.resourceCount != null) parts.push(summary.resourceCount + ' resources')
    if (summary.errors) parts.push(summary.errors + ' errors')
    if (summary.warnings) parts.push(summary.warnings + ' warnings')
    return parts.join(' · ')
  }

  function statusClass(status) {
    return 'ef-change-review-status ef-change-review-status-' + (status || 'pending')
  }

  function appendActions(parent, set, opts, root) {
    const actions = ui.h('div', 'ef-change-review-actions')
    const allowApply = opts.allowApply !== false && set.status !== 'applied' && set.status !== 'rejected'
    const allowReject = opts.allowReject !== false && set.status !== 'applied' && set.status !== 'rejected'
    if (allowApply) {
      actions.appendChild(ui.button({
        text: opts.applyText || 'Apply',
        kind: 'primary',
        size: 'sm',
        onClick: function () { runAction(opts.onApply || function () { return EF.changeSet.apply(set, { type: 'all' }, 'user') }, set, { type: 'all' }, root, opts) },
      }))
    }
    if (allowReject) {
      actions.appendChild(ui.button({
        text: opts.rejectText || 'Reject',
        kind: 'default',
        size: 'sm',
        onClick: function () { runAction(opts.onReject || function () { return EF.changeSet.reject(set, { type: 'all' }, 'user') }, set, { type: 'all' }, root, opts) },
      }))
    }
    actions.appendChild(ui.copyButton({ text: JSON.stringify(set, null, 2), title: 'Copy ChangeSet', size: 'sm' }))
    parent.appendChild(actions)
  }

  function runAction(fn, set, scope, root, opts) {
    Promise.resolve(fn(set, scope)).then(function (next) {
      if (next && EF.changeSet && EF.changeSet.isChangeSet(next)) renderInto(root, next, opts)
    })
  }

  function renderValidation(set) {
    const validation = set.validation || {}
    const items = (validation.errors || []).concat(validation.warnings || [])
    if (!items.length) return null
    const wrap = ui.h('div', 'ef-change-review-validation')
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      wrap.appendChild(ui.h('div', 'ef-change-review-validation-item', {
        text: (item.path ? item.path + ': ' : '') + (item.message || text(item)),
      }))
    }
    return wrap
  }

  function renderResource(resource, set, opts) {
    const block = ui.h('div', 'ef-change-review-resource')
    const head = ui.h('button', 'ef-change-review-resource-head', { type: 'button' })
    const label = ui.h('div', 'ef-change-review-resource-label')
    label.appendChild(ui.h('div', 'ef-change-review-resource-title', { text: resource.title || resource.uri || resource.id }))
    label.appendChild(ui.h('div', 'ef-change-review-resource-subtitle', { text: resource.subtitle || resource.uri || '' }))
    head.appendChild(label)
    head.appendChild(ui.h('span', statusClass(resource.status), { text: resource.status || 'pending' }))
    block.appendChild(head)

    const changes = ui.h('div', 'ef-change-review-changes')
    for (let i = 0; i < (resource.changes || []).length; i++) {
      changes.appendChild(renderChange(resource.changes[i], resource, set, opts))
    }
    block.appendChild(changes)
    return block
  }

  function renderChange(change, resource, set, opts) {
    const renderer = EF.changeSet && EF.changeSet.rendererFor
      ? EF.changeSet.rendererFor(change, resource, set)
      : null
    if (renderer && renderer.render) {
      const rendered = renderer.render(change, { resource: resource, changeSet: set, options: opts })
      if (rendered) return rendered
    }
    const row = ui.h('div', 'ef-change-review-change ef-change-review-change-' + (change.operation || 'update'))
    const meta = ui.h('div', 'ef-change-review-change-meta')
    meta.appendChild(ui.h('span', 'ef-change-review-op', { text: change.operation || 'update' }))
    meta.appendChild(ui.h('span', 'ef-change-review-path', { text: change.path || change.field || change.title || change.id }))
    meta.appendChild(ui.h('span', statusClass(change.status), { text: change.status || 'pending' }))
    row.appendChild(meta)
    if (change.summary) row.appendChild(ui.h('div', 'ef-change-review-change-summary', { text: change.summary }))
    const diff = ui.h('div', 'ef-change-review-diff')
    diff.appendChild(renderValue('Before', change.before))
    diff.appendChild(renderValue('After', change.after))
    row.appendChild(diff)
    return row
  }

  function renderValue(label, value) {
    const node = ui.h('div', 'ef-change-review-value ef-change-review-value-' + label.toLowerCase())
    node.appendChild(ui.h('span', 'ef-change-review-value-label', { text: label }))
    node.appendChild(ui.h('code', 'ef-change-review-value-text', { text: text(value) }))
    return node
  }

  function renderInto(root, set, opts) {
    while (root.firstChild) {
      const child = root.firstChild
      ui.dispose(child)
      child.remove()
    }
    if (!set || !EF.changeSet || !EF.changeSet.isChangeSet(set)) {
      root.appendChild(ui.h('div', 'ef-change-review-empty', { text: 'No ChangeSet' }))
      return
    }
    const head = ui.h('div', 'ef-change-review-head')
    const title = ui.h('div', 'ef-change-review-title-block')
    title.appendChild(ui.h('div', 'ef-change-review-title', { text: set.title || 'Change Set' }))
    title.appendChild(ui.h('div', 'ef-change-review-summary', { text: stat(set.summary || {}) }))
    head.appendChild(title)
    head.appendChild(ui.h('span', statusClass(set.status), { text: set.status || 'pending' }))
    appendActions(head, set, opts, root)
    root.appendChild(head)
    if (set.description) root.appendChild(ui.h('div', 'ef-change-review-description', { text: set.description }))
    const validation = renderValidation(set)
    if (validation) root.appendChild(validation)
    const resources = ui.h('div', 'ef-change-review-resources')
    for (let i = 0; i < (set.resources || []).length; i++) resources.appendChild(renderResource(set.resources[i], set, opts))
    root.appendChild(resources)
  }

  ui.changeReview = function changeReview(opts) {
    opts = opts || {}
    const root = ui.h('div', 'ef-change-review')
    ui.collect(root, EF.effect(function () {
      renderInto(root, read(opts.changeSet), opts)
    }))
    return root
  }
})(window.EF = window.EF || {})
