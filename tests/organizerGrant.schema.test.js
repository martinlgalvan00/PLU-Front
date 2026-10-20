import { describe, expect, it } from 'vitest'
import { bulkUserAccessRoleSchema, updateUserAccessRoleSchema } from '../src/lib/schemas/accessControl.js'
import { createStaffUserSchema } from '../src/lib/schemas/auth.js'

const EVENT_A = '11111111-1111-4111-8111-111111111111'
const EVENT_B = '22222222-2222-4222-8222-222222222222'

describe('alta de organizador con eventos', () => {
  it('exige al menos un eventId cuando el rol es organizador_evento', () => {
    const result = createStaffUserSchema.safeParse({
      name: 'Olga Organizadora',
      email: 'olga@plu.test',
      role: 'organizador_evento',
      eventIds: [],
    })
    expect(result.success).toBe(false)
    expect(result.error.issues.some((issue) => issue.path.includes('eventIds'))).toBe(true)
  })

  it('acepta el alta con eventos autorizados', () => {
    const result = createStaffUserSchema.safeParse({
      name: 'Olga Organizadora',
      email: 'olga@plu.test',
      role: 'organizador_evento',
      eventIds: [EVENT_A, EVENT_B, EVENT_A],
    })
    expect(result.success).toBe(true)
    expect(result.data.eventIds).toEqual([EVENT_A, EVENT_B])
  })

  it('no exige eventIds para otros roles', () => {
    const result = createStaffUserSchema.safeParse({
      name: 'Operador PLU',
      email: 'op@plu.test',
      role: 'plu_arg',
    })
    expect(result.success).toBe(true)
    expect(result.data.eventIds).toEqual([])
  })
})

describe('cambio de rol a organizador', () => {
  it('exige eventIds al pasar a organizador_evento', () => {
    const result = updateUserAccessRoleSchema.safeParse({ roleKey: 'organizador_evento' })
    expect(result.success).toBe(false)
  })

  it('acepta rol + eventos juntos', () => {
    const result = updateUserAccessRoleSchema.safeParse({
      roleKey: 'organizador_evento',
      eventIds: [EVENT_A],
    })
    expect(result.success).toBe(true)
  })

  it('el lote no admite Organizador', () => {
    const result = bulkUserAccessRoleSchema.safeParse({
      userIds: ['user-1'],
      roleKey: 'organizador_evento',
    })
    expect(result.success).toBe(false)
  })
})
