import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('browser env', () => {
  it('activa el mock de pagos solo en Vite DEV', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    expect(source).toContain('PAYMENTS_MOCK')
    expect(source).not.toContain('VITE_PAYMENTS_MOCK')
    expect(source).not.toContain('VITE_PAYMENTS_PROVIDER')
    expect(source).toContain('import.meta.env.DEV')
    expect(source).toContain("paymentsProvider === 'mock' && import.meta.env.DEV")
  })

  it('expone el kill switch de checkout sin una bandera de producción propia', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    expect(source).toContain('PAID_CHECKOUT_ENABLED')
    expect(source).toContain('paidCheckoutEnabled')
    expect(source).not.toContain('APP_PRODUCTION')
    expect(source).not.toContain('appProduction')
    expect(source).not.toContain('PAID_CHECKOUT_OPENS_AT')
    expect(source).not.toContain('paidCheckoutOpensAt')
    expect(source).toContain("demoMode: import.meta.env.VITE_DEMO_MODE === 'true'")
  })

  it('trata VITE_TICKET_SALES_ENABLED como freno, no como alta de entradas', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    expect(source).toContain('VITE_TICKET_SALES_ENABLED')
    expect(source).toContain('ticketSalesEnabled')
    expect(source).toContain("['false', '0', 'no']")
    expect(source).not.toMatch(
      /ticketSalesEnabled = \['true', '1', 'yes'\]\.includes\(ticketSalesEnabledRaw\)/,
    )
  })

  it('no expone secretos privados en config cliente', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')

    expect(source).not.toContain('VITE_MERCADO_PAGO_ACCESS_TOKEN')
    expect(source).not.toContain('VITE_BREVO_API_KEY')
    expect(source).not.toContain('VITE_AUTH0_CLIENT_SECRET')
    expect(source).not.toContain('accessToken')
    expect(source).not.toContain('apiKey')
    expect(source).not.toContain('clientSecret')
  })

  it('no permite credenciales admin de Supabase en el bundle del browser', () => {
    const envSource = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    const clientSource = readFileSync(join(process.cwd(), 'src/lib/supabaseClient.js'), 'utf8')

    expect(envSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(envSource).not.toContain('SUPABASE_SECRET_KEY')
    expect(clientSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(clientSource).not.toContain('SUPABASE_SECRET_KEY')
    expect(clientSource).toContain('assertBrowserSupabaseKeyIsPublic')
  })

  it('expone solo configuracion publica de Auth0 para OAuth SPA', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')

    expect(source).toContain('VITE_AUTH0_DOMAIN')
    expect(source).toContain('VITE_AUTH0_CLIENT_ID')
    expect(source).toContain('VITE_AUTH0_AUDIENCE')
  })
})

describe('server Supabase admin env', () => {
  it('no usa variables VITE como fallback para operaciones privilegiadas', () => {
    const source = readFileSync(join(process.cwd(), 'server/lib/supabaseAdmin.js'), 'utf8')

    expect(source).not.toContain('process.env.VITE_SUPABASE_URL')
    expect(source).toContain('requireSupabaseAdminConfig')
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })
})
