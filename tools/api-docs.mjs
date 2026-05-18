import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')
const DOC_API = join(ROOT, 'doc', 'api')
const GENERATED_JS = join(SRC, 'ai', 'api-docs.generated.js')

const TAGS = new Set([
  'aeditorApi',
  'group',
  'layer',
  'kind',
  'signature',
  'summary',
  'param',
  'returns',
  'example',
  'wrong',
  'related',
])

function listJsFiles(dir, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) listJsFiles(abs, out)
    else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'api-docs.generated.js') out.push(abs)
  }
  return out
}

function cleanCommentLine(line) {
  return line.replace(/^\s*\* ?/, '').replace(/\s+$/, '')
}

function parseTagLine(line) {
  const match = line.match(/^@([A-Za-z][\w-]*)(?:\s+(.*))?$/)
  if (!match) return null
  const name = match[1]
  if (!TAGS.has(name)) return null
  return { name, value: match[2] || '' }
}

function parseParam(text) {
  const match = text.match(/^\{([^}]+)\}\s+([^\s]+)(?:\s+-?\s*(.*))?$/)
  if (!match) return { name: text.trim(), type: '', description: '' }
  return { type: match[1].trim(), name: match[2].trim(), description: (match[3] || '').trim() }
}

function parseReturns(text) {
  const match = text.match(/^\{([^}]+)\}(?:\s+-?\s*(.*))?$/)
  if (!match) return { type: '', description: text.trim() }
  return { type: match[1].trim(), description: (match[2] || '').trim() }
}

function addMultiline(entry, key, firstLine, lines, startIndex) {
  const out = []
  if (firstLine) out.push(firstLine)
  let i = startIndex
  while (i < lines.length) {
    const tag = parseTagLine(lines[i])
    if (tag) break
    out.push(lines[i])
    i++
  }
  const text = out.join('\n').replace(/^\n+|\n+$/g, '')
  if (text) entry[key].push(text)
  return i - 1
}

function inferGroup(id) {
  const parts = String(id || '').split('.')
  if (parts.length >= 2 && parts[0] === 'aeditor') return parts[1]
  return 'api'
}

function parseBlock(file, raw) {
  const lines = raw.split('\n').map(cleanCommentLine)
  const first = lines.map(parseTagLine).find((tag) => tag && tag.name === 'aeditorApi')
  if (!first) return null
  const entry = {
    id: first.value.trim(),
    group: '',
    layer: '',
    kind: '',
    signature: '',
    summary: '',
    params: [],
    returns: null,
    examples: [],
    wrong: [],
    related: [],
    source: relative(ROOT, file).replace(/\\/g, '/'),
  }
  for (let i = 0; i < lines.length; i++) {
    const tag = parseTagLine(lines[i])
    if (!tag) continue
    if (tag.name === 'aeditorApi') continue
    if (tag.name === 'param') entry.params.push(parseParam(tag.value))
    else if (tag.name === 'returns') entry.returns = parseReturns(tag.value)
    else if (tag.name === 'example') i = addMultiline(entry, 'examples', tag.value, lines, i + 1)
    else if (tag.name === 'wrong') i = addMultiline(entry, 'wrong', tag.value, lines, i + 1)
    else if (tag.name === 'related') entry.related = tag.value.split(',').map((v) => v.trim()).filter(Boolean)
    else entry[tag.name] = tag.value.trim()
  }
  entry.group = entry.group || inferGroup(entry.id)
  if (!entry.id) throw new Error('API doc block without @aeditorApi id in ' + entry.source)
  return entry
}

function collectEntries() {
  const entries = []
  for (const file of listJsFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const blocks = text.match(/\/\*\*[\s\S]*?\*\//g) || []
    for (const block of blocks) {
      const entry = parseBlock(file, block.slice(3, -2))
      if (entry) entries.push(entry)
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id))
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error('Duplicate API doc id: ' + entry.id)
    seen.add(entry.id)
  }
  return entries
}

function jsonPayload(entries) {
  return {
    version: 1,
    entries,
  }
}

function escMd(text) {
  return String(text || '').replace(/\|/g, '\\|')
}

function entryMd(entry) {
  const lines = []
  lines.push('## `' + entry.id + '`')
  lines.push('')
  if (entry.summary) lines.push(entry.summary, '')
  if (entry.signature) lines.push('```js\n' + entry.signature + '\n```', '')
  if (entry.params.length) {
    lines.push('| Param | Type | Description |', '|---|---|---|')
    entry.params.forEach((param) => lines.push('| `' + escMd(param.name) + '` | `' + escMd(param.type) + '` | ' + escMd(param.description) + ' |'))
    lines.push('')
  }
  if (entry.returns) lines.push('Returns: `' + entry.returns.type + '` ' + entry.returns.description, '')
  entry.examples.forEach((example) => lines.push('```js\n' + example + '\n```', ''))
  if (entry.wrong.length) {
    lines.push('Avoid:', '')
    entry.wrong.forEach((wrong) => lines.push('```js\n' + wrong + '\n```', ''))
  }
  if (entry.related.length) lines.push('Related: ' + entry.related.map((id) => '`' + id + '`').join(', '), '')
  lines.push('Source: `' + entry.source + '`', '')
  return lines.join('\n')
}

function writeIfChanged(file, text) {
  try {
    if (readFileSync(file, 'utf8') === text) return
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  writeFileSync(file, text)
}

function writeDocs(payload) {
  mkdirSync(DIST, { recursive: true })
  mkdirSync(DOC_API, { recursive: true })
  writeIfChanged(join(DIST, 'aeditor-api.json'), JSON.stringify(payload, null, 2) + '\n')
  const generated =
    '// Generated by tools/generate-api-docs.mjs. Do not edit.\n' +
    ';(function (aeditor) {\n' +
    "  'use strict'\n" +
    '  aeditor.apiDocs = ' + JSON.stringify(payload, null, 2).replace(/\n/g, '\n  ') + '\n' +
    '})(window.aeditor = window.aeditor || {})\n'
  writeIfChanged(GENERATED_JS, generated)

  const groups = new Map()
  payload.entries.forEach((entry) => {
    if (!groups.has(entry.group)) groups.set(entry.group, [])
    groups.get(entry.group).push(entry)
  })

  const index = ['# AEditor API', '', 'Generated from structured API comments in `src/`.', '']
  Array.from(groups.keys()).sort().forEach((group) => {
    index.push('- [' + group + '](./' + group + '.md)')
  })
  index.push('')
  writeIfChanged(join(DOC_API, 'index.md'), index.join('\n'))

  Array.from(groups.keys()).sort().forEach((group) => {
    const entries = groups.get(group)
    const lines = ['# ' + group + ' API', '', 'Generated from structured API comments in `src/`.', '']
    entries.forEach((entry) => lines.push(entryMd(entry)))
    writeIfChanged(join(DOC_API, group + '.md'), lines.join('\n'))
  })
}

export function generateApiDocs() {
  const entries = collectEntries()
  const payload = jsonPayload(entries)
  writeDocs(payload)
  return payload
}
