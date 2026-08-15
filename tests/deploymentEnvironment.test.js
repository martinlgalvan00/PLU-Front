import { describe, expect, it } from 'vitest'
import {
  applyDeploymentEnvironmentDefaults,
  buildRuntimeDatabaseUrl,
  OFFICIAL_APP_URL,
  resolveDeploymentAppUrl,
} from '../server/lib/deploymentEnvironment.js'

describe('deployment environment', () => {
  it('usa la URL estable de la rama en preview', () => {
    expect(
      resolveDeploymentAppUrl({
        VERCEL_ENV: 'preview',
        VERCEL_BRANCH_URL: 'plu-git-dev.example.vercel.app',
        VERCEL_URL: 'plu-commit.example.vercel.app',
      }),
    ).toBe('https://plu-git-dev.example.vercel.app')
  })

  it('usa el dominio productivo en production', () => {
    expect(
      resolveDeploymentAppUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'pluarg.com',
        VERCEL_URL: 'plu-commit.example.vercel.app',
      }),
    ).toBe(OFFICIAL_APP_URL)
  })

  it('en producción usa el dominio oficial según Vercel', () => {
    expect(
      resolveDeploymentAppUrl({
        VERCEL_ENV: 'production',
        APP_URL: 'http://localhost:5173',
      }),
    ).toBe(OFFICIAL_APP_URL)
  })

  /**
   * El dominio oficial tiene que ser el que **sirve** la aplicación, no el que
   * redirige hacia ella.
   *
   * El apex `powerliftingunited.ar` responde 308 hacia `www`. Para un navegador
   * eso es invisible, pero Mercado Pago exige 200/201 en la `notification_url`
   * y no sigue redirects: durante toda la vida del sistema ninguna notificación
   * se entregó y `payment_integration_events` quedó en cero. No se veía roto
   * porque el checkout embebido acredita contra la respuesta del Brick.
   */
  it('el dominio oficial es el que sirve la app, no el apex que redirige', () => {
    expect(OFFICIAL_APP_URL).toBe('https://www.powerliftingunited.ar')
    expect(new URL(OFFICIAL_APP_URL).hostname.startsWith('www.')).toBe(true)
  })

  it('la notification_url de producción sale del dominio que responde 200', () => {
    // Es la URL exacta que `mercadoPagoAdapter` arma y manda a MP.
    const webhook = new URL(
      '/api/payments/webhook/mercadopago',
      resolveDeploymentAppUrl({ VERCEL_ENV: 'production' }),
    )
    expect(webhook.toString()).toBe(
      'https://www.powerliftingunited.ar/api/payments/webhook/mercadopago',
    )
    expect(webhook.protocol).toBe('https:')
  })

  it('en desarrollo conserva APP_URL local', () => {
    expect(
      resolveDeploymentAppUrl({
        APP_URL: 'http://localhost:5173',
      }),
    ).toBe('http://localhost:5173')
  })

  it('deriva API y datasource Prisma sin pisar valores explícitos', () => {
    const env = {
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'plu-git-dev.example.vercel.app',
      SUPABASE_DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
    }

    applyDeploymentEnvironmentDefaults(env)

    expect(env.APP_URL).toBe('https://plu-git-dev.example.vercel.app')
    expect(env.API_URL).toBe(env.APP_URL)
    expect(new URL(env.DATABASE_URL).searchParams.get('schema')).toBe('plu_prisma')
  })

  it('rechaza URLs que no son PostgreSQL', () => {
    expect(() => buildRuntimeDatabaseUrl('https://db.example.com')).toThrow(
      'conexión PostgreSQL válida',
    )
  })
})
