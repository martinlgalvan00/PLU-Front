const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN ?? ''
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID ?? ''
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE ?? ''

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
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
  },
  mercadoPago: {
    publicKey: import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? '',
    configured: Boolean(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY),
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
