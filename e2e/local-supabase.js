import { execFileSync } from 'node:child_process'

/**
 * Credenciales del stack LOCAL de Supabase (Docker, `npx supabase start`).
 *
 * Nunca lee `.env`: ese archivo apunta al proyecto hosteado (real y
 * persistente — ver bootstrap-all.mjs, que por diseño rechaza una
 * `SUPABASE_DATABASE_URL` en localhost). Este E2E sigue el mismo patrón que
 * `scripts/e2e-mercado-pago.mjs`: resuelve el proyecto local por su cuenta y
 * no toca la base hosteada en ningún punto.
 */
export function resolveLocalSupabase() {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const status = JSON.parse(raw.slice(raw.indexOf('{')))
  if (!status.API_URL || !status.SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase local no está corriendo. Corré `npx supabase start` antes de los tests E2E.',
    )
  }
  return { url: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY }
}

/** Organización de QA que ya usan los demás scripts E2E del repo. */
export const ORG_ID = '00000000-0000-4000-8000-000000000001'
