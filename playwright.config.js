import { defineConfig, devices } from '@playwright/test'
import { resolveLocalSupabase } from './e2e/local-supabase.js'

/**
 * E2E de checkout — corre contra Supabase LOCAL (Docker) + API con
 * `PAYMENTS_MOCK=true`, en puertos dedicados (3011/5183) para no chocar con
 * `npm run dev` (3001/5173). Mismo patrón que scripts/e2e-mercado-pago.mjs.
 *
 * Prerrequisito: `npx supabase start`. Nunca lee `.env` (proyecto hosteado,
 * real y persistente) — ver e2e/local-supabase.js.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 3011)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5183)
const WEB_URL = `http://localhost:${WEB_PORT}`
const API_URL = `http://127.0.0.1:${API_PORT}`

const supabase = resolveLocalSupabase()

// Sin credenciales reales: `server/index.js` hace `loadEnvFile()` (que NO
// pisa lo ya seteado), así que blanquear acá estas integraciones evita que el
// server salga a internet con secretos reales durante el E2E.
const serverEnv = {
  ...process.env,
  PORT: String(API_PORT),
  PAYMENTS_MOCK: 'true',
  APP_PRODUCTION: 'false',
  APP_URL: WEB_URL,
  AUTH_SECRET: 'e2e-checkout-coupon-secret',
  SUPABASE_URL: supabase.url,
  SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
  MERCADO_PAGO_ACCESS_TOKEN: '',
  BREVO_API_KEY: '',
  BREVO_SENDER_EMAIL: '',
  // Prisma (`plu_prisma`, staff/admin) no participa del checkout de atleta
  // que ejercita este E2E; en blanco para que ningún job de fondo del server
  // pueda tocar una base remota si alguna terminal ya la tenía exportada.
  DATABASE_URL: '',
  // El store de rate limit por defecto persiste en Postgres (sharedRateLimitStore.js)
  // para sobrevivir instancias serverless — pero eso significa que corridas
  // repetidas de este E2E dentro de la misma ventana de 15' comparten contador
  // y terminan en 429 aunque cada una arranca un server nuevo. Sin esto cae al
  // store en memoria, que sí resetea con cada proceso.
  SHARED_RATE_LIMIT_ENABLED: 'false',
}

const webEnv = {
  ...process.env,
  // Vite lee PORT para alinear el proxy de /api con la API (vite.config.js).
  PORT: String(API_PORT),
  PAYMENTS_MOCK: 'true',
  APP_PRODUCTION: 'false',
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],
  outputDir: 'e2e/.test-results',
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node server/index.js',
      url: `${API_URL}/health`,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: webEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
