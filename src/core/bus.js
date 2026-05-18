// aiditor.bus — global pub/sub for decoupled panel/dock/component communication.
//
//   aiditor.bus.on(topic, handler)  → unsubscribe fn
//   aiditor.bus.off(topic, handler)
//   aiditor.bus.emit(topic, payload)
//
// Handlers fire synchronously. Each handler is wrapped individually so a
// throw in one subscriber routes to aiditor.log but does NOT abort the rest of
// the emit (§ 4.15 — error isolation across mutually distrustful widgets).
//
// Auto-unsubscribe is NOT done here; it lives in widgets/context.js where
// the ComponentContext factory has access to the runtime's `cleanups` array.
// Calling aiditor.bus.on directly (without ctx.bus) gives no auto-unsubscribe —
// the caller manages the returned fn themselves.
;(function (aiditor) {
  'use strict'

  const topics = new Map() // topic → Set<handler>

  function on(topic, handler) {
    let set = topics.get(topic)
    if (!set) { set = new Set(); topics.set(topic, set) }
    set.add(handler)
    return function unsubscribe() { off(topic, handler) }
  }

  function off(topic, handler) {
    const set = topics.get(topic)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) topics.delete(topic)
  }

  function emit(topic, payload) {
    const set = topics.get(topic)
    if (!set) return
    // Snapshot before iteration: handlers may unsubscribe themselves.
    const list = Array.from(set)
    // Run EACH handler inside an untracked scope. Reason: emit() is often
    // called transitively from within an effect body (e.g. a signal write
    // that a bus handler consumes → handler reads other signals → those
    // signal reads would otherwise subscribe the OUTER effect to those
    // signals, causing the effect to re-run on unrelated state changes and
    // cascade into infinite loops). Bus handlers are semantically fire-and-
    // forget — they should never act as reactivity bridges. If a handler
    // needs reactivity, it establishes its own aiditor.effect explicitly.
    const untracked = aiditor.untracked || function (fn) { return fn() }
    for (let i = 0; i < list.length; i++) {
      aiditor.safeCall({ scope: 'bus', topic: topic }, function () {
        untracked(function () { list[i](payload) })
      })
    }
  }

  aiditor.bus = { on: on, off: off, emit: emit }
})(window.aiditor = window.aiditor || {})
