import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const TARGETS = ['src', 'demo', 'tools', 'tests']
const files = []

function walk(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.isFile() && (path.endsWith('.js') || path.endsWith('.mjs'))) files.push(path)
  }
}

for (const dir of TARGETS) walk(join(ROOT, dir))
files.push(join(ROOT, 'dist', 'ef.js'))

let failed = false
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed = true
    process.stderr.write(file + '\n')
    process.stderr.write(r.stderr || r.stdout)
  }
}

if (failed) process.exit(1)
console.log('syntax ok: ' + files.length + ' files')
