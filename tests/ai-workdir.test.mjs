import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/workspace.js',
  'src/ai/name-generator.js',
  'src/ai/store.js',
  'src/ai/context.js',
  'src/ai/workdir.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const EF = window.EF
const ai = EF.ai
const workspace = EF.workspace.memory({
  'src/app.js': 'const value = 1\nconsole.log(value)\n',
  'README.md': 'hello workspace',
})

const agent = ai.createAgent({ name: 'Workspace Agent', permissionMode: 'default' })
const dir = ai.setProjectWorkspace(workspace, { id: 'memory:test', label: 'Test Workspace', kind: 'memory' })

assert.deepEqual(dir, { id: 'memory:test', label: 'Test Workspace', kind: 'memory' })
assert.equal(ai.projectDirectoryLabel(), 'Test Workspace')
assert.equal(ai.projectWorkspace(), workspace)

const child = ai.createAgent({ name: 'Child', parentAgentId: agent.id, select: false })
assert.equal(child.workingDirectory, undefined)
assert.equal(ai.projectWorkspace(), workspace)

const ctx = { agent: ai.findAgent(agent.id) }
const files = await ai.getTool('workspace.listFiles').run({}, ctx)
assert.deepEqual(files.map(function (file) { return file.path }).sort(), ['README.md', 'src'])

const read = await ai.getTool('workspace.readFile').run({ path: 'src/app.js' }, ctx)
assert.equal(read.hash, EF.workspace.hashText(read.text))
assert.match(read.text, /const value/)

const patched = await ai.getTool('workspace.patchFile').run({
  path: 'src/app.js',
  baseHash: read.hash,
  patches: [{ startLine: 1, endLine: 1, replacement: 'const value = 2' }],
}, ctx)
assert.match(patched.text, /value = 2/)

await ai.getTool('workspace.writeFile').run({ path: 'src/extra.js', text: 'export const ok = true\n' }, ctx)
const matches = await ai.getTool('workspace.searchFiles').run({ query: 'ok', path: 'src' }, ctx)
assert.equal(matches[0].path, 'src/extra.js')

const deleted = await ai.getTool('workspace.deleteFile').run({ path: 'src/extra.js' }, ctx)
assert.deepEqual(deleted, { path: 'src/extra.js', deleted: true })

console.log('ai workdir tests ok')
