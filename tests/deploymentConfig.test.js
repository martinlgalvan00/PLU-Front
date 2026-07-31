import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vercel deployment contract', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))

  it('despliega únicamente las ramas estables', () => {
    expect(config.git.deploymentEnabled).toEqual({
      main: true,
      dev: true,
      '*': false,
    })
  })

  it('mantiene una sola función Express y enruta /api antes del fallback SPA', () => {
    expect(Object.keys(config.functions)).toEqual(['api/index.js'])
    expect(config.rewrites[0]).toEqual({
      source: '/api/:path*',
      destination: '/api/index',
    })
    expect(config.rewrites.at(-1).destination).toBe('/index.html')
  })

  it('programa como máximo una ejecución diaria por job para Vercel Hobby', () => {
    expect(config.crons).toEqual([
      { path: '/api/internal/jobs/email-dispatch', schedule: '0 2 * * *' },
      { path: '/api/internal/jobs/payment-recovery', schedule: '15 2 * * *' },
      { path: '/api/internal/jobs/membership-renewal', schedule: '30 2 * * *' },
      { path: '/api/internal/jobs/security-user-lifecycle', schedule: '45 2 * * *' },
    ])
  })

  it('deshabilita las cuentas demo salvo opt-in explícito', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    expect(source).toContain("VITE_DEMO_MODE === 'true'")
    expect(source).toContain("const apiUrl = import.meta.env.PROD ? ''")
  })
})
