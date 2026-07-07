import { describe, expect, it } from 'vitest'
import { loginSchema } from '../src/lib/schemas/auth.js'

describe('loginSchema', () => {
  it('normaliza email y conserva password', () => {
    const result = loginSchema.safeParse({
      email: ' ADMIN@PLUARG.COM ',
      password: 'clave-segura-123',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      email: 'admin@pluarg.com',
      password: 'clave-segura-123',
    })
  })

  it('rechaza email invalido y password corto', () => {
    const result = loginSchema.safeParse({
      email: 'no-es-email',
      password: '123',
    })

    expect(result.success).toBe(false)
    expect(result.error.flatten().fieldErrors.email[0]).toBe('Ingresá un correo válido.')
    expect(result.error.flatten().fieldErrors.password[0]).toBe('Ingresá una contraseña de al menos 8 caracteres.')
  })
})
