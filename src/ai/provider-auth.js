// EF.ai built-in auth drivers.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const http = ai.provider

  function openLoginUrl(result, opts) {
    const url = result && (result.verificationUrl || result.loginUrl || result.url)
    const popup = opts && opts.popup
    if (url && popup) popup.location.href = url
    else if (url && window.open) window.open(url, '_blank', 'noopener,noreferrer')
    else if (popup && popup.document) {
      popup.document.title = 'AI Login'
      popup.document.body.style.font = '14px system-ui, sans-serif'
      popup.document.body.style.padding = '24px'
      popup.document.body.textContent = result && result.userCode
        ? ('Login code: ' + result.userCode)
        : 'The local bridge did not return a browser login URL.'
    }
    return result
  }

  ai.registerAuthDriver('none', {
    status: function () { return { state: 'signed_in' } },
  })

  ai.registerAuthDriver('apiKey', {
    status: function (connection, config) {
      return config.apiKey ? { state: 'signed_in', method: 'apiKey' } : { state: 'signed_out', method: 'apiKey' }
    },
  })

  ai.registerAuthDriver('localBridge', {
    status: function (connection, config) {
      return { state: 'unknown', method: 'localBridge', baseUrl: config.baseUrl || '' }
    },
    login: function (connection, config, opts) {
      return http.requestJson(http.joinUrl(config.baseUrl, '/connections/' + connection.id + '/login'), { method: 'POST' }).then(function (result) {
        return openLoginUrl(result, opts)
      })
    },
    logout: function (connection, config) {
      return http.requestJson(http.joinUrl(config.baseUrl, '/connections/' + connection.id + '/logout'), { method: 'POST' })
    },
  })

  ai.registerAuthDriver('subscriptionBridge', {
    status: function (connection, config) {
      return http.requestJson(http.joinUrl(config.baseUrl, '/connections/' + connection.id + '/status'), { method: 'GET' })
    },
    login: function (connection, config, opts) {
      return http.requestJson(http.joinUrl(config.baseUrl, '/connections/' + connection.id + '/login'), { method: 'POST' }).then(function (result) {
        return openLoginUrl(result, opts)
      })
    },
    logout: function (connection, config) {
      return http.requestJson(http.joinUrl(config.baseUrl, '/connections/' + connection.id + '/logout'), { method: 'POST' })
    },
  })
})(window.EF = window.EF || {})
