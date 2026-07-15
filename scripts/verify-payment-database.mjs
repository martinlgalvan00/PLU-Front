import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // La variable también puede venir del entorno del proceso o del CI.
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim()

if (!databaseUrl) {
  console.error('Definí SUPABASE_DATABASE_URL con la conexión directa o pooler de la base Supabase a verificar.')
  process.exit(1)
}

const prismaCli = resolve('node_modules/prisma/build/index.js')
const smokeFile = resolve('supabase/tests/payment_state_machine.sql')

if (!existsSync(prismaCli) || !existsSync(smokeFile)) {
  console.error('Faltan Prisma instalado o el smoke SQL. Ejecutá npm install antes de verificar.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [
  prismaCli,
  'db',
  'execute',
  '--file', smokeFile,
  '--url', databaseUrl,
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'pipe',
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status !== 0) {
  console.error('La verificación transaccional de pagos falló; no se dejaron fixtures porque el script hace rollback.')
  process.exit(result.status ?? 1)
}

console.log('Verificación transaccional de pagos aprobada; no se dejaron datos de prueba.')
