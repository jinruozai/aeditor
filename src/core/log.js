// Single global log stream. Errors are just entries with level='error' —
// no separate channel. Anything that wants "errors only" filters in its own
// derived/effect.
//
//   aeditor.log                          : signal<LogEntry[]>
//     aeditor.log()         entries[]
//     aeditor.log.push(level, source, message[, error])
//     aeditor.log.dismiss(id)
//     aeditor.log.clear()
//
//   aeditor.reportError(source, err)     // shim → aeditor.log.push('error', source, …)
//   aeditor.safeCall(source, fn)         // sync try/catch wrapper
//
// LogEntry = { id, time, level, source, message, error?, stack? }
// level    = 'error' | 'warn' | 'info' | 'debug'
// source   = { scope: 'component'|'global'|'bus'|..., dockId?, panelId?, component?, topic? }
//
// The window 'error' / 'unhandledrejection' listeners are NOT installed
// here — they live in dock/layout.js and attach on first createDockLayout()
// (§ 4.7). This file is pure data and must not touch window globals.
;(function (aeditor) {
  'use strict'

  const log = aeditor.signal([])
  let _nextId = 1

  log.push = function (level, source, message, error) {
    const entry = {
      id:      'log-' + (_nextId++),
      time:    Date.now(),
      level:   level || 'info',
      source:  source || { scope: 'unknown' },
      message: message != null ? String(message) : ((error && error.message) || ''),
      error:   error || null,
      stack:   (error && error.stack) || null,
    }
    log.update(function (list) { return list.concat([entry]) })
    return entry
  }

  log.dismiss = function (id) {
    log.update(function (list) { return list.filter(function (e) { return e.id !== id }) })
  }

  log.clear = function () { log.set([]) }

  // Synchronous try/catch wrapper. Async errors inside fn (setTimeout,
  // Promises, event handlers) are NOT caught here — the global window
  // listeners in dock/layout.js cover those.
  function safeCall(source, fn) {
    try { return fn() }
    catch (e) { log.push('error', source, e.message || String(e), e); return null }
  }

  function reportError(source, err) {
    return log.push('error', source, (err && err.message) || String(err), err)
  }

  aeditor.log         = log
  aeditor.reportError = reportError
  aeditor.safeCall    = safeCall
})(window.aeditor = window.aeditor || {})
