// aeditor.history - generic snapshot history engine.
//
// The framework owns only the timeline mechanics. Applications provide
// capture/apply functions and decide which user actions create entries.
;(function (aeditor) {
  'use strict'

  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v))
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function create(options) {
    options = options || {}
    const capture = options.capture || function () { return null }
    const apply = options.apply || function () {}
    const cloneSnapshot = options.clone || clone
    const equals = options.equals || same
    const limit = Math.max(1, Number(options.limit) || 200)

    const entriesSig = aeditor.signal([])
    const indexSig = aeditor.signal(-1)
    const applyingSig = aeditor.signal(false)

    let pauseDepth = 0
    let txDepth = 0
    let txLabel = ''
    let txMeta = null
    let txBefore = null

    function now() { return Date.now() }

    function makeEntry(label, snapshot, meta) {
      return {
        id: 'h_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        label: label || 'Change',
        time: now(),
        snapshot: cloneSnapshot(snapshot),
        meta: meta || null,
      }
    }

    function current() {
      const entries = entriesSig.peek()
      return entries[indexSig.peek()] || null
    }

    function canUndo() { return indexSig() > 0 }
    function canRedo() { return indexSig() >= 0 && indexSig() < entriesSig().length - 1 }

    function setTimeline(entries, index) {
      entriesSig.set(entries)
      indexSig.set(index)
    }

    function pushSnapshot(label, snapshot, meta) {
      if (pauseDepth || applyingSig.peek()) return current()
      const currentEntry = current()
      if (currentEntry && equals(currentEntry.snapshot, snapshot)) return currentEntry

      let entries = entriesSig.peek().slice(0, indexSig.peek() + 1)
      entries.push(makeEntry(label, snapshot, meta))
      if (entries.length > limit) entries = entries.slice(entries.length - limit)
      setTimeline(entries, entries.length - 1)
      return entries[entries.length - 1]
    }

    function captureNow(label, meta) {
      return pushSnapshot(label, capture(), meta)
    }

    function reset(label, meta) {
      const entry = makeEntry(label || 'Initial state', capture(), meta)
      setTimeline([entry], 0)
      return entry
    }

    function clear() {
      setTimeline([], -1)
    }

    function replaceCurrent(label, meta) {
      if (indexSig.peek() < 0) return reset(label, meta)
      const entries = entriesSig.peek().slice()
      entries[indexSig.peek()] = makeEntry(label || entries[indexSig.peek()].label, capture(), meta || entries[indexSig.peek()].meta)
      setTimeline(entries, indexSig.peek())
      return entries[indexSig.peek()]
    }

    function jump(index, reason) {
      const entries = entriesSig.peek()
      const nextIndex = Math.max(0, Math.min(entries.length - 1, Number(index)))
      const entry = entries[nextIndex]
      if (!entry || nextIndex === indexSig.peek()) return entry || null

      applyingSig.set(true)
      pauseDepth++
      try {
        indexSig.set(nextIndex)
        apply(cloneSnapshot(entry.snapshot), {
          reason: reason || 'jump',
          entry: entry,
          index: nextIndex,
        })
      } finally {
        pauseDepth--
        applyingSig.set(false)
      }
      return entry
    }

    function undo() {
      if (!canUndo()) return null
      return jump(indexSig.peek() - 1, 'undo')
    }

    function redo() {
      if (!canRedo()) return null
      return jump(indexSig.peek() + 1, 'redo')
    }

    function pause(fn) {
      pauseDepth++
      try {
        return fn()
      } finally {
        pauseDepth--
      }
    }

    function begin(label, meta) {
      if (txDepth === 0) {
        txBefore = capture()
        txLabel = label || 'Change'
        txMeta = meta || null
      }
      txDepth++
    }

    function commit(label, meta) {
      if (!txDepth) return captureNow(label, meta)
      txDepth--
      if (txDepth) return current()
      const after = capture()
      const before = txBefore
      const finalLabel = label || txLabel || 'Change'
      const finalMeta = meta || txMeta || null
      txBefore = null
      txLabel = ''
      txMeta = null
      if (equals(before, after)) return current()
      return pushSnapshot(finalLabel, after, finalMeta)
    }

    function cancel() {
      txDepth = 0
      txBefore = null
      txLabel = ''
      txMeta = null
    }

    function record(label, fn, meta) {
      begin(label, meta)
      try {
        return fn()
      } finally {
        commit(label, meta)
      }
    }

    return {
      entries: entriesSig,
      index: indexSig,
      applying: applyingSig,
      current: current,
      canUndo: canUndo,
      canRedo: canRedo,
      reset: reset,
      clear: clear,
      replaceCurrent: replaceCurrent,
      capture: captureNow,
      push: pushSnapshot,
      jump: jump,
      undo: undo,
      redo: redo,
      pause: pause,
      begin: begin,
      commit: commit,
      cancel: cancel,
      record: record,
    }
  }

  aeditor.history = { create: create }
})(window.aeditor = window.aeditor || {})
