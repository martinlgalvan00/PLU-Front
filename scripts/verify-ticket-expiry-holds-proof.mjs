import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

/**
 * Corre `supabase/tests/ticket_expiry_holds_proof.sql` contra la base apuntada
 * por SUPABASE_DATABASE_URL. El smoke abre transacción y hace rollback, así que
 * no deja fixtures ni toca órdenes reales.
 */
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
const smokeFile = resolve('supabase/tests/ticket_expiry_holds_proof.sql')
if (!existsSync(prismaCli) || !existsSync(smokeFile)) {
  console.error('Faltan Prisma instalado o el smoke de vencimiento de entradas. Ejecutá npm install.')
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
  console.error('Falló el recorrido de vencimiento y reapertura; el rollback evita dejar fixtures.')
  process.exit(result.status ?? 1)
}

console.log(
  'Vencimiento de entradas verificado: sin comprobante se cancela, con comprobante no; un rechazo de staff y un cupo lleno no se reabren; la reapertura vuelve a pendiente y después se puede acreditar; acreditar en un paso deja la orden paga. Rollback completado.',
)
