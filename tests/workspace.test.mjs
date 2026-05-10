import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }

for (const file of [
  'src/core/workspace.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const EF = window.EF
const ws = EF.workspace.memory({
  'src/panel.js': 'one\ntwo\nthree\n',
  'data/items.json': '{"items":[]}',
})

assert.throws(function () { EF.workspace.normalizePath('../secret') }, /escapes root/)
assert.equal(EF.workspace.normalizePath('src\\./panel.js'), 'src/panel.js')

const read = await ws.read('src/panel.js')
assert.equal(read.text, 'one\ntwo\nthree\n')
assert.equal(read.hash, EF.workspace.hashText(read.text))

const patched = await ws.patch('src/panel.js', read.hash, [
  { startLine: 2, endLine: 2, replacement: 'TWO' },
])
assert.equal(patched.text, 'one\nTWO\nthree\n')

const found = await ws.search('TWO', { limit: 5 })
assert.equal(found.length, 1)
assert.equal(found[0].path, 'src/panel.js')
assert.equal(found[0].line, 2)

await ws.write('src/new.js', 'hello')
assert.equal((await ws.stat('src/new.js')).kind, 'file')
assert.equal((await ws.list('src')).some(function (item) { return item.path === 'src/new.js' }), true)

await ws.delete('src/new.js')
await assert.rejects(async function () { return ws.read('src/new.js') }, /file not found/)

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
const fsa = EF.workspace.fromHandle(root)
assert.equal((await fsa.search('beta', { path: 'src', limit: 10 })).length, 1)
assert.equal((await fsa.search('beta', { path: 'src/panel.js', limit: 10 }))[0].path, 'src/panel.js')
await fsa.delete('src/panel.js')
await assert.rejects(async function () { return fsa.read('src/panel.js') }, /file not found/)

console.log('workspace tests ok')
