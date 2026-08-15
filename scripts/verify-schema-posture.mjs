import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

/**
 * verify-schema-posture.mjs — PLU ARG
 *
 * Corre `supabase/tests/schema_posture.sql` contra la base apuntada por
 * SUPABASE_DATABASE_URL: RLS activo, el navegador sin escritura, las RPC de
 * cobro cerradas, toda funcion definer con search_path y las piezas del cobro
 * presentes.
 *
 * Es el complemento en runtime de `tests/infra.databaseSchema.test.js`: aquel
 * audita lo que dicen las migraciones del repositorio, este lo que tiene puesto
 * la base de verdad. Los dos hacen falta porque se rompen por motivos
 * distintos: uno detecta la migracion mal escrita, el otro la migracion que no
 * llego, la que se aplico a medias y el privilegio cambiado a mano desde el
 * panel de Supabase.
 *
 * Solo lee: el archivo abre transaccion y termina en rollback.
 */

try {
  loadEnvFile()
} catch {
  // En CI las variables ya vienen del entorno.
}

const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim()

if (!databaseUrl) {
  console.error(
    'Definí SUPABASE_DATABASE_URL con la conexión directa o pooler de la base a verificar.',
  )
  process.exit(1)
}

const prismaCli = resolve('node_modules/prisma/build/index.js')
const postureFile = resolve('supabase/tests/schema_posture.sql')

if (!existsSync(prismaCli) || !existsSync(postureFile)) {
  console.error('Faltan Prisma instalado o el SQL de postura. Ejecutá npm install antes de verificar.')
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [prismaCli, 'db', 'execute', '--file', postureFile, '--url', databaseUrl],
  { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' },
)

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status !== 0) {
  console.error(
    'La postura de seguridad del esquema NO se cumple. El detalle está en la excepción de arriba: ' +
      'indica qué objeto la rompe (tabla sin RLS, privilegio abierto al navegador, función definer sin ' +
      'search_path o RPC de cobro faltante).',
  )
  process.exit(result.status ?? 1)
}

console.log('Postura de seguridad del esquema verificada. No se modificó nada: el script hace rollback.')
