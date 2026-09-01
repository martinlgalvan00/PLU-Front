// setup.js — tests de integración
//
// A diferencia de la suite normal (jsdom, todo mockeado), estos tests
// pegan contra una instancia real de Supabase local (`supabase start`).
// Este setup carga `.env` (mismo mecanismo que ya usa
// scripts/verify-payment-database.mjs) y falla temprano con un mensaje
// claro si falta configuración, en vez de dejar que cada test individual
// falle con un 503 genérico de "Supabase Admin no esta configurado."

try {
  process.loadEnvFile()
} catch {
  // La variable también puede venir ya seteada en el entorno (CI).
}

// Las credenciales personales generadas por los endpoints de seguridad se
// firman durante la suite. En CI no hay secretos de produccion, por lo que
// usamos una clave exclusiva de tests y respetamos cualquier valor provisto.
process.env.AUTH_SECRET ||= 'plu-arg-integration-tests-only-secret'

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const missing = required.filter((key) => !process.env[key]?.trim())

if (missing.length > 0) {
  throw new Error(
    `Faltan variables de entorno para los tests de integración: ${missing.join(', ')}. ` +
      'Corré `supabase start` y definilas en tu .env (ver .env.example), o exportalas antes de correr `npm run test:integration`.',
  )
}

// Varios tests registran atletas reales (POST /api/athletes/register) contra
// el SUPABASE_URL apuntado. En CI eso es la instancia efímera de
// `supabase start` (se destruye con el runner). Local, el .env de cada
// developer suele apuntar al proyecto Supabase real y persistente — correr
// la suite ahí deja cuentas de prueba en la base de producción. Este freno
// exige localhost salvo que el entorno sea CI o alguien confirme a propósito
// con ALLOW_REMOTE_INTEGRATION_TESTS=true.
const supabaseUrl = process.env.SUPABASE_URL.trim()
const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(?:\/|$)/.test(
  supabaseUrl,
)
const isCi = process.env.CI === 'true'
const remoteConfirmed = process.env.ALLOW_REMOTE_INTEGRATION_TESTS === 'true'

if (!isLocalSupabase && !isCi && !remoteConfirmed) {
  throw new Error(
    `SUPABASE_URL (${supabaseUrl}) no es una instancia local. Estos tests registran atletas ` +
      'reales y ensuciarían el proyecto Supabase apuntado. Corré `supabase start` y apuntá tu ' +
      '.env ahí, o si de verdad querés correr contra ese proyecto exportá ' +
      'ALLOW_REMOTE_INTEGRATION_TESTS=true (y después limpiá con `npm run purge:test-athletes -- --confirm`).',
  )
}
