// Single global log stream. Errors are just entries with level='error' —
// no separate channel. Anything that wants "errors only" filters in its own
// derived/effect.
//
//   EF.log                          : signal<LogEntry[]>
//     EF.log()         entries[]
//     EF.log.push(level, source, message[, error])
//     EF.log.dismiss(id)
//     EF.log.clear()
//
//   EF.reportError(source, err)     // shim → EF.log.push('error', source, …)
//   EF.safeCall(source, fn)         // sync try/catch wrapper
//
// LogEntry = { id, time, level, source, message, error?, stack? }
// level    = 'error' | 'warn' | 'info' | 'debug'
// source   = { scope: 'widget'|'global'|'bus'|..., dockId?, panelId?, widget?, topic? }
//
// The window 'error' / 'unhandledrejection' listeners are NOT installed
// here — they live in dock/layout.js and attach on first createDockLayout()
// (§ 4.7). This file is pure data and must not touch window globals.
;(function (EF) {
  'use strict'

  const log = EF.signal([])
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

  EF.log         = log
  EF.reportError = reportError
  EF.safeCall    = safeCall
})(window.EF = window.EF || {})
