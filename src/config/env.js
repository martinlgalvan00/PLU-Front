const browserOrigin = typeof window === 'undefined' ? '' : window.location.origin
const trimUrl = (value) => String(value ?? '').trim().replace(/\/+$/, '')
const appUrl = import.meta.env.PROD ? browserOrigin : trimUrl(import.meta.env.VITE_APP_URL) || browserOrigin
const apiUrl = import.meta.env.PROD ? '' : trimUrl(import.meta.env.VITE_API_URL)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN ?? ''
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID ?? ''
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE ?? ''
const mercadoPagoPublicKey = import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY?.trim() ?? ''
const paymentsMockRaw = String(import.meta.env.PAYMENTS_MOCK ?? '').trim().toLowerCase()
const paymentsMockEnabled = ['true', '1', 'yes'].includes(paymentsMockRaw)
const paymentsProvider = paymentsMockEnabled ? 'mock' : 'mercado_pago'
const paidCheckoutEnabledRaw = String(import.meta.env.PAID_CHECKOUT_ENABLED ?? '').trim().toLowerCase()
const paidCheckoutEnabled = ['true', '1', 'yes'].includes(paidCheckoutEnabledRaw)
  ? true
  : ['false', '0', 'no'].includes(paidCheckoutEnabledRaw) ? false : null
const isConfiguredValue = (value) => Boolean(value && !/^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i.test(value))

export const env = {
  appUrl,
  apiUrl,
  isDev: import.meta.env.DEV,
  // Kill switch operativo: sin valor el checkout público queda abierto.
  paidCheckoutEnabled,
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  supabase: { url: supabaseUrl, anonKey: supabaseAnonKey, configured: Boolean(supabaseUrl && supabaseAnonKey) },
  mercadoPago: { publicKey: mercadoPagoPublicKey, configured: isConfiguredValue(mercadoPagoPublicKey) },
  payments: {
    provider: paymentsProvider,
    mockEnabled: paymentsMockEnabled,
    // Un build publicado nunca activa la UI mock.
    isMock: paymentsProvider === 'mock' && import.meta.env.DEV,
    transferAlias: import.meta.env.VITE_PAYMENT_TRANSFER_ALIAS ?? '',
    transferCbu: import.meta.env.VITE_PAYMENT_TRANSFER_CBU ?? '',
    transferHolder: import.meta.env.VITE_PAYMENT_TRANSFER_HOLDER ?? '',
  },
  analytics: {
    enabled: import.meta.env.VITE_ANALYTICS_ENABLED !== 'false',
    excludedPrefixes: ['/admin'],
  },
  auth0: {
    domain: auth0Domain,
    clientId: auth0ClientId,
    audience: auth0Audience,
    redirectUri: appUrl,
    configured: Boolean(auth0Domain && auth0ClientId && auth0Audience),
  },
}
