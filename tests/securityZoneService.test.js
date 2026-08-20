import { describe, expect, it } from 'vitest'
import {
  ZONE_SCOPES,
  buildZonePayload,
  buildZoneTeamSummary,
  canZoneScanCredential,
  createZoneForm,
  formatZoneShift,
  getMemberInitials,
  getZoneScopeCredentials,
  groupSecurityTeamByZone,
  isValidZoneScope,
  validateZoneForm,
} from '../src/services/securityZoneService.js'

/** `t` de fixture: devuelve la clave con las variables ya interpoladas. */
function t(key, vars = {}) {
  const suffix = Object.entries(vars)
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
  return suffix ? `${key}(${suffix})` : key
}

const ZONES = [
  { id: 'z-gate', name: 'Puerta principal', scope: 'gate_tickets', sortOrder: 0 },
  { id: 'z-weighin', name: 'Pesaje', scope: 'athletes_only', sortOrder: 1 },
  { id: 'z-platform', name: 'Plataforma', scope: 'staff_only', sortOrder: 2 },
]

const USERS = [
  { id: 'u-1', name: 'Camila Vera', email: 'camila@segur.com', status: 'active', securityZoneId: 'z-gate' },
  { id: 'u-2', name: 'Sergio Barrios', email: 's.barrios@segur.com', status: 'invited', securityZoneId: 'z-gate' },
  { id: 'u-3', name: 'Tomás Aguirre', email: 't.aguirre@segur.com', status: 'active', securityZoneId: 'z-weighin' },
  { id: 'u-4', name: 'Nadia Rossi', email: 'nadia@segur.com', status: 'invited', securityZoneId: null },
]

describe('securityZoneService — alcance de escaneo', () => {
  it('la puerta es el único alcance que abre entradas de público', () => {
    expect(canZoneScanCredential('gate_tickets', 'ticket')).toBe(true)

    for (const scope of ZONE_SCOPES.filter((value) => value !== 'gate_tickets')) {
      expect(canZoneScanCredential(scope, 'ticket')).toBe(false)
    }
  })

  it('pesaje lee inscripciones pero no credenciales de afiliación', () => {
    expect(canZoneScanCredential('athletes_only', 'registration')).toBe(true)
    expect(canZoneScanCredential('athletes_only', 'membership')).toBe(false)
  })

  it('staff técnico no escanea nada: es control interno', () => {
    expect(getZoneScopeCredentials('staff_only')).toEqual([])
  })

  it('un alcance desconocido no habilita nada en lugar de fallar', () => {
    expect(isValidZoneScope('cualquier_cosa')).toBe(false)
    expect(getZoneScopeCredentials('cualquier_cosa')).toEqual([])
    expect(canZoneScanCredential(undefined, 'ticket')).toBe(false)
  })
})

describe('securityZoneService — reparto del equipo', () => {
  it('agrupa por zona y deja aparte a quien no tiene puesto', () => {
    const grouped = groupSecurityTeamByZone(ZONES, USERS)

    expect(grouped.zones.map((zone) => zone.members.map((member) => member.id))).toEqual([
      ['u-1', 'u-2'],
      ['u-3'],
      [],
    ])
    expect(grouped.unassigned.map((member) => member.id)).toEqual(['u-4'])
  })

  it('cuenta activas por zona: una cuenta sin activar no cubre el puesto', () => {
    const grouped = groupSecurityTeamByZone(ZONES, USERS)

    expect(grouped.zones[0].members).toHaveLength(2)
    expect(grouped.zones[0].activeCount).toBe(1)
  })

  it('una cuenta asignada a una zona que ya no existe cae en sin asignar, no se pierde', () => {
    const grouped = groupSecurityTeamByZone(
      [ZONES[0]],
      [{ id: 'u-9', name: 'Huérfano', email: 'h@segur.com', status: 'active', securityZoneId: 'z-borrada' }],
    )

    expect(grouped.zones[0].members).toEqual([])
    expect(grouped.unassigned.map((member) => member.id)).toEqual(['u-9'])
  })

  it('resume el operativo incluyendo las zonas vacías', () => {
    const summary = buildZoneTeamSummary(groupSecurityTeamByZone(ZONES, USERS))

    expect(summary).toEqual({
      zoneCount: 3,
      memberCount: 4,
      activeCount: 2,
      unassignedCount: 1,
      emptyZoneCount: 1,
    })
  })
})

