const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const env = {
  appUrl,
  apiUrl,
  isDev: import.meta.env.DEV,
  mercadoPago: {
    publicKey: import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? '',
    accessToken: import.meta.env.VITE_MERCADO_PAGO_ACCESS_TOKEN ?? '',
    configured: Boolean(import.meta.env.VITE_MERCADO_PAGO_ACCESS_TOKEN),
  },
  brevo: {
    apiKey: import.meta.env.VITE_BREVO_API_KEY ?? '',
    templates: {
      affiliationStarted: import.meta.env.VITE_BREVO_TEMPLATE_AFFILIATION_STARTED ?? '',
      paymentApproved: import.meta.env.VITE_BREVO_TEMPLATE_PAYMENT_APPROVED ?? '',
      registrationConfirmed: import.meta.env.VITE_BREVO_TEMPLATE_REGISTRATION_CONFIRMED ?? '',
      paymentPending: import.meta.env.VITE_BREVO_TEMPLATE_PAYMENT_PENDING ?? '',
      adminNotification: import.meta.env.VITE_BREVO_TEMPLATE_ADMIN_NOTIFICATION ?? '',
    },
    configured: Boolean(import.meta.env.VITE_BREVO_API_KEY),
  },
}
