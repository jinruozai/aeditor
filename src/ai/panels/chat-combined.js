// aeditor.ai combined chat panel - transcript + composer with an internal splitter.
;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function factory(propsSig, ctx) {
    const props = propsSig.peek() || {}
    const root = ui.h('div', 'aeditor-ai-panel aeditor-ai-chat-combined')
    const messagesPane = ui.h('div', 'aeditor-ai-chat-combined-messages')
    const splitter = ui.h('div', 'aeditor-ai-chat-combined-splitter', {
      role: 'separator',
      'aria-orientation': 'horizontal',
      tabindex: '0',
    })
    const inputPane = ui.h('div', 'aeditor-ai-chat-combined-input')
    const messageSpec = aeditor.resolveComponent('ai-messages')
    const inputSpec = aeditor.resolveComponent('ai-chatinput')
    const inputSize = Number(props.inputSize || 230)

    root.style.setProperty('--aeditor-ai-chat-input-size', inputSize + 'px')
    messagesPane.appendChild(messageSpec.factory(aeditor.signal(props.messages || {}), ctx))
    inputPane.appendChild(inputSpec.factory(aeditor.signal(props.input || {}), ctx))
    root.appendChild(messagesPane)
    root.appendChild(splitter)
    root.appendChild(inputPane)

    splitter.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return
      ev.preventDefault()
      splitter.setPointerCapture(ev.pointerId)
      root.classList.add('aeditor-ai-chat-combined-resizing')
      const startY = ev.clientY
      const startInput = inputPane.getBoundingClientRect().height
      const move = function (moveEv) {
        const total = root.getBoundingClientRect().height
        const minInput = Number(props.minInputSize || 140)
        const minMessages = Number(props.minMessagesSize || 160)
        const next = clamp(startInput - (moveEv.clientY - startY), minInput, Math.max(minInput, total - minMessages))
        root.style.setProperty('--aeditor-ai-chat-input-size', Math.round(next) + 'px')
      }
      const up = function (upEv) {
        if (splitter.releasePointerCapture) splitter.releasePointerCapture(upEv.pointerId)
        root.classList.remove('aeditor-ai-chat-combined-resizing')
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    })

    splitter.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
      ev.preventDefault()
      const current = inputPane.getBoundingClientRect().height
      const total = root.getBoundingClientRect().height
      const minInput = Number(props.minInputSize || 140)
      const minMessages = Number(props.minMessagesSize || 160)
      const dir = ev.key === 'ArrowUp' ? 1 : -1
      const next = clamp(current + dir * 24, minInput, Math.max(minInput, total - minMessages))
      root.style.setProperty('--aeditor-ai-chat-input-size', Math.round(next) + 'px')
    })

    return root
  }

  aeditor.registerComponent('ai-chat', {
    category: 'panel',
    label: 'AI Chat',
    icon: 'message-circle',
    defaults: function () { return { title: 'Chat', icon: 'message-circle', props: { inputSize: 230 } } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.aeditor = window.aeditor || {})
