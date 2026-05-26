import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aiditor: {} }

for (const file of [
  'src/core/workspace.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aiditor = window.aiditor
const ws = aiditor.workspace.memory({
  'src/panel.js': 'one\ntwo\nthree\n',
  'data/items.json': '{"items":[]}',
})

assert.throws(function () { aiditor.workspace.normalizePath('../secret') }, /escapes root/)
assert.equal(aiditor.workspace.normalizePath('src\\./panel.js'), 'src/panel.js')

const read = await ws.readText('src/panel.js')
assert.equal(read.text, 'one\ntwo\nthree\n')
assert.equal(read.hash, aiditor.workspace.hashText(read.text))

const patched = await ws.patchText('src/panel.js', read.hash, [
  { startLine: 2, endLine: 2, replacement: 'TWO' },
])
assert.equal(patched.text, 'one\nTWO\nthree\n')

const found = await ws.search('TWO', { limit: 5 })
assert.equal(found.length, 1)
assert.equal(found[0].path, 'src/panel.js')
assert.equal(found[0].line, 2)
assert.equal(found[0].column, 1)
assert.equal(found[0].fileHash, patched.hash)
assert.equal(found[0].previewEndLine, 4)

const regexFound = await ws.search('t.o', { mode: 'regex', caseSensitive: false, limit: 5 })
assert.equal(regexFound.some(function (item) { return item.path === 'src/panel.js' && item.matchText === 'TWO' }), true)
const included = await ws.search('items', { include: ['data/*.json'], limit: 5 })
assert.equal(included.length, 1)
assert.equal(included[0].path, 'data/items.json')

const editedText = aiditor.workspace.applyTextEdits('alpha\nbeta\n', aiditor.workspace.hashText('alpha\nbeta\n'), [
  { oldText: 'beta', newText: 'BETA' },
])
assert.equal(editedText, 'alpha\nBETA\n')
assert.throws(function () {
  aiditor.workspace.applyTextEdits('same\nsame\n', aiditor.workspace.hashText('same\nsame\n'), [
    { oldText: 'same', newText: 'other' },
  ])
}, /matched more than once/)

await ws.writeText('src/new.js', 'hello')
await assert.rejects(async function () { return ws.writeText('src/new.js', 'replace') }, /existing target/)
const newHash = (await ws.stat('src/new.js')).hash
await ws.writeText('src/new.js', 'replace', { baseHash: newHash })
assert.equal((await ws.readText('src/new.js')).text, 'replace')
assert.equal((await ws.stat('src/new.js')).kind, 'file')
assert.equal((await ws.list('src')).some(function (item) { return item.path === 'src/new.js' }), true)

await ws.delete('src/new.js')
await assert.rejects(async function () { return ws.readText('src/new.js') }, /file not found/)

await ws.mkdir('assets/images')
await ws.writeBlob('assets/images/logo.bin', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' }))
const blobRead = await ws.readBlob('assets/images/logo.bin')
assert.equal(blobRead.size, 3)
assert.equal(blobRead.mime, 'application/octet-stream')
assert.equal((await ws.stat('assets/images/logo.bin')).hash, blobRead.hash)
await ws.copy('assets/images/logo.bin', 'assets/images/copy.bin')
await assert.rejects(async function () { return ws.copy('assets/images/logo.bin', 'assets/images/copy.bin') }, /existing target/)
assert.equal((await ws.stat('assets/images/copy.bin')).kind, 'file')
await ws.move('assets/images/copy.bin', 'assets/images/moved.bin')
await assert.rejects(async function () { return ws.stat('assets/images/copy.bin') }, /path not found/)
assert.equal((await ws.stat('assets/images/moved.bin')).kind, 'file')
await assert.rejects(async function () { return ws.delete('assets') }, /directory is not empty/)
await ws.delete('assets', { recursive: true })
await assert.rejects(async function () { return ws.stat('assets/images/moved.bin') }, /path not found/)

await ws.writeText('undo.txt', 'before')
const snapshot = await ws.snapshot('undo.txt')
await ws.writeText('undo.txt', 'after', { baseHash: aiditor.workspace.hashText('before') })
await ws.restoreSnapshot(snapshot, { baseHash: aiditor.workspace.hashText('after') })
assert.equal((await ws.readText('undo.txt')).text, 'before')
assert.equal((await ws.capabilities()).mkdir, true)
assert.equal((await ws.capabilities()).revealInSystem, false)
assert.deepEqual(await ws.revealInSystem('undo.txt', { select: true }), { ok: false, reason: 'unsupported' })

const createPreview = await ws.previewOperation({ op: 'writeText', path: 'preview/create.txt', text: 'one' })
await ws.writeText('preview/create.txt', 'raced')
await assert.rejects(async function () { return ws.applyOperation(createPreview) }, /target appeared/)
const updateBase = await ws.readText('preview/create.txt')
const updatePreview = await ws.previewOperation({ op: 'writeText', path: 'preview/create.txt', text: 'two', baseHash: updateBase.hash })
await ws.writeText('preview/create.txt', 'three', { baseHash: updateBase.hash })
await assert.rejects(async function () { return ws.applyOperation(updatePreview) }, /hash changed/)
const overwritePreview = await ws.previewOperation({ op: 'writeText', path: 'preview/create.txt', text: 'forced', overwrite: true })
await assert.rejects(async function () { return ws.applyOperation(overwritePreview, { confirmWarnings: true }) }, /confirmOverwrite/)
await ws.applyOperation(overwritePreview, { confirmWarnings: true, confirmOverwrite: true })
assert.equal((await ws.readText('preview/create.txt')).text, 'forced')
await ws.mkdir('tree')
await ws.writeText('tree/a.txt', 'a')
const deletePreview = await ws.previewOperation({ op: 'delete', path: 'tree', recursive: true })
await ws.writeText('tree/b.txt', 'b')
await assert.rejects(async function () { return ws.applyOperation(deletePreview, { confirmWarnings: true }) }, /directory contents changed/)
await assert.rejects(async function () { return ws.snapshot('tree', { recursive: true, maxMemoryBytes: 1 }) }, /maxMemoryBytes/)

class FakeFileHandle {
  constructor(name, parent, text) {
    this.kind = 'file'
    this.name = name
    this.parent = parent
    this.text = text || ''
  }
  async getFile() {
    const self = this
    return { async text() { return self.text } }
  }
  async createWritable() {
    const self = this
    return {
      async write(text) { self.text = String(text) },
      async close() {},
    }
  }
}

class FakeDirHandle {
  constructor(name) {
    this.kind = 'directory'
    this.name = name
    this.entries = {}
  }
  async getDirectoryHandle(name, opts) {
    if (!this.entries[name] && opts && opts.create) this.entries[name] = new FakeDirHandle(name)
    const entry = this.entries[name]
    if (!entry || entry.kind !== 'directory') throw new Error('directory not found: ' + name)
    return entry
  }
  async getFileHandle(name, opts) {
    if (!this.entries[name] && opts && opts.create) this.entries[name] = new FakeFileHandle(name, this, '')
    const entry = this.entries[name]
    if (!entry || entry.kind !== 'file') throw new Error('file not found: ' + name)
    return entry
  }
  async removeEntry(name) {
    delete this.entries[name]
  }
  async *values() {
    for (const name of Object.keys(this.entries)) yield this.entries[name]
  }
}

const root = new FakeDirHandle('root')
const src = await root.getDirectoryHandle('src', { create: true })
const nested = await root.getDirectoryHandle('nested', { create: true })
src.entries['panel.js'] = new FakeFileHandle('panel.js', src, 'alpha\nbeta\n')
nested.entries['other.js'] = new FakeFileHandle('other.js', nested, 'beta\n')
const fsa = aiditor.workspace.fromHandle(root)
assert.equal((await fsa.search('beta', { path: 'src', limit: 10 })).length, 1)
assert.equal((await fsa.search('beta', { path: 'src/panel.js', limit: 10 }))[0].path, 'src/panel.js')
assert.equal((await fsa.capabilities()).revealInSystem, false)
assert.deepEqual(await fsa.revealInSystem('src/panel.js'), { ok: false, reason: 'unsupported' })
await fsa.delete('src/panel.js')
await assert.rejects(async function () { return fsa.readText('src/panel.js') }, /file not found/)

const revealed = []
const bridge = aiditor.workspace.fromBridge({
  kind: function () { return 'bridge' },
  rootId: function () { return 'bridge' },
  stat: async function (path) {
    if (path === 'missing.txt') throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { path: path, name: path.split('/').pop(), kind: 'file', size: 1, hash: 'h', mtime: 1, mime: 'text/plain' }
  },
  revealInSystem: async function (path, opts) {
    revealed.push({ path: path, select: !!(opts && opts.select) })
    if (path === 'denied.txt') throw Object.assign(new Error('denied'), { code: 'EACCES' })
    if (path === 'bad.txt') return { ok: false, reason: 'custom' }
    return { ok: true, absolutePath: '/must/not/leak' }
  },
})
assert.equal((await bridge.capabilities()).revealInSystem, true)
assert.deepEqual(await bridge.revealInSystem('src//panel.js', { select: true }), { ok: true })
assert.deepEqual(revealed[0], { path: 'src/panel.js', select: true })
assert.deepEqual(await bridge.revealInSystem('missing.txt'), { ok: false, reason: 'not_found' })
assert.deepEqual(await bridge.revealInSystem('denied.txt'), { ok: false, reason: 'permission_denied' })
assert.deepEqual(await bridge.revealInSystem('bad.txt'), { ok: false, reason: 'platform_error' })
await assert.rejects(async function () { return bridge.revealInSystem('../secret.txt') }, /escapes root/)

console.log('workspace tests ok')
