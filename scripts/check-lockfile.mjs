#!/usr/bin/env node
/**
 * Verifica que package.json y package-lock.json estén en sync
 * (misma garantía que `npm ci`, sin instalar node_modules).
 *
 * Uso: node scripts/check-lockfile.mjs
 *      npm run lock:check
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeHint = readFileSync(join(root, '.nvmrc'), 'utf8').trim()

const result = spawnSync(
  'npm',
  ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund'],
  {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  },
)

if (result.status === 0) {
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  console.log('OK: package-lock.json está en sync con package.json.')
  process.exit(0)
}

process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
console.error(`
Lockfile desincronizado (npm ci --dry-run falló).

Para corregirlo con Node ${nodeHint} (misma major que CI):
  npm install
  git add package-lock.json

No uses "npm install" en CI como workaround: ocultaría el desync.
`)
process.exit(result.status ?? 1)
