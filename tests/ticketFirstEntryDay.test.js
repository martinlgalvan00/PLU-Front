import { describe, expect, it } from 'vitest'
import { presentTicket } from '../server/modules/ticketing/accountTickets.js'
import {
  HOLDER_CREDENTIAL_STATE,
  holderCredentialState,
  holderMayShowQr,
} from '../src/lib/ticketHolderState.js'
import {
  TICKET_ACCESS_POLICY_MODE,
  firstEntryDayWindow,
  summarizeTicketQrValidity,
  ticketRequiresLiveDoor,
} from '../src/lib/ticketValidityPolicy.js'
import { pulseTurnstileIfAdmitted, shouldPulseTurnstile } from '../src/services/turnstileBridge.js'

const EVENT_DAYS = [
  { dayIndex: 0, label: 'Sábado', date: '2026-08-15' },
  { dayIndex: 1, label: 'Domingo', date: '2026-08-16' },
]

const SATURDAY_2350_ART = new Date('2026-08-16T02:50:00.000Z')
const SUNDAY_0001_ART = new Date('2026-08-16T03:01:00.000Z')

describe('día trabado del primer ingreso', () => {
  it('resume el modo cuando hay jornadas marcadas', () => {
    const summary = summarizeTicketQrValidity(
      {
        validityMode: TICKET_ACCESS_POLICY_MODE.FIRST_ENTRY_DAY,
        dayIndexes: [0, 1],
      },
      EVENT_DAYS,
    )

    expect(summary.kind).toBe('first_entry_day')
    expect(summary.dayCount).toBe(2)
  })

  it('traba el sábado 23:50 hasta la medianoche, no 24 horas después', () => {
    const window = firstEntryDayWindow(SATURDAY_2350_ART)

    expect(window).toMatchObject({
      day: '2026-08-15',
      key: 'event_day:2026-08-15',
    })
    expect(window.validFrom.toISOString()).toBe('2026-08-15T03:00:00.000Z')
    expect(window.validUntil.toISOString()).toBe('2026-08-16T03:00:00.000Z')
  })

  it('en el celular, el mismo día está usada y al día siguiente vencida', () => {
    const locked = {
      qr_validity_mode: 'first_entry_day',
      access_activated_at: SATURDAY_2350_ART.toISOString(),
    }

    expect(holderCredentialState(locked, new Date('2026-08-16T02:55:00.000Z'))).toBe(
      HOLDER_CREDENTIAL_STATE.USED,
    )
    expect(holderCredentialState(locked, SUNDAY_0001_ART)).toBe(HOLDER_CREDENTIAL_STATE.EXPIRED)
    expect(
      holderCredentialState({ qr_validity_mode: 'first_entry_day' }, SATURDAY_2350_ART),
    ).toBe(HOLDER_CREDENTIAL_STATE.LIVE)
    expect(holderMayShowQr(HOLDER_CREDENTIAL_STATE.USED)).toBe(false)
    expect(holderMayShowQr(HOLDER_CREDENTIAL_STATE.LIVE)).toBe(true)
  })

  it('la API pública esconde el QR usado o vencido y deja el código de puerta', () => {
    const base = {
      id: 'ticket-1',
      qr_token: 'secreto',
      gate_code: 'K4M-7QP',
      qr_validity_mode: 'first_entry_day',
      access_activated_at: SATURDAY_2350_ART.toISOString(),
      status: 'pagada',
    }

    const used = presentTicket(base, true, 0, new Date('2026-08-16T02:55:00.000Z'))
    const expired = presentTicket(base, true, 0, SUNDAY_0001_ART)
    const live = presentTicket(
      { ...base, access_activated_at: null },
      true,
      0,
      SATURDAY_2350_ART,
    )

    expect(used.qr_token).toBeNull()
    expect(used.gate_code).toBe('K4M-7QP')
    expect(used.credential_state).toBe('used')
    expect(expired.qr_token).toBeNull()
    expect(expired.gate_code).toBe('K4M-7QP')
    expect(expired.credential_state).toBe('expired')
    expect(live.qr_token).toBe('secreto')
    expect(live.credential_state).toBe('live')
  })

  it('no admite este modo con la fila offline', () => {
    expect(ticketRequiresLiveDoor({ validityMode: 'first_entry_day' })).toBe(true)
    expect(ticketRequiresLiveDoor({ validityMode: 'event_days' })).toBe(false)
  })
})

describe('molinete', () => {
  it('sólo pulsa cuando el servidor confirmó el ingreso', async () => {
    const calls = []
    const open = async () => {
      calls.push('open')
      return { opened: true }
    }

    expect(shouldPulseTurnstile('expired')).toBe(false)
    expect(shouldPulseTurnstile('already_used')).toBe(false)
    expect(shouldPulseTurnstile('wrong_zone')).toBe(false)
    expect(shouldPulseTurnstile('needs_online')).toBe(false)
    expect(shouldPulseTurnstile('queued_offline')).toBe(false)
    expect(shouldPulseTurnstile('checked_in')).toBe(true)

    await expect(pulseTurnstileIfAdmitted('expired', open)).resolves.toEqual({
      opened: false,
      reason: 'not_admitted',
    })
    await expect(pulseTurnstileIfAdmitted('checked_in', open)).resolves.toEqual({ opened: true })
    expect(calls).toEqual(['open'])
  })
})
