import { describe, expect, it } from 'vitest'
import {
  createAuth0Config,
  createAuth0JwtCheck,
  requireAuth0Config,
} from '../server/modules/auth/auth0.js'

describe('auth0 infrastructure', () => {
  it('crea config Auth0 desde variables de entorno explicitas', () => {
    const config = createAuth0Config({
      AUTH0_DOMAIN: 'plu-dev.us.auth0.com',
      AUTH0_AUDIENCE: 'https://api.pluarg.com',
    })

    expect(config).toEqual({
      audience: 'https://api.pluarg.com',
      issuerBaseURL: 'https://plu-dev.us.auth0.com/',
      tokenSigningAlg: 'RS256',
    })
  })

  it('normaliza dominio aunque venga con protocolo y barra final', () => {
    const config = createAuth0Config({
      AUTH0_DOMAIN: 'https://plu-dev.us.auth0.com/',
      AUTH0_AUDIENCE: 'https://api.pluarg.com',
    })

    expect(config.issuerBaseURL).toBe('https://plu-dev.us.auth0.com/')
  })

  it('falla cerrado si falta configuracion Auth0', () => {
    expect(() => requireAuth0Config({})).toThrow('Auth0 no está configurado.')
  })

  it('permite inyectar el SDK Auth0 para proteger endpoints', () => {
    const calls = []
    const middleware = () => {}
    const sdkAuth = (config) => {
      calls.push(config)
      return middleware
    }

    const result = createAuth0JwtCheck({
      env: {
        AUTH0_DOMAIN: 'plu-dev.us.auth0.com',
        AUTH0_AUDIENCE: 'https://api.pluarg.com',
      },
      sdkAuth,
    })

    expect(result).toBe(middleware)
    expect(calls).toHaveLength(1)
    expect(calls[0].issuerBaseURL).toBe('https://plu-dev.us.auth0.com/')
  })
})
