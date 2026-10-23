import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

/**
 * Corre `supabase/tests/staff_delete_athlete_payment_order.sql` contra la base apuntada
 * por SUPABASE_DATABASE_URL. El smoke abre transacción y hace rollback, así que
 * no deja fixtures ni borra órdenes reales.
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
const smokeFile = resolve('supabase/tests/staff_delete_athlete_payment_order.sql')
if (!existsSync(prismaCli) || !existsSync(smokeFile)) {
  console.error('Faltan Prisma instalado o el smoke de baja de órdenes. Ejecutá npm install.')
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
  console.error('Falló el recorrido de baja de órdenes; el rollback evita dejar fixtures.')
  process.exit(result.status ?? 1)
}

console.log(
  'Baja de órdenes verificada: sin actor, sin motivo, inexistente, pago declarado, comprobante, intento en vuelo, orden cobrada y movimientos en el libro la rechazan con su propio código (PLU01/PLU02/PLU33/PLU32/PLU34/PLU31/PLU35); una cancelada y una abierta se borran con su asiento de auditoría; rollback completado.',
)
