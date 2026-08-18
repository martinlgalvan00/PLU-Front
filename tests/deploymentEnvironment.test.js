import { describe, expect, it } from 'vitest'
import {
  applyDeploymentEnvironmentDefaults,
  buildDirectDatabaseUrl,
  buildRuntimeDatabaseUrl,
  OFFICIAL_APP_URL,
  POOLER_SESSION_CONNECTION_LIMIT,
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

  const POOLER =
    'postgresql://postgres.proj:clave@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'

  it('pasa el pooler a Transaction mode en serverless', () => {
    const url = new URL(buildRuntimeDatabaseUrl(POOLER, { VERCEL: '1' }))

    expect(url.port).toBe('6543')
    expect(url.searchParams.get('pgbouncer')).toBe('true')
    expect(url.searchParams.get('connection_limit')).toBe('1')
    expect(url.searchParams.get('pool_timeout')).toBe('15')
    expect(url.searchParams.get('connect_timeout')).toBe('10')
  })

  it('no cambia el puerto fuera de serverless ni en hosts que no son el pooler', () => {
    expect(new URL(buildRuntimeDatabaseUrl(POOLER, {})).port).toBe('5432')
    expect(
      new URL(
        buildRuntimeDatabaseUrl('postgresql://u:p@db.proj.supabase.co:5432/postgres', {
          VERCEL: '1',
        }),
      ).port,
    ).toBe('5432')
  })

  /**
   * El `pool_size` del Session mode es 15 para todo el proyecto. Sin tope, el
   * default de Prisma (`num_cpus * 2 + 1`) hacía que un solo `npm run dev:api`
   * se llevara casi el cupo entero: migraciones, Studio y scripts recibían
   * `FATAL: (EMAXCONNSESSION)`, y cada conexión ociosa seguía costando un
   * backend de Postgres en una instancia de 1 GB.
   */
  it('acota el pool de los procesos de larga vida contra el pooler', () => {
    const url = new URL(buildRuntimeDatabaseUrl(POOLER, {}))

    expect(url.port).toBe('5432')
    expect(url.searchParams.get('connection_limit')).toBe(String(POOLER_SESSION_CONNECTION_LIMIT))
    expect(url.searchParams.get('pool_timeout')).toBe('15')
    // Session mode soporta prepared statements: desactivarlos sería perder
    // rendimiento sin motivo.
    expect(url.searchParams.get('pgbouncer')).toBeNull()
  })

  it('no toca el pool de una base que no pasa por el pooler', () => {
    const url = new URL(
      buildRuntimeDatabaseUrl('postgresql://u:p@db.proj.supabase.co:5432/postgres', {}),
    )

    expect(url.searchParams.get('connection_limit')).toBeNull()
    expect(url.searchParams.get('pool_timeout')).toBeNull()
  })

  it('las migraciones van sin los parámetros de pooling', () => {
    const url = new URL(buildDirectDatabaseUrl(buildRuntimeDatabaseUrl(POOLER, {})))

    expect(url.port).toBe('5432')
    expect(url.searchParams.get('connection_limit')).toBeNull()
    expect(url.searchParams.get('pool_timeout')).toBeNull()
  })

  // La DATABASE_URL puesta a mano en Vercel ganaba sobre la derivada y el
  // runtime quedaba sin pooling: es la configuracion que agota la base.
  it('corrige el pooling de una DATABASE_URL provista por el entorno', () => {
    const env = { VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: POOLER }

    applyDeploymentEnvironmentDefaults(env)

    const url = new URL(env.DATABASE_URL)
    expect(url.port).toBe('6543')
    expect(url.searchParams.get('connection_limit')).toBe('1')
    expect(url.hostname).toBe('aws-1-sa-east-1.pooler.supabase.com')
  })

  it('deja intacta una DATABASE_URL que no sabe interpretar', () => {
    const env = { VERCEL: '1', DATABASE_URL: 'no-es-una-url' }

    applyDeploymentEnvironmentDefaults(env)

    expect(env.DATABASE_URL).toBe('no-es-una-url')
  })
})
