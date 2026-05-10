;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  function binaryLowerBound(prefix, value) {
    let lo = 0
    let hi = prefix.length - 1
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (prefix[mid] < value) lo = mid + 1
      else hi = mid
    }
    return Math.max(0, lo - 1)
  }

  function createMessageVirtualizer(opts) {
    opts = opts || {}
    const estimateHeight = opts.estimateHeight || 96
    const overscanPx = opts.overscanPx || 640
    const rowHeights = {}
    let messages = []
    let prefix = [0]

    function heightOf(id) {
      return rowHeights[id] || estimateHeight
    }

    function rebuildPrefix() {
      prefix = [0]
      for (let i = 0; i < messages.length; i++) {
        prefix.push(prefix[i] + heightOf(messages[i].id))
      }
    }

    function setMessages(nextMessages) {
      messages = nextMessages || []
      rebuildPrefix()
    }

    function setRowHeight(id, height) {
      if (!(height > 0)) return false
      if (Math.abs((rowHeights[id] || estimateHeight) - height) <= 1) return false
      rowHeights[id] = height
      rebuildPrefix()
      return true
    }

    function range(scrollTop, viewportHeight) {
      const top = Math.max(0, (scrollTop || 0) - overscanPx)
      const bottom = Math.max(top, (scrollTop || 0) + (viewportHeight || 480) + overscanPx)
      const start = Math.max(0, Math.min(binaryLowerBound(prefix, top), messages.length))
      let end = Math.max(start + 1, binaryLowerBound(prefix, bottom) + 1)
      end = Math.max(0, Math.min(end, messages.length))
      return {
        start: start,
        end: end,
        before: prefix[start] || 0,
        after: (prefix[prefix.length - 1] || 0) - (prefix[end] || 0),
        total: prefix[prefix.length - 1] || 0,
      }
    }

    return {
      setMessages: setMessages,
      setRowHeight: setRowHeight,
      range: range,
    }
  }

  ai.createMessageVirtualizer = createMessageVirtualizer
})(window.EF = window.EF || {})
