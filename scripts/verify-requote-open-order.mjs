import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // La variable también puede venir del entorno o del CI.
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('Definí SUPABASE_DATABASE_URL con la conexión de Supabase a verificar.')
  process.exit(1)
}

const prismaCli = resolve('node_modules/prisma/build/index.js')
const smokeFile = resolve('supabase/tests/resumed_order_requote_flow.sql')
if (!existsSync(prismaCli) || !existsSync(smokeFile)) {
  console.error('Faltan Prisma instalado o el smoke de recotización. Ejecutá npm install.')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [prismaCli, 'db', 'execute', '--file', smokeFile, '--url', databaseUrl],
  { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
)
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.status !== 0) {
  console.error('Falló el recorrido de recotización; el rollback evita dejar fixtures.')
  process.exit(result.status ?? 1)
}

console.log(
  'Recotización verificada: una orden abierta con un código viejo y archivado pasa a 92.500 con el código del pedido, sin doble redención y sin reusar la preferencia; rollback completado.',
)
