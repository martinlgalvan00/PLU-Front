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
    expect(config.rewrites).toContainEqual({
      source: '/map-tiles/:path*',
      destination: 'https://tiles.openfreemap.org/:path*',
    })
    expect(config.rewrites).toContainEqual({
      source: '/api/:path*',
      destination: '/api/index',
    })
    const apiIndex = config.rewrites.findIndex((rule) => rule.source === '/api/:path*')
    const spaIndex = config.rewrites.findIndex((rule) => rule.destination === '/index.html')
    expect(apiIndex).toBeGreaterThanOrEqual(0)
    expect(spaIndex).toBeGreaterThan(apiIndex)
    expect(config.rewrites.at(-1)).toEqual({
      source: '/((?!api(?:/|$)|map-tiles(?:/|$)).*)',
      destination: '/index.html',
    })
  })

  // La función corría en iad1 (default de Vercel) contra una base en
  // sa-east-1: cada consulta cruzaba el continente dos veces y el handshake de
  // una instancia nueva llegaba a pasarse del connect_timeout de Prisma.
  it('ejecuta la función en la región de la base', () => {
    expect(config.regions).toEqual(['gru1'])
  })

  it('programa como máximo una ejecución diaria por job para Vercel Hobby', () => {
    expect(config.crons).toEqual([
      { path: '/api/internal/jobs/email-dispatch', schedule: '0 2 * * *' },
      { path: '/api/internal/jobs/payment-recovery', schedule: '15 2 * * *' },
      { path: '/api/internal/jobs/membership-renewal', schedule: '30 2 * * *' },
      { path: '/api/internal/jobs/security-user-lifecycle', schedule: '45 2 * * *' },
      { path: '/api/internal/jobs/payment-revalidation', schedule: '0 3 * * *' },
      { path: '/api/internal/jobs/payment-order-expiry', schedule: '15 3 * * *' },
      { path: '/api/internal/jobs/payment-proof-retention', schedule: '30 3 * * *' },
    ])
  })

  it('deshabilita las cuentas demo salvo opt-in explícito', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')
    expect(source).toContain("VITE_DEMO_MODE === 'true'")
    expect(source).toContain("const apiUrl = import.meta.env.PROD ? ''")
  })
})
