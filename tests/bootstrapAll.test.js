import { describe, expect, it } from 'vitest'
import {
  assertBrowserKeyIsPublic,
  buildPrismaDatabaseUrl,
  findMissingEnvironment,
  isRetryableSpawnError,
  parsePendingMigrations,
  REQUIRED_ENVIRONMENT,
  scrubSecrets,
  shouldSkipMigrations,
} from '../scripts/bootstrap-all.mjs'

describe('bootstrap all', () => {
  it('informa las variables obligatorias faltantes', () => {
    const env = Object.fromEntries(REQUIRED_ENVIRONMENT.map((key) => [key, 'configurado']))
    delete env.SUPABASE_DATABASE_URL

    expect(findMissingEnvironment(env)).toEqual(['SUPABASE_DATABASE_URL'])
  })

  it('extrae solamente las migraciones pendientes del dry-run', () => {
    const output = `
Would push these migrations:
 • 20260717140000_lexicon.sql
 • 20260717150000_featured.sql
`

    expect(parsePendingMigrations(output)).toEqual([
      '20260717140000_lexicon.sql',
      '20260717150000_featured.sql',
    ])
    expect(parsePendingMigrations('Remote database is up to date.')).toEqual([])
  })

  it('rechaza una secret key configurada para Vite', () => {
    expect(() => assertBrowserKeyIsPublic('sb_secret_no_debe_llegar_al_browser')).toThrow(
      /Secret API Key/,
    )
    expect(() => assertBrowserKeyIsPublic('sb_publishable_publica')).not.toThrow()
  })

  it('aísla Prisma en el schema remoto plu_prisma', () => {
    const result = buildPrismaDatabaseUrl(
      'postgresql://postgres.project:password@pooler.supabase.com:5432/postgres?sslmode=require',
    )

    expect(new URL(result).searchParams.get('schema')).toBe('plu_prisma')
    expect(() => buildPrismaDatabaseUrl('postgresql://user:pass@127.0.0.1:5433/local')).toThrow(
      /remoto de Supabase/,
    )
  })

  it('oculta connection strings en mensajes de error', () => {
    const scrubbed = scrubSecrets(
      'Falló: db push --db-url postgresql://postgres.project:secret@host:5432/postgres --dry-run',
    )
    expect(scrubbed).toContain('postgresql://***')
    expect(scrubbed).not.toContain('secret')
  })

  it('detecta fallos intermitentes de spawn del CLI', () => {
    expect(isRetryableSpawnError('EUNKNOWN: unknown error, uv_spawn')).toBe(true)
    expect(isRetryableSpawnError('Remote database is up to date.')).toBe(false)
  })

  it('interpreta BOOTSTRAP_SKIP_MIGRATIONS', () => {
    expect(shouldSkipMigrations({ BOOTSTRAP_SKIP_MIGRATIONS: '1' })).toBe(true)
    expect(shouldSkipMigrations({ BOOTSTRAP_SKIP_MIGRATIONS: 'true' })).toBe(true)
    expect(shouldSkipMigrations({ BOOTSTRAP_SKIP_MIGRATIONS: '' })).toBe(false)
  })
})
