// aiditor.ui.codeInput — monospace text editor with line numbers + tab indent.
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
//   2. `aiditor.ui.codeInput.tokenize(src, rules)`
//        Tiny sticky-regex walker exposed for convenience. Each rule is
//        `{ cls, re }` where `re` uses the /y flag. A rule may also have
//        `kw: Set<string>` — when an ident matches a keyword, cls 'i' is
//        promoted to 'k'. The class `t` is emitted as raw text (no span).
//        Returns an HTML string with tokens wrapped in <span class="aiditor-hl-XX">.
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
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

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
            : '<span class="aiditor-hl-' + cls + '">' + escHtml(text) + '</span>'
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

    const el = ui.h('div', 'aiditor-ui-code')
    const gutter = ui.h('div', 'aiditor-ui-code-gutter')
    const editor = ui.h('div', 'aiditor-ui-code-editor')
    const ta = ui.h('textarea', 'aiditor-ui-code-text', {
      spellcheck: 'false',
      rows: String(o.rows || 12),
    })
    if (o.language) {
      const tag = ui.h('span', 'aiditor-ui-code-lang', { text: o.language })
      el.appendChild(tag)
    }
    el.appendChild(gutter)
    el.appendChild(editor)

    // Highlight overlay only when the caller provided a tokenizer.
    let hl = null, hlCode = null
    if (highlightFn) {
      hl = ui.h('pre', 'aiditor-ui-code-hl')
      hlCode = ui.h('code', 'aiditor-ui-code-hl-inner')
      hl.appendChild(hlCode)
      editor.appendChild(hl)
      el.classList.add('aiditor-ui-code-hlmode')
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
    function lineRange(value, start, end) {
      const first = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const tail = end > start && value[end - 1] === '\n' ? end - 1 : end
      const next = value.indexOf('\n', tail)
      return { start: first, end: next < 0 ? value.length : next }
    }
    function applyTabIndent(outdent) {
      const value = ta.value
      const s = ta.selectionStart
      const n = ta.selectionEnd
      if (s === n && !outdent) {
        ta.value = value.slice(0, s) + '  ' + value.slice(n)
        ta.selectionStart = ta.selectionEnd = s + 2
        doWrite(ta.value); refreshGutter(); refreshHighlight()
        return
      }
      const range = lineRange(value, s, n)
      const block = value.slice(range.start, range.end)
      if (!outdent) {
        const nextBlock = '  ' + block.replace(/\n/g, '\n  ')
        const lines = (block.match(/\n/g) || []).length + 1
        ta.value = value.slice(0, range.start) + nextBlock + value.slice(range.end)
        ta.selectionStart = s === range.start ? s : s + 2
        ta.selectionEnd = n + lines * 2
        doWrite(ta.value); refreshGutter(); refreshHighlight()
        return
      }
      let nextBlock = ''
      let pos = range.start
      let removedBeforeStart = 0
      let removedBeforeEnd = 0
      while (pos <= range.end) {
        const nl = value.indexOf('\n', pos)
        const lineEnd = nl < 0 || nl > range.end ? range.end : nl
        const line = value.slice(pos, lineEnd)
        const removed = line.indexOf('  ') === 0 ? 2 : (line[0] === '\t' || line[0] === ' ' ? 1 : 0)
        if (removed) {
          if (s > pos) removedBeforeStart += Math.min(removed, s - pos)
          if (n > pos) removedBeforeEnd += Math.min(removed, n - pos)
        }
        nextBlock += line.slice(removed)
        if (nl < 0 || nl >= range.end) break
        nextBlock += '\n'
        pos = nl + 1
      }
      ta.value = value.slice(0, range.start) + nextBlock + value.slice(range.end)
      ta.selectionStart = Math.max(range.start, s - removedBeforeStart)
      ta.selectionEnd = Math.max(ta.selectionStart, n - removedBeforeEnd)
      doWrite(ta.value); refreshGutter(); refreshHighlight()
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
        if (aiditor.shortcuts) aiditor.shortcuts.markHandled(e)
        applyTabIndent(!!e.shiftKey)
      }
    })
    return el
  }

  // Exposed for callers who want to use the sticky-regex walker directly.
  ui.codeInput.tokenize = tokenize
  ui.codeInput.escHtml  = escHtml
})(window.aiditor = window.aiditor || {})
