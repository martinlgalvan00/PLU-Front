import { defineConfig, devices } from '@playwright/test'

/**
 * E2E de flujos públicos con la API simulada en el navegador (`page.route`).
 *
 * A diferencia de `playwright.config.js` (Supabase local + Express), esto corre
 * sin Docker ni base: solo Vite. Cubre lo que decide la interfaz — qué ve el
 * público con la landing oculta, si aparece "Inscribirme", qué exige el
 * formulario y qué viaja en el POST de la inscripción. Lo que hace cumplir el
 * servidor (rechazos 409/422, cupo, ventana) lo cubren los tests de API de
 * Vitest (`tests/api.registration*.test.js`) y la suite contra Supabase local.
 *
 * La API apunta a un puerto sin servidor a propósito: si un test se olvida de
 * simular un endpoint, falla en vez de salir a una base real.
 */
const WEB_PORT = Number(process.env.E2E_FLOWS_WEB_PORT ?? 5193)
const WEB_URL = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e/flows',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report-flows', open: 'never' }]],
  outputDir: 'e2e/.test-results-flows',
  use: {
    baseURL: WEB_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${WEB_PORT} --strictPort`,
    url: WEB_URL,
    env: {
      ...process.env,
      // Proxy de /api a un puerto vacío: todo lo que el test no simula falla.
      PORT: String(process.env.E2E_FLOWS_DEAD_API_PORT ?? 59998),
      PAYMENTS_MOCK: 'true',
      APP_PRODUCTION: 'false',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
