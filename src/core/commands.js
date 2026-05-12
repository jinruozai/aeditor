// aeditor.commands - owner-aware command and menu seam registry.
;(function (aeditor) {
  'use strict'

  const commands = {}
  const commandMeta = {}
  const menus = {}
  const menuMeta = {}

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function keys(obj) { return Object.keys(obj) }

  function normalizeMeta(meta) {
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    return out
  }

  function passFilter(meta, filter) {
    if (!filter) return true
    if (filter.owner != null && meta.owner !== filter.owner) return false
    if (filter.layer != null && meta.layer !== filter.layer) return false
    return true
  }

  const matchesPrefix = aeditor.names.matchesPrefix

  function register(id, spec, meta) {
    if (!id) throw new Error('commands.register: id is required')
    if (commands[id]) throw new Error('commands.register: duplicate id "' + id + '"')
    const cmd = Object.assign({ id: id }, spec || {})
    commands[id] = cmd
    commandMeta[id] = normalizeMeta(meta)
    return cmd
  }

  function unregister(id, meta) {
    if (!commands[id]) return false
    const existing = commandMeta[id] || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('commands.unregister: owner mismatch for "' + id + '"')
    delete commands[id]
    delete commandMeta[id]
    return true
  }

  function unregisterOwner(owner) {
    const removed = []
    keys(commandMeta).forEach(function (id) {
      if (commandMeta[id].owner === owner) {
        delete commands[id]
        delete commandMeta[id]
        removed.push(id)
      }
    })
    keys(menuMeta).forEach(function (id) {
      if (menuMeta[id].owner === owner) {
        delete menus[id]
        delete menuMeta[id]
        removed.push(id)
      }
    })
    return removed
  }

  function unregisterPrefix(prefix) {
    const removed = []
    keys(commands).forEach(function (id) {
      if (matchesPrefix(id, prefix)) {
        delete commands[id]
        delete commandMeta[id]
        removed.push(id)
      }
    })
    keys(menus).forEach(function (id) {
      if (matchesPrefix(id, prefix)) {
        delete menus[id]
        delete menuMeta[id]
        removed.push(id)
      }
    })
    return removed
  }

  function get(id) {
    return commands[id] || null
  }

  function list(filter) {
    return keys(commands).filter(function (id) { return passFilter(commandMeta[id] || {}, filter) })
  }

  function run(id, input, ctx) {
    const cmd = get(id)
    if (!cmd) throw new Error('Command not found: ' + id)
    if (!cmd.run) return null
    return cmd.run(input || {}, Object.assign({ command: id }, ctx || {}))
  }

  function registerMenu(id, spec, meta) {
    if (!id) throw new Error('commands.registerMenu: id is required')
    if (menus[id]) throw new Error('commands.registerMenu: duplicate id "' + id + '"')
    const item = Object.assign({ id: id }, spec || {})
    item.target = item.target || 'global'
    item.order = item.order != null ? item.order : 0
    menus[id] = item
    menuMeta[id] = normalizeMeta(meta)
    return item
  }

  function unregisterMenu(id, meta) {
    if (!menus[id]) return false
    const existing = menuMeta[id] || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('commands.unregisterMenu: owner mismatch for "' + id + '"')
    delete menus[id]
    delete menuMeta[id]
    return true
  }

  function listMenus(filter) {
    return keys(menus).filter(function (id) { return passFilter(menuMeta[id] || {}, filter) })
  }

  function menuItems(target, filter) {
    const out = []
    keys(menus).forEach(function (id) {
      const meta = menuMeta[id] || {}
      const item = menus[id]
      if (item.target !== target) return
      if (!passFilter(meta, filter)) return
      const cmd = item.command ? commands[item.command] : null
      out.push({
        id: id,
        target: item.target,
        command: item.command || null,
        label: item.label || item.title || (cmd && (cmd.title || cmd.label)) || id,
        icon: item.icon || cmd && cmd.icon || '',
        kbd: item.kbd || cmd && cmd.kbd || '',
        danger: !!(item.danger || cmd && cmd.danger),
        disabled: !!item.disabled || item.command && !cmd,
        order: item.order,
      })
    })
    out.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order
      return String(a.label).localeCompare(String(b.label))
    })
    return out
  }

  function menuUiItems(target, ctx) {
    return menuItems(target).map(function (item) {
      return Object.assign({}, item, {
        onSelect: item.command && !item.disabled
          ? function () { run(item.command, {}, ctx || {}) }
          : null,
      })
    })
  }

  aeditor.commands = {
    register: register,
    unregister: unregister,
    unregisterOwner: unregisterOwner,
    unregisterPrefix: unregisterPrefix,
    get: get,
    list: list,
    run: run,
    registerMenu: registerMenu,
    unregisterMenu: unregisterMenu,
    listMenus: listMenus,
    menuItems: menuItems,
    menuUiItems: menuUiItems,
    meta: function (id) { return clone(commandMeta[id] || {}) },
    menuMeta: function (id) { return clone(menuMeta[id] || {}) },
  }
})(window.aeditor = window.aeditor || {})
