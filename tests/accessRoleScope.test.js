import { describe, expect, it } from 'vitest'
import {
  ACCESS_ROLE_SCOPE,
  isEventScopedRole,
  isEventScopedSession,
  resolveAccessRoleScope,
} from '../src/lib/permissions.js'

describe('AccessRole.scope', () => {
  it('prioriza la columna scope sobre la clave', () => {
    expect(resolveAccessRoleScope({ key: 'plu_arg', scope: 'event' })).toBe(
      ACCESS_ROLE_SCOPE.event,
    )
    expect(resolveAccessRoleScope({ key: 'organizador_evento', scope: 'global' })).toBe(
      ACCESS_ROLE_SCOPE.global,
    )
  })

  it('usa la clave legacy si no hay scope', () => {
    expect(resolveAccessRoleScope('organizador_evento')).toBe(ACCESS_ROLE_SCOPE.event)
    expect(resolveAccessRoleScope({ roleKey: 'organizador_evento' })).toBe(
      ACCESS_ROLE_SCOPE.event,
    )
    expect(resolveAccessRoleScope('plu_arg')).toBe(ACCESS_ROLE_SCOPE.global)
  })

  it('lee scope anidado en accessRole', () => {
    expect(
      resolveAccessRoleScope({
        role: 'operador_plu_arg',
        accessRole: { key: 'custom_ops', scope: 'event' },
      }),
    ).toBe(ACCESS_ROLE_SCOPE.event)
  })

  it('isEventScopedRole / Session respetan scope y flag de sesión', () => {
    expect(isEventScopedRole({ scope: 'event' })).toBe(true)
    expect(isEventScopedRole({ scope: 'global', key: 'organizador_evento' })).toBe(false)
    expect(isEventScopedSession({ eventScoped: true })).toBe(true)
    expect(isEventScopedSession({ roleKey: 'organizador_evento' })).toBe(true)
  })
})
