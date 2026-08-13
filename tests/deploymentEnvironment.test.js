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

  it('en produccion no deja que APP_URL local contamine los emails', () => {
    expect(
      resolveDeploymentAppUrl({
        APP_PRODUCTION: 'true',
        APP_URL: 'http://localhost:5173',
      }),
    ).toBe(OFFICIAL_APP_URL)
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
