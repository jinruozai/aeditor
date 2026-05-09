;(function (EF) {
  'use strict'

  const ui = EF.ui

  function read(v) { return ui.isSignal(v) ? v() : v }
  function readList(v) { return read(v) || [] }

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function labelOf(item, fallback) {
    return item.name || item.label || fallback || item.id
  }

  function statusOf(agent) {
    return agent.status || 'idle'
  }

  function statusLabel(status) {
    return String(status || 'idle').toUpperCase()
  }

  function orderOf(item, index) {
    return item.order != null ? item.order : index
  }

  function agentNodeId(id) {
    return 'agent:' + id
  }

  function makeAgentLabel(node) {
    const wrap = ui.h('span', 'ef-ai-agent-label')
    wrap.appendChild(ui.h('span', 'ef-ai-agent-dot ef-ai-agent-dot-' + node.status))
    wrap.appendChild(ui.h('span', 'ef-ai-agent-name', { text: node.label }))
    wrap.title = node.label
    return wrap
  }

  function makeStatus(node) {
    const wrap = ui.h('span', 'ef-ai-agent-meta')
    const count = Number(node.queuedCount || 0) + Number(node.unreadInboxCount || 0)
    if (count) wrap.appendChild(ui.h('span', 'ef-ai-group-count', { text: String(count) }))
    if (node.status && node.status !== 'idle') {
      wrap.appendChild(ui.h('span', 'ef-ai-status-pill ef-ai-status-' + node.status, { text: statusLabel(node.status) }))
    }
    return wrap
  }

  function compareNode(a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return String(a.label).localeCompare(String(b.label))
  }

  function sortTree(nodes) {
    nodes.sort(compareNode)
    for (let i = 0; i < nodes.length; i++) sortTree(nodes[i].children || [])
  }

  function toTreeItems(agents) {
    const activeId = read(EF.ai.activeAgentId)
    const roots = []
    const byId = {}
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      byId[agent.id] = {
        id: agentNodeId(agent.id),
        label: labelOf(agent, 'Agent'),
        kind: 'agent',
        agentId: agent.id,
        parentAgentId: agent.parentAgentId || null,
        status: statusOf(agent),
        queuedCount: (agent.queue || []).length,
        unreadInboxCount: (agent.inbox || []).filter(function (event) { return !event.consumed }).length,
        isActive: agent.id === activeId,
        sortOrder: orderOf(agent, i),
        children: [],
      }
    }
    Object.keys(byId).forEach(function (id) {
      const node = byId[id]
      const parent = node.parentAgentId ? byId[node.parentAgentId] : null
      if (parent && parent !== node) parent.children.push(node)
      else roots.push(node)
    })
    sortTree(roots)
    return roots
  }

  function findNode(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i]
      const found = findNode(nodes[i].children || [], id)
      if (found) return found
    }
    return null
  }

  function findPath(nodes, id, path) {
    path = path || []
    for (let i = 0; i < nodes.length; i++) {
      const nextPath = path.concat([nodes[i].id])
      if (nodes[i].id === id) return nextPath
      const found = findPath(nodes[i].children || [], id, nextPath)
      if (found) return found
    }
    return null
  }

  function expandableIds(nodes, out) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].children && nodes[i].children.length) {
        out.add(nodes[i].id)
        expandableIds(nodes[i].children, out)
      }
    }
    return out
  }

  function activeNodeId() {
    const id = read(EF.ai.activeAgentId)
    return id ? agentNodeId(id) : null
  }

  function firstAgentNodeId(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].kind === 'agent') return nodes[i].id
      const found = firstAgentNodeId(nodes[i].children || [])
      if (found) return found
    }
    return null
  }

  function createAgent(parentAgentId) {
    EF.ai.createAgent({ name: 'Agent', parentAgentId: parentAgentId || null })
  }

  function renameNode(node) {
    ui.prompt({ title: 'Rename Agent', message: 'Name', default: node.label }).then(function (name) {
      if (!name || name === node.label) return
      EF.ai.renameAgent(node.agentId, name)
    })
  }

  function deleteNode(node) {
    EF.ai.deleteAgent(node.agentId)
  }

  function commitDrop(target, position, data) {
    const source = data.nodes[0]
    if (!source || source.id === target.id) return
    if (position === 'inside') {
      EF.ai.reparentAgent(source.agentId, target.agentId)
      return
    }
    EF.ai.reparentAgent(source.agentId, target.parentAgentId || null, target.sortOrder + (position === 'after' ? 1 : -1))
  }

  function rootMenu() {
    return [{ label: 'New Agent', icon: 'user', onSelect: function () { createAgent(null) } }]
  }

  function openRootMenu(ev) {
    if (ev.target.closest && ev.target.closest('.ef-ui-tree-row')) return
    ev.preventDefault()
    ui.contextMenu({ x: ev.clientX, y: ev.clientY }, rootMenu())
  }

  function factory() {
    const root = ui.h('div', 'ef-ai-panel ef-ai-agents')
    const itemsSig = EF.signal([])
    const selectedSig = EF.signal([])
    const expandedSig = EF.signal(new Set())
    let expansionSeeded = false
    let knownAgentIds = new Set()

    const toolbar = ui.h('div', 'ef-ai-toolbar')
    toolbar.appendChild(ui.button({
      text: '新对话',
      kind: 'default',
      size: 'sm',
      onClick: function () {
        createAgent(null)
      },
    }))
    root.appendChild(toolbar)

    const tree = ui.tree({
      items: itemsSig,
      selected: selectedSig,
      expanded: expandedSig,
      multi: false,
      rowHeight: 24,
      showArrow: 'always',
      onRowClick: function () { return 'select' },
      onSelect: function (ids) {
        if (!ids.length) return
        const node = findNode(itemsSig.peek(), ids[0])
        if (node) EF.ai.selectAgent(node.agentId)
      },
      trailingSlot: makeStatus,
      leadingSlot: function () { return null },
      labelSlot: makeAgentLabel,
      actions: function (node) {
        return [
          { icon: 'user-plus', title: 'New child agent', onClick: function () { createAgent(node.agentId) } },
          { icon: 'edit', title: 'Rename', onClick: function () { renameNode(node) } },
          { icon: 'trash', title: 'Delete', onClick: function () { deleteNode(node) } },
        ]
      },
      contextMenu: function (node) {
        return [
          { label: 'New Child Agent', icon: 'user-plus', onSelect: function () { createAgent(node.agentId) } },
          { type: 'divider' },
          { label: 'Rename', icon: 'edit', onSelect: function () { renameNode(node) } },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: function () { deleteNode(node) } },
        ]
      },
      dnd: {
        canDrag: function () { return true },
        getDragData: function (nodes) { return { types: ['ef.ai/agent'], nodes: nodes } },
        dropZones: function () { return ['before', 'inside', 'after'] },
        canDrop: function (node, position, data) {
          const source = data.nodes[0]
          if (!source || source.id === node.id) return false
          if (position === 'inside') return !EF.ai.isDescendant(source.agentId, node.agentId)
          return true
        },
        onDrop: commitDrop,
      },
    })
    tree.classList.add('ef-ai-agent-tree')
    tree.addEventListener('contextmenu', openRootMenu)
    root.appendChild(tree)

    function syncTree() {
      const agents = readList(EF.ai.agents)
      const items = toTreeItems(agents)
      itemsSig.set(items)
      if (!expansionSeeded) {
        expandedSig.set(expandableIds(items, new Set()))
        expansionSeeded = true
      }
      const nextKnown = new Set()
      const nextExpanded = new Set(expandedSig.peek())
      for (let i = 0; i < agents.length; i++) {
        nextKnown.add(agents[i].id)
        if (knownAgentIds.has(agents[i].id)) continue
        const path = findPath(items, agentNodeId(agents[i].id)) || []
        for (let j = 0; j < path.length - 1; j++) nextExpanded.add(path[j])
      }
      knownAgentIds = nextKnown
      expandedSig.set(nextExpanded)
      const selected = selectedSig.peek()[0]
      const active = activeNodeId() || firstAgentNodeId(items)
      if (selected !== active) selectedSig.set(active ? [active] : [])
    }

    ui.collect(root, EF.effect(syncTree))
    return root
  }

  EF.registerComponent('ai-agents-list', {
    category: 'panel',
    label: 'AI Agents',
    icon: 'user',
    defaults: function () { return { title: 'AI Agents', icon: 'user', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
