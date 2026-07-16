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

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
const missing = required.filter((key) => !process.env[key]?.trim())

if (missing.length > 0) {
  throw new Error(
    `Faltan variables de entorno para los tests de integración: ${missing.join(', ')}. ` +
      'Corré `supabase start` y definilas en tu .env (ver .env.example), o exportalas antes de correr `npm run test:integration`.',
  )
}
