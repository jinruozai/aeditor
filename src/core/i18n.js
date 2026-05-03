// EF.i18n - small reactive localization core.
//
// It provides only generic mechanics: locale signal, dictionaries, fallback,
// interpolation, and DOM binding helpers. Applications own their language
// packs and decide how users switch language.
;(function (EF) {
  'use strict'

  const DEFAULT_LOCALE = 'en'
  const dictionaries = {}
  const localeSig = EF.signal(DEFAULT_LOCALE)
  let fallbackLocale = DEFAULT_LOCALE

  function register(locale, dict) {
    if (!locale || !dict) return api
    dictionaries[locale] = Object.assign(dictionaries[locale] || {}, dict)
    localeSig.set(localeSig.peek())
    return api
  }

  function setLocale(locale) {
    if (!locale) return
    localeSig.set(String(locale))
  }

  function getLocale() {
    return localeSig.peek()
  }

  function setFallback(locale) {
    fallbackLocale = String(locale || DEFAULT_LOCALE)
  }

  function has(locale, key) {
    const dict = dictionaries[locale] || {}
    return Object.prototype.hasOwnProperty.call(dict, key)
  }

  function format(template, vars) {
    let str = template == null ? '' : String(template)
    if (!vars) return str
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : '{' + k + '}'
    })
  }

  function t(key, vars) {
    const loc = localeSig()
    const primary = dictionaries[loc] || {}
    const fallback = dictionaries[fallbackLocale] || dictionaries[DEFAULT_LOCALE] || {}
    const value = primary[key] != null ? primary[key] : (fallback[key] != null ? fallback[key] : key)
    return format(value, vars)
  }

  function text(key, vars) {
    return EF.derived(function () { return t(key, typeof vars === 'function' ? vars() : vars) })
  }

  function bindText(el, key, vars) {
    const sig = text(key, vars)
    const stop = EF.effect(function () { el.textContent = sig() })
    return function () { stop(); sig.dispose() }
  }

  function onChange(fn) {
    let first = true
    return EF.effect(function () {
      const loc = localeSig()
      if (first) { first = false; return }
      fn(loc)
    })
  }

  const api = {
    locale: localeSig,
    register: register,
    setLocale: setLocale,
    getLocale: getLocale,
    setFallback: setFallback,
    has: has,
    t: t,
    text: text,
    bindText: bindText,
    onChange: onChange,
  }

  EF.i18n = api
})(window.EF = window.EF || {})
