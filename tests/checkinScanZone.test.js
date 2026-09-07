import { describe, expect, it } from 'vitest'
import {
  applyTicketZoneOutcome,
  canAdmitCheckinRow,
} from '../src/services/checkinScanService.js'

function ticketResult(scopes, outcome = 'ready') {
  return {
    kind: 'ticket',
    outcome,
    canCheckIn: outcome === 'ready',
    status: outcome === 'ready' ? 'pagada' : 'pendiente_pago',
    row: { credentialScopes: scopes, type: 'espectador', status: 'pagada' },
    ticket: { credentialScopes: scopes },
  }
}

describe('el escaneo aplica la zona antes de marcar ingreso', () => {
  it('un espectador en calentamiento no queda habilitado', () => {
    const result = applyTicketZoneOutcome(ticketResult(['gate_tickets']), 'athletes_coaches')
    expect(result.outcome).toBe('wrong_zone')
    expect(result.canCheckIn).toBe(false)
  })

  it('un entrenador en la puerta no queda habilitado', () => {
    const result = applyTicketZoneOutcome(ticketResult(['athletes_coaches']), 'gate_tickets')
    expect(result.outcome).toBe('wrong_zone')
    expect(result.canCheckIn).toBe(false)
  })

  it('no pisa un impago ni un ya usado', () => {
    expect(
      applyTicketZoneOutcome(ticketResult(['gate_tickets'], 'not_ready'), 'athletes_coaches')
        .outcome,
    ).toBe('not_ready')
    expect(
      applyTicketZoneOutcome(
        { ...ticketResult(['gate_tickets'], 'already_used'), canCheckIn: false },
        'athletes_coaches',
      ).outcome,
    ).toBe('already_used')
  })

  it('sin zona el escaneo sigue igual que antes', () => {
    const result = applyTicketZoneOutcome(ticketResult(['athletes_coaches']), null)
    expect(result.outcome).toBe('ready')
    expect(result.canCheckIn).toBe(true)
  })
})

describe('la lista no deja marcar ingreso fuera de zona', () => {
  const paidSpectator = {
    type: 'espectador',
    status: 'pagada',
    credentialScopes: ['gate_tickets'],
  }

  it('en calentamiento deshabilita la tribuna y deja pasar al entrenador', () => {
    expect(
      canAdmitCheckinRow(paidSpectator, { canCheckIn: true, zoneScope: 'athletes_coaches' }),
    ).toBe(false)
    expect(
      canAdmitCheckinRow(
        { ...paidSpectator, credentialScopes: ['athletes_coaches'] },
        { canCheckIn: true, zoneScope: 'athletes_coaches' },
      ),
    ).toBe(true)
  })

  it('un atleta pagado sigue pudiendo ingresar aunque el puesto filtre tickets', () => {
    expect(
      canAdmitCheckinRow(
        { type: 'atleta', status: 'pagada' },
        { canCheckIn: true, zoneScope: 'athletes_coaches' },
      ),
    ).toBe(true)
  })
})
