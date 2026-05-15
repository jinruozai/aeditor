// Built-in Inspector panel: renders the current aeditor.inspector selection.
;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function titleOf(targets, inspection) {
    if (inspection && inspection.title) {
      return typeof inspection.title === 'function' ? inspection.title(targets) : inspection.title
    }
    if (targets.length > 1) return targets.length + ' selected'
    const t = targets[0]
    return (t && (t.title || t.label || t.name || t.id)) || 'Inspector'
  }

  function subtitleOf(targets, inspection) {
    if (inspection && inspection.subtitle) return inspection.subtitle
    if (targets.length > 1) return targetType(targets[0]) + ' / primary ' + (targets[0].title || targets[0].id || '')
    return targetType(targets[0]) || ''
  }

  function targetType(target) {
    return target && (target.type || target.kind) || ''
  }

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'aeditor-inspector')
    const head = ui.h('div', 'aeditor-inspector-head')
    const title = ui.h('div', 'aeditor-inspector-title')
    const subtitle = ui.h('div', 'aeditor-inspector-subtitle')
    head.appendChild(title)
    head.appendChild(subtitle)
    const body = ui.h('div', 'aeditor-inspector-body')
    root.appendChild(head)
    root.appendChild(body)

    const schemaSig = aeditor.signal({})
    const valuesSig = aeditor.signal([])
    const disabledSig = aeditor.signal(false)
    let currentInspection = null
    let currentDispose = null
    let currentTargets = []
    let currentSubKey = ''
    let currentSubscribe = null
    let mode = ''
    let customEl = null

    function clearBody() {
      if (customEl) {
        ui.dispose(customEl)
        customEl = null
      }
      while (body.firstChild) ui.dispose(body.firstChild)
      mode = ''
    }

    function setSubscription(inspection, targets) {
      const nextKey = inspection ? subscriptionKey(inspection, targets) : ''
      const nextSubscribe = inspection && typeof inspection.subscribe === 'function' ? inspection.subscribe : null
      if (nextKey === currentSubKey && nextSubscribe === currentSubscribe) return
      if (currentDispose) currentDispose()
      currentDispose = null
      currentSubKey = nextKey
      currentSubscribe = nextSubscribe
      if (nextSubscribe) {
        currentDispose = aeditor.safeCall({ scope: 'inspector', action: 'subscribe', type: inspection.type }, function () {
          return nextSubscribe(refresh, {
            targets: targets,
            primary: targets[0],
            panel: ctx.panel,
            bus: ctx.bus,
          })
        })
      }
    }

    function callWrite(field, change, values) {
      aeditor.safeCall({ scope: 'inspector', action: 'write', type: currentInspection.type, field: field }, function () {
        currentInspection.write(field, change, {
          targets: currentTargets,
          primary: currentTargets[0],
          values: values,
          primaryValue: values[0],
          valueForChange: aeditor.inspector.valueForChange,
        })
      })
    }

    function subscriptionKey(inspection, targets) {
      if (typeof inspection.key === 'function') return inspection.type + ':' + inspection.key(targets)
      if (inspection.key != null) return inspection.type + ':' + inspection.key
      return inspection.type + ':' + targets.map(function (target) {
        return target.uri || target.id || target.name || target.title || targetType(target)
      }).join('|')
    }

    function mountEmpty(text, hint) {
      clearBody()
      title.textContent = text
      subtitle.textContent = hint || ''
      body.appendChild(ui.h('div', 'aeditor-inspector-empty', { text: hint || 'Select something to inspect.' }))
      mode = 'empty'
    }

    function mountCustom(inspection, targets) {
      clearBody()
      customEl = aeditor.safeCall({ scope: 'inspector', action: 'render', type: inspection.type }, function () { return inspection.render({
        targets: targets,
        primary: targets[0],
        values: inspection.values,
        panel: ctx.panel,
        bus: ctx.bus,
        refresh: refresh,
      }) })
      if (!customEl) {
        body.appendChild(ui.h('div', 'aeditor-inspector-empty', { text: 'Inspector renderer failed.' }))
        mode = 'empty'
        return
      }
      body.appendChild(customEl)
      mode = 'custom'
    }

    function mountForm(inspection, targets) {
      if (mode !== 'form') {
        clearBody()
        const form = ui.propertyForm({
          schema: schemaSig,
          targets: valuesSig,
          disabled: disabledSig,
          defaults: function () { return currentInspection && currentInspection.defaults },
          requireAllTargets: true,
          canEdit: function (field, values, rawField) {
            return aeditor.inspector.canEditField(currentInspection, field, values, rawField)
          },
          onChange: function (field, value, values, meta) {
            const change = meta && meta.change || aeditor.inspector.literalChange(field, value)
            callWrite(field, change, values)
          },
          ctx: function (field) {
            return { source: 'aeditor-inspector', field: field, targets: currentTargets, panel: ctx.panel }
          },
        })
        body.appendChild(form)
        mode = 'form'
      }
      schemaSig.set(inspection.schema || {})
      valuesSig.set(inspection.values || [])
      disabledSig.set(!!inspection.readonly || !inspection.write)
    }

    function refresh() {
      const targets = aeditor.inspector.selection()
      if (!targets.length) {
        currentInspection = null
        currentTargets = []
        setSubscription(null, targets)
        mountEmpty('Inspector', 'Select something to inspect.')
        return
      }
      const inspection = aeditor.inspector.inspect(targets, { panel: ctx.panel, bus: ctx.bus })
      if (!inspection) {
        currentInspection = null
        currentTargets = targets
        setSubscription(null, targets)
        mountEmpty('No Inspector', 'No provider for ' + (targetType(targets[0]) || 'selection') + '.')
        return
      }
      currentInspection = inspection
      currentTargets = targets
      title.textContent = titleOf(targets, inspection)
      subtitle.textContent = subtitleOf(targets, inspection)
      setSubscription(inspection, targets)
      if (inspection.render) mountCustom(inspection, targets)
      else mountForm(inspection, targets)
    }

    ctx.onCleanup(function () {
      if (currentDispose) currentDispose()
      currentDispose = null
      currentSubKey = ''
      currentSubscribe = null
      clearBody()
    })
    ctx.onCleanup(aeditor.effect(refresh))
    return root
  }

  aeditor.registerComponent('inspector', {
    category: 'panel',
    label: 'Inspector',
    icon: 'settings',
    defaults: function () { return { title: 'Inspector', icon: 'settings', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.aeditor = window.aeditor || {})
