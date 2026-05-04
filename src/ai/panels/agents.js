;(function (EF) {
  'use strict'

  const ui = EF.ui

  function read(v) {
    return ui.isSignal(v) ? v() : v
  }

  function readList(v) {
    return read(v) || []
  }

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function labelOf(item, fallback) {
    return item.name || item.label || fallback || item.id
  }

  function statusOf(agent) {
    return agent.status || (agent.running ? 'running' : 'idle')
  }

  function statusLabel(status) {
    return String(status || 'idle').toUpperCase()
  }

  function makeAgentLabel(node) {
    const wrap = ui.h('span', 'ef-ai-agent-label')
    wrap.appendChild(ui.h('span', 'ef-ai-agent-dot ef-ai-agent-dot-' + node.status))
    wrap.appendChild(ui.h('span', 'ef-ai-agent-name', { text: node.label }))
    wrap.title = node.label
    return wrap
  }

  function normalizedPath(path) {
    return EF.ai && EF.ai.normalizePath ? EF.ai.normalizePath(path) : String(path || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  }

  function parentAgentPath(path) {
    if (EF.ai && EF.ai.parentPath) return EF.ai.parentPath(path)
    const parts = normalizedPath(path).split('/').filter(Boolean)
    parts.pop()
    return parts.join('/')
  }

  function agentLeafName(agent) {
    if (EF.ai && EF.ai.agentNameFromPath) return EF.ai.agentNameFromPath(agent.path || agent.name || agent.id)
    const parts = normalizedPath(agent.path || agent.name || agent.id).split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : labelOf(agent, agent.id)
  }

  function countAgents(groupId, agents, groups) {
    const childGroups = {}
    for (let i = 0; i < groups.length; i++) {
      const parentId = parentGroupIdOf(groups[i])
      if (!parentId) continue
      if (!childGroups[parentId]) childGroups[parentId] = []
      childGroups[parentId].push(groups[i].id)
    }

    let count = 0
    for (let i = 0; i < agents.length; i++) {
      if (parentGroupIdOf(agents[i]) === groupId) count++
    }
    const children = childGroups[groupId] || []
    for (let i = 0; i < children.length; i++) count += countAgents(children[i], agents, groups)
    return count
  }

  function parentGroupIdOf(item) {
    return item.parentId || item.groupId || item.parentGroupId || null
  }

  function agentKey(groupId, path) {
    return String(groupId || '') + '::' + normalizedPath(path).toLowerCase()
  }

  function orderOf(item, index) {
    return item.order != null ? item.order : (item.index != null ? item.index : index)
  }

  function compareNode(a, b) {
    const ao = a.sortOrder
    const bo = b.sortOrder
    if (ao !== bo) return ao - bo
    return String(a.label).localeCompare(String(b.label))
  }

  function groupNodeId(id) { return 'group:' + id }
  function agentNodeId(id) { return 'agent:' + id }

  function toTreeItems(groups, agents) {
    const roots = []
    const byGroup = {}
    const activeId = read(EF.ai.activeAgentId)

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      byGroup[group.id] = {
        id: groupNodeId(group.id),
        label: labelOf(group, 'Group'),
        icon: 'folder',
        kind: 'group',
        groupId: group.id,
        parentGroupId: parentGroupIdOf(group),
        sortOrder: orderOf(group, i),
        agentCount: countAgents(group.id, agents, groups),
        children: [],
      }
    }

    for (let i = 0; i < groups.length; i++) {
      const node = byGroup[groups[i].id]
      const parent = node.parentGroupId ? byGroup[node.parentGroupId] : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }

    const byAgentPath = {}
    const agentNodes = []
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      const node = {
        id: agentNodeId(agent.id),
        label: labelOf(agent, 'Agent'),
        icon: 'user',
        kind: 'agent',
        agentId: agent.id,
        groupId: parentGroupIdOf(agent),
        path: normalizedPath(agent.path || agent.name || agent.id),
        parentAgentPath: parentAgentPath(agent.path || agent.name || agent.id),
        parentAgentId: null,
        connection: agent.connection || '',
        model: agent.model || '',
        mode: agent.mode || 'chat',
        status: statusOf(agent),
        isActive: agent.id === activeId,
        sortOrder: orderOf(agent, i),
        children: [],
      }
      byAgentPath[agentKey(node.groupId, node.path)] = node
      agentNodes.push(node)
    }

    for (let i = 0; i < agentNodes.length; i++) {
      const node = agentNodes[i]
      const parentAgent = node.parentAgentPath ? byAgentPath[agentKey(node.groupId, node.parentAgentPath)] : null
      if (parentAgent && parentAgent !== node) {
        node.parentAgentId = parentAgent.agentId
        parentAgent.children.push(node)
        continue
      }
      const parentGroup = node.groupId ? byGroup[node.groupId] : null
      if (parentGroup) parentGroup.children.push(node)
      else roots.push(node)
    }

    sortTree(roots)
    return roots
  }

  function sortTree(nodes) {
    nodes.sort(compareNode)
    for (let i = 0; i < nodes.length; i++) sortTree(nodes[i].children || [])
  }

  function findNode(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i]
      const found = findNode(nodes[i].children || [], id)
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
    return id ? [agentNodeId(id)] : []
  }

  function firstAgentNodeId(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].kind === 'agent') return nodes[i].id
      const found = firstAgentNodeId(nodes[i].children || [])
      if (found) return found
    }
    return null
  }

  function promptGroup(parentId) {
    ui.prompt({
      title: 'New Group',
      message: 'Group name',
      default: 'Group',
    }).then(function (name) {
      if (!name) return
      EF.ai.createGroup({ name: name, parentId: parentId || null })
    })
  }

  function promptAgent(groupId, parentAgentId) {
    ui.prompt({
      title: parentAgentId ? 'New Child Agent' : 'New Agent',
      message: 'Agent name',
      default: 'Agent',
    }).then(function (name) {
      if (!name) return
      if (parentAgentId) {
        const parent = EF.ai.findAgent(parentAgentId)
        EF.ai.createAgent({
          name: name,
          path: parent ? (parent.path + '/' + name) : name,
          groupId: parent ? (parent.groupId || null) : (groupId || null),
        })
      } else {
        EF.ai.createAgent({ name: name, groupId: groupId || null })
      }
    })
  }

  function renameNode(node) {
    ui.prompt({
      title: node.kind === 'group' ? 'Rename Group' : 'Rename Agent',
      message: 'Name',
      default: node.label,
    }).then(function (name) {
      if (!name || name === node.label) return
      if (node.kind === 'group') EF.ai.renameGroup(node.groupId, name)
      else EF.ai.renameAgent(node.agentId, name)
    })
  }

  function deleteNode(node) {
    const label = node.kind === 'group' ? 'Delete Group' : 'Delete Agent'
    const message = node.kind === 'group'
      ? node.label + ' and its subgroups will be removed. Agents move to the root.'
      : 'Delete ' + node.label + '?'
    ui.confirm({
      title: label,
      message: message,
      okLabel: 'Delete',
      danger: true,
    }).then(function (ok) {
      if (!ok) return
      if (node.kind === 'group') EF.ai.deleteGroup(node.groupId)
      else EF.ai.deleteAgent(node.agentId)
    })
  }

  function commitGroupDrop(source, target, position) {
    const parentId = position === 'inside' ? target.groupId : (target.parentGroupId || null)
    EF.ai.moveGroup(source.groupId, { parentId: parentId })
  }

  function commitAgentDrop(source, target, position) {
    const sourceAgent = EF.ai.findAgent ? EF.ai.findAgent(source.agentId) : null
    const name = sourceAgent ? agentLeafName(sourceAgent) : source.label
    function moveAsRoot(groupId) {
      if (EF.ai.setAgentPath) {
        const updated = EF.ai.setAgentPath(source.agentId, name)
        if (updated && updated.groupId !== (groupId || null)) EF.ai.moveAgent(source.agentId, { groupId: groupId || null, order: updated.order })
      } else {
        EF.ai.updateAgent(source.agentId, { path: name, groupId: groupId || null })
      }
    }
    if (target.kind === 'group' && position === 'inside') {
      moveAsRoot(target.groupId)
      return
    }
    if (target.kind === 'agent' && position === 'inside') {
      EF.ai.reparentAgent(source.agentId, target.agentId)
      return
    }
    if (target.kind === 'agent') {
      if (target.parentAgentId) EF.ai.reparentAgent(source.agentId, target.parentAgentId)
      else moveAsRoot(target.groupId || null)
      return
    }
    moveAsRoot(target.parentGroupId || null)
  }

  function commitDrop(target, position, data) {
    const source = data.nodes[0]
    if (source.kind === 'group') commitGroupDrop(source, target, position)
    else commitAgentDrop(source, target, position)
  }

  function rootMenu() {
    return [
      { label: 'New Group', icon: 'folder', onSelect: function () { promptGroup(null) } },
      { label: 'New Agent', icon: 'user', onSelect: function () { promptAgent(null) } },
    ]
  }

  function openRootMenu(ev) {
    if (ev.target.closest && ev.target.closest('.ef-ui-tree-row')) return
    ev.preventDefault()
    ui.contextMenu({ x: ev.clientX, y: ev.clientY }, rootMenu())
  }

  function makeStatus(node) {
    const wrap = ui.h('span', 'ef-ai-agent-meta')
    if (node.status && node.status !== 'idle') {
      wrap.appendChild(ui.h('span', 'ef-ai-status-pill ef-ai-status-' + node.status, { text: statusLabel(node.status) }))
    }
    return wrap
  }

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'ef-ai-panel ef-ai-agents')
    const itemsSig = EF.signal([])
    const selectedSig = EF.signal([])
    const expandedSig = EF.signal(new Set())
    let expansionSeeded = false

    const toolbar = ui.h('div', 'ef-ai-toolbar')
    toolbar.appendChild(ui.button({
      text: 'Group',
      icon: ui.icon({ name: 'folder', size: 'sm' }),
      kind: 'primary',
      size: 'sm',
      onClick: function () {
        const selected = findNode(itemsSig.peek(), selectedSig.peek()[0])
        promptGroup(selected && selected.kind === 'group' ? selected.groupId : null)
      },
    }))
    toolbar.appendChild(ui.button({
      text: 'Agent',
      icon: ui.icon({ name: 'user', size: 'sm' }),
      size: 'sm',
      onClick: function () {
        const selected = findNode(itemsSig.peek(), selectedSig.peek()[0])
        promptAgent(selected && selected.kind === 'group' ? selected.groupId : null)
      },
    }))
    toolbar.appendChild(ui.iconButton({
      icon: 'more-horizontal',
      title: 'More',
      size: 'sm',
      onClick: function (ev) {
        ui.contextMenu({ x: ev.clientX, y: ev.clientY }, rootMenu())
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
      onRowClick: function (node) {
        return node.kind === 'group' ? 'select-and-toggle' : 'select'
      },
      onSelect: function (ids) {
        if (!ids.length) return
        const node = findNode(itemsSig.peek(), ids[0])
        if (node && node.kind === 'agent') EF.ai.selectAgent(node.agentId)
      },
      trailingSlot: function (node) {
        if (node.kind === 'group') return ui.h('span', 'ef-ai-group-count', { text: String(node.agentCount) })
        return makeStatus(node)
      },
      leadingSlot: function (node) {
        return null
      },
      labelSlot: function (node) {
        if (node.kind !== 'agent') return null
        return makeAgentLabel(node)
      },
      actions: function (node) {
        const actions = []
        if (node.kind === 'group') {
          actions.push({
            icon: 'folder',
            title: 'New group',
            onClick: function () { promptGroup(node.groupId) },
          })
          actions.push({
            icon: 'user',
            title: 'New agent',
            onClick: function () { promptAgent(node.groupId) },
          })
        }
        actions.push({
          icon: 'edit',
          title: 'Rename',
          onClick: function () { renameNode(node) },
        })
        actions.push({
          icon: 'trash',
          title: 'Delete',
          onClick: function () { deleteNode(node) },
        })
        return actions
      },
      contextMenu: function (node) {
        const items = []
        if (node.kind === 'group') {
          items.push({ label: 'New Group', icon: 'folder', onSelect: function () { promptGroup(node.groupId) } })
          items.push({ label: 'New Agent', icon: 'user', onSelect: function () { promptAgent(node.groupId) } })
          items.push({ type: 'divider' })
        }
        if (node.kind === 'agent') {
          items.push({ label: 'New Child Agent', icon: 'user', onSelect: function () { promptAgent(node.groupId || null, node.agentId) } })
          items.push({ type: 'divider' })
        }
        items.push({ label: 'Rename', icon: 'edit', onSelect: function () { renameNode(node) } })
        items.push({ label: 'Delete', icon: 'trash', danger: true, onSelect: function () { deleteNode(node) } })
        return items
      },
      dnd: {
        canDrag: function () { return true },
        getDragData: function (nodes) { return { types: ['ef.ai/node'], nodes: nodes } },
        dropZones: function (node) {
          return node.kind === 'group' || node.kind === 'agent' ? ['before', 'inside', 'after'] : ['before', 'after']
        },
        canDrop: function (node, position, data) {
          const source = data.nodes[0]
          if (source.id === node.id) return false
          if (source.kind === 'agent') return node.kind === 'group' || node.kind === 'agent'
          return node.kind === 'group' && source.groupId !== node.groupId
        },
        onDrop: commitDrop,
      },
    })
    tree.classList.add('ef-ai-agent-tree')
    tree.addEventListener('contextmenu', openRootMenu)
    root.appendChild(tree)

    function syncTree() {
      const items = toTreeItems(readList(EF.ai.groups), readList(EF.ai.agents))
      itemsSig.set(items)
      if (!expansionSeeded) {
        expandedSig.set(expandableIds(items, new Set()))
        expansionSeeded = true
      }
      const selected = selectedSig.peek()[0]
      const selectedNode = findNode(items, selected)
      if (selectedNode && selectedNode.kind === 'group') return
      const active = activeNodeId()[0] || firstAgentNodeId(items)
      if (selected !== active) selectedSig.set(active ? [active] : [])
    }

    ui.collect(root, EF.effect(syncTree))
    return root
  }

  EF.registerComponent('ai-agents-list', {
    defaults: function () { return { title: 'AI Agents', icon: 'user', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
