import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const APP = join(ROOT, 'temp', 'GameDataEditor')
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
    else if (entry.isFile() && path.endsWith('.js')) files.push(path)
  }
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

walk(join(APP, 'src'))

let failed = false
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed = true
    process.stderr.write(relative(ROOT, file) + '\n')
    process.stderr.write(r.stderr || r.stdout)
  }
  const source = readFileSync(file, 'utf8')
  if (/\.innerHTML\b|\binnerHTML\s*=/.test(source)) {
    failed = true
    process.stderr.write('banned innerHTML use: ' + relative(ROOT, file) + '\n')
  }
}

const pairs = [
  ['dist/ef.js', 'temp/GameDataEditor/vendor/ef.js'],
  ['dist/ef.css', 'temp/GameDataEditor/vendor/ef.css'],
]
for (const pair of pairs) {
  if (hash(join(ROOT, pair[0])) !== hash(join(ROOT, pair[1]))) {
    failed = true
    process.stderr.write('vendor drift: ' + pair[1] + ' does not match ' + pair[0] + '\n')
  }
}

if (failed) process.exit(1)
console.log('gde ok: ' + files.length + ' JS files, vendor EF in sync')
