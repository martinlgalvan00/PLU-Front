const browserOrigin = typeof window === 'undefined' ? '' : window.location.origin
const trimUrl = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
const appUrl = import.meta.env.PROD
  ? browserOrigin
  : trimUrl(import.meta.env.VITE_APP_URL) || browserOrigin
const apiUrl = import.meta.env.PROD ? '' : trimUrl(import.meta.env.VITE_API_URL)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN ?? ''
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID ?? ''
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE ?? ''
const mercadoPagoPublicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY?.trim() ?? ''
const paymentsMockRaw = String(import.meta.env.PAYMENTS_MOCK ?? '')
  .trim()
  .toLowerCase()
const paymentsProvider = ['true', '1', 'yes'].includes(paymentsMockRaw) ? 'mock' : 'mercado_pago'
const appProductionRaw = String(import.meta.env.APP_PRODUCTION ?? '')
  .trim()
  .toLowerCase()
const appProduction = ['true', '1', 'yes'].includes(appProductionRaw)
const isConfiguredValue = (value) =>
  Boolean(value && !/^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i.test(value))

export const env = {
  appUrl,
  apiUrl,
  isDev: import.meta.env.DEV,
  // true = presentación/comportamiento de producción (ocultar WIP, demos, etc.).
  // Independiente del build: en Vercel Production poné APP_PRODUCTION=true;
  // en Preview y local, false. Con true se ocultan WIPs (recurring + pricing writes).
  appProduction,
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true' && !appProduction,
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
  },
  mercadoPago: {
    publicKey: mercadoPagoPublicKey,
    configured: isConfiguredValue(mercadoPagoPublicKey),
  },
  payments: {
    provider: paymentsProvider,
    // Solo en Vite DEV: un build de producción nunca activa UI/mock aunque el flag quede en el env.
    isMock: paymentsProvider === 'mock' && import.meta.env.DEV,
    transferAlias: import.meta.env.VITE_PAYMENT_TRANSFER_ALIAS ?? '',
    transferCbu: import.meta.env.VITE_PAYMENT_TRANSFER_CBU ?? '',
    transferHolder: import.meta.env.VITE_PAYMENT_TRANSFER_HOLDER ?? '',
  },
  auth0: {
    domain: auth0Domain,
    clientId: auth0ClientId,
    audience: auth0Audience,
    redirectUri: appUrl,
    configured: Boolean(auth0Domain && auth0ClientId && auth0Audience),
  },
  // Brevo es server-only: la API key y los template IDs viven en el backend
  // (`BREVO_*`, sin prefijo VITE_). El browser no los necesita ni debe verlos.
}
