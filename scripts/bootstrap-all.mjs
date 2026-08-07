import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js')
const supabaseCli = resolve(projectRoot, 'node_modules/supabase/dist/supabase.js')
const requireFromScript = createRequire(import.meta.url)

const SUPABASE_CLI_PLATFORMS = {
  darwin: { arm64: ['darwin-arm64'], x64: ['darwin-x64'] },
  linux: {
    arm64: ['linux-arm64', 'linux-arm64-musl'],
    x64: ['linux-x64', 'linux-x64-musl'],
  },
  win32: { arm64: ['windows-arm64'], x64: ['windows-x64'] },
}

export const REQUIRED_ENVIRONMENT = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DATABASE_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'AUTH_SECRET',
]

export function findMissingEnvironment(env = process.env) {
  return REQUIRED_ENVIRONMENT.filter((key) => !env[key]?.trim())
}

export function parsePendingMigrations(output = '') {
  return [...output.matchAll(/[•]\s+(\d{14}_[^\r\n]+\.sql)/g)].map((match) => match[1])
}

export function scrubSecrets(value = '') {
  return String(value)
    .replace(/postgresql:\/\/[^\s"'`]+/gi, 'postgresql://***')
    .replace(/postgres:\/\/[^\s"'`]+/gi, 'postgres://***')
}

export function isRetryableSpawnError(errorOrOutput = '') {
  const text =
    typeof errorOrOutput === 'string'
      ? errorOrOutput
      : `${errorOrOutput?.message ?? ''}\n${errorOrOutput?.code ?? ''}\n${errorOrOutput?.syscall ?? ''}`
  return /uv_spawn|EUNKNOWN|UNKNOWN.*spawn/i.test(text)
}

export function shouldSkipMigrations(env = process.env) {
  return /^(1|true|yes)$/i.test(String(env.BOOTSTRAP_SKIP_MIGRATIONS ?? '').trim())
}

export function resolveSupabaseBinary({
  platform = process.platform,
  arch = os.arch(),
  env = process.env,
} = {}) {
  if (env.SUPABASE_CLI_BINARY_OVERRIDE?.trim()) return env.SUPABASE_CLI_BINARY_OVERRIDE.trim()

  const candidates = SUPABASE_CLI_PLATFORMS[platform]?.[arch]
  if (!candidates) return null

  const ext = platform === 'win32' ? '.exe' : ''
  for (const suffix of candidates) {
    try {
      const pkgPath = dirname(requireFromScript.resolve(`@supabase/cli-${suffix}/package.json`))
      const binary = join(pkgPath, 'bin', `supabase${ext}`)
      if (existsSync(binary)) return binary
    } catch {
      // optional dependency ausente en esta plataforma
    }
  }
  return null
}

export function assertBrowserKeyIsPublic(key) {
  if (!key) return
  if (key.startsWith('sb_secret_')) {
    throw new Error('VITE_SUPABASE_ANON_KEY no puede contener una Secret API Key.')
  }

  const [, payload] = key.split('.')
  if (!payload) return

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
    if (decoded?.role === 'service_role') {
      throw new Error('VITE_SUPABASE_ANON_KEY no puede contener service_role.')
    }
  } catch (error) {
    if (error.message.includes('VITE_SUPABASE')) throw error
  }
}

export function buildPrismaDatabaseUrl(supabaseDatabaseUrl) {
  const url = new URL(supabaseDatabaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL debe ser una conexión PostgreSQL válida.')
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('SUPABASE_DATABASE_URL debe apuntar al PostgreSQL remoto de Supabase, no a Docker/local.')
  }
  url.searchParams.set('schema', 'plu_prisma')
  return url.toString()
}

function heading(message) {
  console.log(`\n=== ${message} ===`)
}

function describeCommand(command, args) {
  return scrubSecrets([command, ...args].join(' '))
}

function run(command, args, { capture = false, env = process.env, retries = 0 } = {}) {
  let attempt = 0
  let lastFailure

  while (attempt <= retries) {
    const result = spawnSync(command, args, {
      cwd: projectRoot,
      env,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (capture && output.trim()) process.stdout.write(scrubSecrets(output))

    if (!result.error && result.status === 0) return output

    const failureText = result.error
      ? `${result.error.message}\n${result.error.code ?? ''}`
      : output || `exit ${result.status ?? 'desconocido'}`
    lastFailure = result.error ?? new Error(failureText)

    if (attempt < retries && isRetryableSpawnError(failureText)) {
      attempt += 1
      console.warn(`Reintento ${attempt}/${retries} tras fallo intermitente del CLI…`)
      continue
    }

    throw new Error(
      scrubSecrets(
        `Falló: ${describeCommand(command, args)} (exit ${result.status ?? 'desconocido'}). ${failureText.split('\n')[0]}`,
      ),
    )
  }

  throw lastFailure
}

function runNode(script, args = [], options) {
  return run(process.execPath, [script, ...args], options)
}

function runPrisma(args, options) {
  return runNode(prismaCli, args, options)
}

function runSupabase(args, options = {}) {
  const binary = resolveSupabaseBinary()
  const retries = options.retries ?? 2
  if (binary) return run(binary, args, { ...options, retries })
  return runNode(supabaseCli, args, { ...options, retries })
}

function ensureFilesExist() {
  for (const file of [prismaCli, supabaseCli, resolve(projectRoot, '.env')]) {
    if (!existsSync(file)) {
      throw new Error(`Falta ${file}. Ejecutá npm install y creá .env desde .env.example.`)
    }
  }
}

function loadEnvironment() {
  try {
    loadEnvFile(resolve(projectRoot, '.env'))
  } catch {
    throw new Error('No se pudo leer .env. Copiá .env.example y completá las credenciales.')
  }

  const missing = findMissingEnvironment()
  if (missing.length) throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}.`)

  assertBrowserKeyIsPublic(process.env.VITE_SUPABASE_ANON_KEY)

  const serverUrl = new URL(process.env.SUPABASE_URL)
  const browserUrl = new URL(process.env.VITE_SUPABASE_URL)
  if (serverUrl.pathname !== '/' || browserUrl.pathname !== '/') {
    throw new Error('SUPABASE_URL y VITE_SUPABASE_URL deben ser la URL base, sin /rest/v1/.')
  }
  if (serverUrl.origin !== browserUrl.origin) {
    throw new Error('SUPABASE_URL y VITE_SUPABASE_URL deben apuntar al mismo proyecto.')
  }

  // Prisma comparte la instancia alojada de Supabase, pero usa su propio
  // schema para no colisionar con las tablas/RPC/RLS del dominio público.
  process.env.DATABASE_URL = buildPrismaDatabaseUrl(process.env.SUPABASE_DATABASE_URL)
}

function setupPrisma({ skipMigrations = false } = {}) {
  heading('Supabase PostgreSQL: Prisma (schema plu_prisma)')
  console.log('Prisma usa Supabase remoto; Docker no es necesario.')

  runPrisma(['validate'])
  runPrisma(['generate'])

  if (skipMigrations) {
    console.log('Migraciones Prisma omitidas (BOOTSTRAP_SKIP_MIGRATIONS=1).')
  } else {
    runPrisma(['migrate', 'deploy'])
  }

  if (process.env.SEED_ADMIN_EMAIL?.trim() && process.env.SEED_ADMIN_PASSWORD) {
    runNode(resolve(projectRoot, 'prisma/seed.js'))
  } else {
    console.log('Seed admin omitido: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no configurados.')
  }
}

function setupSupabase({ skipMigrations = false } = {}) {
  heading('Supabase remoto: migraciones transaccionales')
  if (skipMigrations) {
    console.log('Migraciones Supabase omitidas (BOOTSTRAP_SKIP_MIGRATIONS=1).')
    return
  }

  const dryRun = runSupabase([
    'db',
    'push',
    '--db-url',
    process.env.SUPABASE_DATABASE_URL,
    '--include-all',
    '--dry-run',
  ], { capture: true })

  const pending = parsePendingMigrations(dryRun)
  if (pending.length === 0) {
    console.log('Supabase ya está actualizado; no se aplicaron cambios.')
    return
  }

  console.log(`Migraciones pendientes: ${pending.join(', ')}`)
  runSupabase([
    'db',
    'push',
    '--db-url',
    process.env.SUPABASE_DATABASE_URL,
    '--include-all',
    '--yes',
  ])

  const postDryRun = runSupabase([
    'db',
    'push',
    '--db-url',
    process.env.SUPABASE_DATABASE_URL,
    '--include-all',
    '--dry-run',
  ], { capture: true })
  const stillPending = parsePendingMigrations(postDryRun)
  if (stillPending.length) {
    throw new Error(`Supabase conserva migraciones pendientes: ${stillPending.join(', ')}.`)
  }
}

async function verifySupabase() {
  heading('Supabase: conectividad y permisos')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: adminError } = await admin.from('events').select('id', { head: true, count: 'exact' }).limit(1)
  if (adminError) throw new Error(`El cliente backend de Supabase falló: ${adminError.message}`)

  const browser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: publicError } = await browser.from('events').select('id', { head: true, count: 'exact' }).eq('published', true)
  if (publicError) throw new Error(`La lectura pública de eventos falló: ${publicError.message}`)

  const { error: sensitiveError } = await browser.rpc('list_athlete_admin_data')
  if (!sensitiveError) throw new Error('RLS inválida: anon pudo ejecutar list_athlete_admin_data.')

  console.log('Supabase Admin: OK')
  console.log('Supabase público/RLS: OK')
}

function verifyPayments() {
  heading('Pagos: smoke transaccional')
  runNode(resolve(projectRoot, 'scripts/verify-payment-database.mjs'))
}

function isPortOpen(port, host) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolvePromise(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolvePromise(false)
    })
    socket.once('error', () => resolvePromise(false))
  })
}

/**
 * Los puertos solo se exigen cuando el bootstrap va a levantar los servicios
 * (`--start`). Antes el 3001 se chequeaba siempre, así que tener el dev server
 * abierto bloqueaba `npm run setup:all` -- que solo migra y siembra, y no usa
 * ese puerto para nada. Migrar con el API corriendo es válido: ni Prisma ni
 * `supabase db push` necesitan que nadie suelte la conexión.
 */
async function assertPortsAvailable(includeServices) {
  if (!includeServices) return

  const apiIpv4 = await isPortOpen(3001, '127.0.0.1')
  const apiLocalhost = await isPortOpen(3001, 'localhost')
  if (apiIpv4 || apiLocalhost) {
    throw new Error('El puerto 3001 está ocupado. Cerrá el API/dev anterior con Ctrl+C y reintentá.')
  }

  if (includeServices) {
    const webIpv4 = await isPortOpen(5173, '127.0.0.1')
    const webLocalhost = await isPortOpen(5173, 'localhost')
    if (webIpv4 || webLocalhost) {
      throw new Error('El puerto 5173 está ocupado. Cerrá el Vite anterior con Ctrl+C y reintentá.')
    }
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`${url} respondió ${response.status}.`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw lastError ?? new Error(`Timeout esperando ${url}.`)
}

async function startDevelopment() {
  heading('Aplicación: Vite + Express')
  const npmCli = process.env.npm_execpath
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error('No se encontró npm-cli. Ejecutá este flujo mediante npm run dev:all.')
  }

  const child = spawn(process.execPath, [npmCli, 'run', 'dev:services'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })

  const childExit = new Promise((_, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`El proceso dev terminó antes de estar listo (exit ${code}).`)))
  })

  await Promise.race([
    Promise.all([
      waitForHttp('http://localhost:5173/', 30_000),
      waitForHttp('http://localhost:3001/ready', 30_000).then(async (response) => {
        const readiness = await response.json()
        if (!readiness.checks?.prisma || !readiness.checks?.supabase) {
          throw new Error(`/ready incompleto: ${JSON.stringify(readiness.checks)}`)
        }
      }),
    ]),
    childExit,
  ])

  console.log('\nTodo listo:')
  console.log('  Frontend: http://localhost:5173')
  console.log('  API:      http://localhost:3001')
  console.log('  Ready:    http://localhost:3001/ready')
  console.log('  Ctrl+C cierra frontend y API.')

  const exitCode = await new Promise((resolvePromise, reject) => {
    child.removeAllListeners('exit')
    child.once('error', reject)
    child.once('exit', (code) => resolvePromise(code ?? 0))
  })
  if (exitCode !== 0) throw new Error(`El proceso dev terminó con exit ${exitCode}.`)
}

export async function main(args = process.argv.slice(2)) {
  const shouldStart = args.includes('--start')
  const skipMigrations = shouldSkipMigrations()
  ensureFilesExist()
  loadEnvironment()
  await assertPortsAvailable(shouldStart)
  setupPrisma({ skipMigrations })
  setupSupabase({ skipMigrations })
  await verifySupabase()
  verifyPayments()

  console.log('\nBootstrap completo: Prisma y Supabase están migrados y verificados.')
  if (shouldStart) await startDevelopment()
}

const currentFile = resolve(fileURLToPath(import.meta.url))
const executedFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (currentFile === executedFile) {
  main().catch((error) => {
    console.error(`\nERROR: ${scrubSecrets(error.message)}`)
    process.exitCode = 1
  })
}
