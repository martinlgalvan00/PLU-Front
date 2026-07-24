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
const isConfiguredValue = (value) =>
  Boolean(value && !/^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i.test(value))

const brevoTemplates = {
  affiliationStarted: import.meta.env.VITE_BREVO_TEMPLATE_AFFILIATION_STARTED ?? '',
  paymentApproved: import.meta.env.VITE_BREVO_TEMPLATE_PAYMENT_APPROVED ?? '',
  registrationConfirmed: import.meta.env.VITE_BREVO_TEMPLATE_REGISTRATION_CONFIRMED ?? '',
  paymentPending: import.meta.env.VITE_BREVO_TEMPLATE_PAYMENT_PENDING ?? '',
  adminNotification: import.meta.env.VITE_BREVO_TEMPLATE_ADMIN_NOTIFICATION ?? '',
}

export const env = {
  appUrl,
  apiUrl,
  isDev: import.meta.env.DEV,
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
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
  brevo: {
    templates: brevoTemplates,
    configured: Object.values(brevoTemplates).some(Boolean),
  },
}