describe('securityZoneService — turno', () => {
  it('sin turno cargado dice que la zona cubre todo el evento', () => {
    expect(formatZoneShift({}, 'es', t)).toBe('admin.eventZones.shiftAllDay')
    expect(formatZoneShift(null, 'es', t)).toBe('admin.eventZones.shiftAllDay')
  })

  it('con inicio y fin el mismo día muestra el rango sin repetir el día', () => {
    const label = formatZoneShift(
      { shiftStart: '2026-03-14T11:00:00.000Z', shiftEnd: '2026-03-14T17:00:00.000Z' },
      'es',
      t,
    )

    expect(label).toContain('–')
    // El segundo extremo es solo hora: no vuelve a nombrar el día.
    expect(label.split('–')[1]).not.toMatch(/[a-z]{3}/i)
  })

  it('con un solo extremo lo dice como desde/hasta en vez de inventar el otro', () => {
    expect(formatZoneShift({ shiftStart: '2026-03-14T11:00:00.000Z' }, 'es', t)).toMatch(
      /^admin\.eventZones\.shiftFrom\(time=/,
    )
    expect(formatZoneShift({ shiftEnd: '2026-03-14T17:00:00.000Z' }, 'es', t)).toMatch(
      /^admin\.eventZones\.shiftUntil\(time=/,
    )
  })
})

describe('securityZoneService — formulario', () => {
  it('acepta una zona con nombre y alcance válidos', () => {
    expect(validateZoneForm({ name: 'Puerta', scope: 'gate_tickets' }).isValid).toBe(true)
  })

  it('rechaza nombre corto, alcance inválido y turno invertido', () => {
    expect(validateZoneForm({ name: 'P', scope: 'gate_tickets' }).errors.name).toBe('nameMin')
    expect(validateZoneForm({ name: 'x'.repeat(61), scope: 'gate_tickets' }).errors.name).toBe(
      'nameMax',
    )
    expect(validateZoneForm({ name: 'Puerta', scope: 'nope' }).errors.scope).toBe('scopeInvalid')
    expect(
      validateZoneForm({
        name: 'Puerta',
        scope: 'gate_tickets',
        shiftStart: '2026-03-14T14:00',
        shiftEnd: '2026-03-14T08:00',
      }).errors.shiftEnd,
    ).toBe('shiftOrder')
  })

  it('el payload normaliza el nombre y convierte turno vacío en null', () => {
    expect(buildZonePayload({ name: '  Pesaje  ', scope: 'athletes_only', shiftStart: '' })).toEqual({
      name: 'Pesaje',
      scope: 'athletes_only',
      shiftStart: null,
      shiftEnd: null,
    })
  })

  it('un alcance desconocido cae al de la puerta en lugar de guardarse roto', () => {
    expect(buildZonePayload({ name: 'Zona', scope: 'inventado' }).scope).toBe('gate_tickets')
  })

  it('el formulario de edición precarga la zona', () => {
    const form = createZoneForm({
      name: 'Pesaje',
      scope: 'athletes_only',
      shiftStart: '2026-03-14T10:00:00.000Z',
      shiftEnd: null,
    })

    expect(form.name).toBe('Pesaje')
    expect(form.scope).toBe('athletes_only')
    expect(form.shiftStart).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(form.shiftEnd).toBe('')
  })
})

describe('securityZoneService — iniciales', () => {
  it('usa nombre y apellido', () => {
    expect(getMemberInitials('Camila Vera')).toBe('CV')
  })

  it('sin apellido usa las dos primeras letras', () => {
    expect(getMemberInitials('Camila')).toBe('CA')
  })

  it('sin nombre cae al mail antes de mostrar un signo de pregunta', () => {
    expect(getMemberInitials('', 's.barrios@segur.com')).toBe('SB')
    expect(getMemberInitials('', '')).toBe('?')
  })
})
