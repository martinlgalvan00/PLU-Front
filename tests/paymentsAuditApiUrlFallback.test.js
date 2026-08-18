import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('auditoria de cobros con origen unico', () => {
  it('no bloquea cuando API_URL falta y APP_URL resuelve sitio y API', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/payments-audit.mjs', '--offline', '--json'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PAYMENTS_MOCK: 'true',
          APP_URL: 'https://plu.example',
          API_URL: '',
          SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
    )

    expect(result.error).toBeUndefined()
    const report = JSON.parse(result.stdout)
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'ok',
          area: 'runtime',
          message: 'API_URL no esta definida: se usa APP_URL como origen de la API.',
        }),
      ]),
    )
    expect(report.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'blocker',
          message: expect.stringContaining('API_URL'),
        }),
      ]),
    )
  })
})
