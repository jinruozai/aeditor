// aeditor.names - shared dotted-prefix name helpers.
;(function (aeditor) {
  'use strict'

  function matchesPrefix(name, prefix) {
    name = String(name || '')
    prefix = String(prefix || '')
    if (!prefix) return false
    const tail = prefix.charAt(prefix.length - 1)
    if (tail === '.' || tail === '/') return name.indexOf(prefix) === 0
    return name === prefix || name.indexOf(prefix + '.') === 0 || name.indexOf(prefix + '/') === 0
  }

  aeditor.names = {
    matchesPrefix: matchesPrefix,
  }
})(window.aeditor = window.aeditor || {})
