import { describe, expect, it } from 'vitest'
import {
  createSecurityTeamMember,
  formatSecurityAccessList,
  parseSecurityTeamImport,
  validateSecurityTeamMembers,
} from '../src/services/securityTeamService.js'

describe('securityTeamService', () => {
  it('valida y normaliza un equipo antes de enviarlo a la API', () => {
    const result = validateSecurityTeamMembers([
      createSecurityTeamMember('1', { name: ' Ana Pérez ', email: ' ANA@EMPRESA.COM ' }),
      createSecurityTeamMember('2', { name: 'Juan López', email: 'juan@empresa.com' }),
    ])

    expect(result.isValid).toBe(true)
    expect(result.members).toEqual([
      { name: 'Ana Pérez', email: 'ana@empresa.com' },
      { name: 'Juan López', email: 'juan@empresa.com' },
    ])
  })

  it('detecta emails repetidos dentro del mismo equipo', () => {
    const result = validateSecurityTeamMembers([
      createSecurityTeamMember('1', { name: 'Ana Pérez', email: 'ana@empresa.com' }),
      createSecurityTeamMember('2', { name: 'Otra Ana', email: 'ANA@EMPRESA.COM' }),
    ])

    expect(result.isValid).toBe(false)
    expect(result.errors['2'].email).toBe('duplicate')
  })

  it('importa filas separadas por coma, punto y coma o tabulación', () => {
    const result = parseSecurityTeamImport(
      'Ana Pérez, ana@empresa.com\njuan@empresa.com\nMaría López; maria@empresa.com\nPedro Gómez\tpedro@empresa.com',
    )

    expect(result.invalid).toEqual([])
    expect(result.members).toHaveLength(4)
    expect(result.members[1]).toEqual({ name: 'Juan', email: 'juan@empresa.com' })
  })

  it('informa la línea que no contiene un email reconocible', () => {
    const result = parseSecurityTeamImport('Ana Pérez, ana@empresa.com\nEsta fila no tiene email')

    expect(result.members).toHaveLength(1)
    expect(result.invalid).toEqual([{ line: 2, value: 'Esta fila no tiene email' }])
  })

  it('prepara una lista legible de links personales para compartir', () => {
    const text = formatSecurityAccessList([
      { user: { name: 'Ana Pérez', email: 'ana@empresa.com' }, accessUrl: 'https://plu.test/acceso/ana' },
      { user: { name: 'Juan López', email: 'juan@empresa.com' }, accessUrl: 'https://plu.test/acceso/juan' },
    ])

    expect(text).toContain('Ana Pérez · ana@empresa.com\nhttps://plu.test/acceso/ana')
    expect(text).toContain('Juan López · juan@empresa.com\nhttps://plu.test/acceso/juan')
  })
})
