#!/usr/bin/env node
/**
 * Wrapper de `npm run test:integration` — corre la suite y, pase lo que
 * pase (tests en verde, en rojo, o que corten a mitad de camino), purga
 * después las cuentas de TEST que haya creado. Así una corrida contra la
 * instancia local efímera de CI no deja nada raro entre archivos de test, y
 * una corrida local contra el proyecto Supabase real (con
 * ALLOW_REMOTE_INTEGRATION_TESTS=true, ver tests/integration/setup.js) no
 * deja atletas de prueba colgados en la base persistente.
 */
import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

const testExitCode = await run('npx', ['vitest', 'run', '--project', 'integration'])

console.log('\n--- Purgando cuentas de TEST creadas por la suite de integración ---')
const purgeExitCode = await run('node', ['scripts/purge-test-athletes.mjs', '--confirm'])
if (purgeExitCode !== 0) {
  console.error(
    'El purge automático de cuentas de TEST falló; revisalo a mano con `npm run purge:test-athletes -- --confirm`.',
  )
}

// El resultado de la suite manda: un purge fallido no debe blanquear un test
// roto, pero tampoco al revés.
process.exit(testExitCode !== 0 ? testExitCode : purgeExitCode)
