import { describe, expect, it } from 'vitest'
import {
  bulkUpdateUserRole,
  isBulkRoleTarget,
  mergeBulkRoleResults,
  summarizeBulkRoleResults,
} from '../src/services/userService.js'

const USERS = [
  { id: 'a', name: 'Ana', role: 'operador_plu_arg', roleKey: 'plu_arg' },
  { id: 'b', name: 'Beto', role: 'operador_plu_arg', roleKey: 'tesoreria' },
  { id: 'owner', name: 'Dueña', role: 'admin_maximal', roleKey: 'admin_maximal' },
  { id: 'gate', name: 'Puerta', role: 'seguridad_plu_arg', roleKey: 'seguridad_plu_arg' },
]

describe('cambio de rol en lote — servicio', () => {
  it('no ofrece al Super Admin ni a Seguridad como destino del lote', () => {
    expect(isBulkRoleTarget(USERS[0])).toBe(true)
    expect(isBulkRoleTarget(USERS[2])).toBe(false)
    expect(isBulkRoleTarget(USERS[3])).toBe(false)
    expect(isBulkRoleTarget(null)).toBe(false)
  })

  it('aplica sólo los resultados `updated` sobre el padrón', () => {
    const merged = mergeBulkRoleResults(USERS, [
      { userId: 'a', status: 'updated', user: { ...USERS[0], roleKey: 'tesoreria' } },
      { userId: 'b', status: 'failed', error: 'x' },
      { userId: 'owner', status: 'unchanged', user: { ...USERS[2], roleKey: 'otro' } },
    ])

    expect(merged[0].roleKey).toBe('tesoreria')
    expect(merged[1]).toBe(USERS[1])
    expect(merged[2]).toBe(USERS[2])
  })

  it('resume cuántas se actualizaron, cuántas ya lo tenían y cuáles fallaron', () => {
    expect(
      summarizeBulkRoleResults([
        { userId: 'a', status: 'updated' },
        { userId: 'b', status: 'unchanged' },
        { userId: 'c', status: 'failed', error: 'No existe.' },
        { userId: 'd', status: 'failed' },
      ]),
    ).toEqual({
      total: 4,
      updated: 1,
      unchanged: 1,
      failed: [
        { userId: 'c', error: 'No existe.' },
        { userId: 'd', error: '' },
      ],
    })
  })

  it('la sesión demo responde con el mismo contrato que el endpoint', () => {
    const { users, results } = bulkUpdateUserRole(
      USERS,
      ['a', 'b', 'owner', 'gate', 'fantasma'],
      'tesoreria',
    )

    expect(Object.fromEntries(results.map((item) => [item.userId, item.status]))).toEqual({
      a: 'updated',
      b: 'unchanged',
      owner: 'failed',
      gate: 'failed',
      fantasma: 'failed',
    })
    expect(users.find(({ id }) => id === 'a').roleKey).toBe('tesoreria')
    expect(users.find(({ id }) => id === 'owner').role).toBe('admin_maximal')
  })
})
