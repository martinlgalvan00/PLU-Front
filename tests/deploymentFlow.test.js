import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const vercelConfig = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'))
const ciWorkflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')

describe('flujo de despliegue', () => {
  it('limita los deployments automaticos de Vercel a dev y main', () => {
    expect(vercelConfig.git.deploymentEnabled).toEqual({
      main: true,
      dev: true,
      '*': false,
    })
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/((?!api/).*)',
      destination: '/index.html',
    })
  })

  it('ejecuta CI en PRs hacia dev/main y evita trabajos obsoletos', () => {
    expect(ciWorkflow).toContain('branches: [dev, main]')
    expect(ciWorkflow).toContain('branches: [main]')
    expect(ciWorkflow).toContain('cancel-in-progress: true')
  })

  it('mantiene fija la version de Supabase usada por CI', () => {
    expect(ciWorkflow).toContain('version: 2.109.1')
    expect(ciWorkflow).not.toContain('version: latest')
  })
})
