// aeditor.ui.codeInput — monospace text editor with line numbers + tab indent.
//
// Light-weight: not Monaco. A styled <textarea> with a gutter, Tab-key
// indent, signal-bound value, and an *optional* highlight overlay whose
// tokenizer is provided by the caller.
//
// Syntax highlighting is deliberately NOT bundled — language definitions
// would balloon the framework for a feature most apps won't use. Instead we
// expose two pieces:
//
//   1. `opts.highlight(src) => htmlString`
//        A function you write. Returns a pre-escaped HTML string that is
//        placed inside a <code> layer behind the textarea. Called on every
//        input change, so keep it fast.
//
//   2. `aeditor.ui.codeInput.tokenize(src, rules)`
//        Tiny sticky-regex walker exposed for convenience. Each rule is
//        `{ cls, re }` where `re` uses the /y flag. A rule may also have
//        `kw: Set<string>` — when an ident matches a keyword, cls 'i' is
//        promoted to 'k'. The class `t` is emitted as raw text (no span).
//        Returns an HTML string with tokens wrapped in <span class="aeditor-hl-XX">.
//
// Wire them together (in user code, not the framework):
//
//   const jsRules = [
//     { cls: 'c', re: /\/\/[^\n]*/y },
//     { cls: 's', re: /"(?:\\.|[^"\\])*"/y },
//     { cls: 'n', re: /\b\d+\b/y },
//     { cls: 'i', re: /[A-Za-z_$][\w$]*/y, kw: new Set(['function','return','if']) },
//     { cls: 'p', re: /[(){};]/y },
//     { cls: 't', re: /\s+/y },
//     { cls: 't', re: /./y },
//   ]
//   ui.codeInput({
//     value: sig, language: 'js',
//     highlight: src => ui.codeInput.tokenize(src, jsRules),
//   })
//
// No `highlight` → plain textarea, minimal library default.
//
// opts: { value, onChange?, language?, rows?, highlight?, submitMode?, onCommit?, onCancel? }
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  function escHtml(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
    })
  }

  // Sticky-regex walker. Tries rules in order at the current index; the last
  // rule should always match a single char to guarantee progress.
  function tokenize(src, rules) {
    let out = ''
    let i = 0
    const n = src.length
    while (i < n) {
      let advanced = false
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r]
        rule.re.lastIndex = i
        const m = rule.re.exec(src)
        if (m && m.index === i && m[0].length > 0) {
          const text = m[0]
          let cls = rule.cls
          if (cls === 'i' && rule.kw && rule.kw.has(text)) cls = 'k'
          out += cls === 't'
            ? escHtml(text)
            : '<span class="aeditor-hl-' + cls + '">' + escHtml(text) + '</span>'
          i += text.length
          advanced = true
          break
        }
      }
      if (!advanced) { out += escHtml(src[i]); i++ }
    }
    return out
  }

  ui.codeInput = function (opts) {
    const o = opts || {}
    const sig = ui.asSig(o.value != null ? o.value : '')
    const doWrite = ui.writer(sig, o.onChange, 'ui.codeInput')
    const highlightFn = typeof o.highlight === 'function' ? o.highlight : null

    const el = ui.h('div', 'aeditor-ui-code')
    const gutter = ui.h('div', 'aeditor-ui-code-gutter')
    const editor = ui.h('div', 'aeditor-ui-code-editor')
    const ta = ui.h('textarea', 'aeditor-ui-code-text', {
      spellcheck: 'false',
      rows: String(o.rows || 12),
    })
    if (o.language) {
      const tag = ui.h('span', 'aeditor-ui-code-lang', { text: o.language })
      el.appendChild(tag)
    }
    el.appendChild(gutter)
    el.appendChild(editor)

    // Highlight overlay only when the caller provided a tokenizer.
    let hl = null, hlCode = null
    if (highlightFn) {
      hl = ui.h('pre', 'aeditor-ui-code-hl')
      hlCode = ui.h('code', 'aeditor-ui-code-hl-inner')
      hl.appendChild(hlCode)
      editor.appendChild(hl)
      el.classList.add('aeditor-ui-code-hlmode')
    }
    editor.appendChild(ta)

    function refreshGutter() {
      const lines = (ta.value.match(/\n/g) || []).length + 1
      let s = ''
      for (let i = 1; i <= lines; i++) s += i + '\n'
      gutter.textContent = s
    }
    function refreshHighlight() {
      if (!highlightFn) return
      // Trailing newline keeps the highlight block as tall as the textarea
      // content so scroll math stays aligned.
      hlCode.innerHTML = highlightFn(ta.value + '\n')
    }
    function syncScroll() {
      gutter.scrollTop = ta.scrollTop
      if (hl) {
        hl.scrollTop = ta.scrollTop
        hl.scrollLeft = ta.scrollLeft
      }
    }

    ui.bind(el, sig, function (v) {
      if (document.activeElement !== ta) ta.value = v == null ? '' : String(v)
      refreshGutter()
      refreshHighlight()
    })
    ta.addEventListener('input', function () {
      doWrite(ta.value)
      refreshGutter()
      refreshHighlight()
    })
    function writeText(v) {
      ta.value = v == null ? '' : String(v)
      doWrite(ta.value)
      refreshGutter()
      refreshHighlight()
    }
    ui.editSession({
      el: ta,
      owner: el,
      multiline: true,
      submitMode: o.submitMode || 'modifier',
      get: function () { return ta.value },
      set: writeText,
      onCommit: o.onCommit,
      onCancel: o.onCancel,
    })
    ta.addEventListener('scroll', syncScroll)
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault()
        const s = ta.selectionStart, n = ta.selectionEnd
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(n)
        ta.selectionStart = ta.selectionEnd = s + 2
        doWrite(ta.value); refreshGutter(); refreshHighlight()
      }
    })
    return el
  }

  // Exposed for callers who want to use the sticky-regex walker directly.
  ui.codeInput.tokenize = tokenize
  ui.codeInput.escHtml  = escHtml
})(window.aeditor = window.aeditor || {})
