import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildPrismaDatabaseUrl } from './bootstrap-all.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js')
const args = process.argv.slice(2)

try {
  loadEnvFile(resolve(projectRoot, '.env'))
} catch {
  console.error('No se pudo leer .env.')
  process.exit(1)
}

if (!process.env.SUPABASE_DATABASE_URL?.trim()) {
  console.error('Falta SUPABASE_DATABASE_URL en .env.')
  process.exit(1)
}

if (!existsSync(prismaCli) || args.length === 0) {
  console.error('Falta Prisma o el subcomando a ejecutar. Corré npm install primero.')
  process.exit(1)
}

process.env.DATABASE_URL = buildPrismaDatabaseUrl(process.env.SUPABASE_DATABASE_URL)

const executable = args[0] === 'seed' ? resolve(projectRoot, 'prisma/seed.js') : prismaCli
const executableArgs = args[0] === 'seed' ? [] : args

const result = spawnSync(process.execPath, [executable, ...executableArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
