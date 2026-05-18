// aiditor.names - shared dotted-prefix name helpers.
;(function (aiditor) {
  'use strict'

  function matchesPrefix(name, prefix) {
    name = String(name || '')
    prefix = String(prefix || '')
    if (!prefix) return false
    const tail = prefix.charAt(prefix.length - 1)
    if (tail === '.' || tail === '/') return name.indexOf(prefix) === 0
    return name === prefix || name.indexOf(prefix + '.') === 0 || name.indexOf(prefix + '/') === 0
  }

  aiditor.names = {
    matchesPrefix: matchesPrefix,
  }
})(window.aiditor = window.aiditor || {})
