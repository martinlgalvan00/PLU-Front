import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { auditFingerprint } from '../server/modules/audit/operationalAuditWriter.js'
import { buildIncidentRow, mapIncident } from '../server/modules/checkin/incidents.js'
import { summarizeScanTrail } from '../server/modules/checkin/scanTrail.js'
import { readSessionFromRequest } from '../server/services/sessionService.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

vi.mock('../server/services/sessionService.js', () => ({
  readSessionFromRequest: vi.fn(),
  extendSessionIfActive: vi.fn(),
}))

const EVENT_ID = 'a1111111-1111-4111-8111-111111111111'
const OTHER_EVENT_ID = 'b2222222-2222-4222-8222-222222222222'
const TICKET_ID = 'c3333333-3333-4333-8333-333333333333'
const INCIDENT_ID = 'd4444444-4444-4444-8444-444444444444'
const TOKEN = 'qr_secret_token_123'

function session(permissions, overrides = {}) {
  return {
    user: {
      id: 'staff-1',
      email: 'staff@plu.test',
      permissions,
      ...overrides,
    },
  }
}

const gateSession = (overrides) => session(['admin.checkin.execute'], overrides)
const auditSession = (overrides) =>
  session(['admin.checkin.execute', 'admin.audit.read'], overrides)

/** Cliente Supabase de mentira para la lectura del rastro: registra los filtros. */
function trailClient(rows) {
  const calls = { table: null, filters: [] }
  const chain = {
    select: () => chain,
    eq: (column, value) => {
      calls.filters.push([column, value])
      return chain
    },
    order: () => chain,
    limit: async () => ({ data: rows, error: null }),
  }
  return {
    calls,
    client: {
      from(table) {
        calls.table = table
        return chain
      },
    },
  }
}

function buildApp({ ticketRepository, supabaseAdmin, checkinIncidentRepository } = {}) {
  return createApp({
    prisma: {},
    supabaseAdmin,
    checkinIncidentRepository,
    ticketRepository: {
      resolveEventIdBySlug: async () => EVENT_ID,
      resolveTicketByQrToken: async () => null,
      ...ticketRepository,
    },
    env: { ...process.env, NODE_ENV: 'test' },
  })
}

async function request(server, method, path, body) {
  return fetch(`${server.url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      'X-PLU-Request': 'browser',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('summarizeScanTrail', () => {
  it('sin escaneos previos devuelve un resumen vacío', () => {
    expect(summarizeScanTrail([])).toEqual({
      scans: 0,
      firstAdmission: null,
      rejections: 0,
      rejectionsAfterAdmission: 0,
      lastRejectedAt: null,
      lastRejectedOutcome: null,
      gates: [],
    })
  })

  it('un QR ya ingresado dice cuándo y por dónde, y cuenta los rechazos posteriores', () => {
    const summary = summarizeScanTrail([
      { outcome: 'checked_in', scanned_at: '2026-12-11T14:10:00Z', gate: 'Puerta' },
      { outcome: 'already_used', scanned_at: '2026-12-11T14:40:00Z', gate: 'Pesaje' },
      { outcome: 'already_used', scanned_at: '2026-12-11T15:00:00Z', gate: 'Puerta' },
    ])
    expect(summary.firstAdmission).toEqual({ scannedAt: '2026-12-11T14:10:00Z', gate: 'Puerta' })
    expect(summary.rejections).toBe(2)
    expect(summary.rejectionsAfterAdmission).toBe(2)
    expect(summary.lastRejectedAt).toBe('2026-12-11T15:00:00Z')
    expect(summary.lastRejectedOutcome).toBe('already_used')
    expect(summary.gates.sort()).toEqual(['Pesaje', 'Puerta'])
  })

  it('los rechazos previos al ingreso no cuentan como repetición', () => {
    const summary = summarizeScanTrail([
      { outcome: 'not_yet_valid', scanned_at: '2026-12-11T08:00:00Z', gate: 'Puerta' },
      { outcome: 'checked_in', scanned_at: '2026-12-11T09:00:00Z', gate: 'Puerta' },
    ])
    expect(summary.rejections).toBe(1)
    expect(summary.rejectionsAfterAdmission).toBe(0)
  })

  it('una lectura "ready" no es rechazo ni ingreso', () => {
    const summary = summarizeScanTrail([
      { outcome: 'ready', scanned_at: '2026-12-11T09:00:00Z', gate: 'Puerta' },
    ])
    expect(summary.rejections).toBe(0)
    expect(summary.firstAdmission).toBeNull()
    expect(summary.scans).toBe(1)
  })

  it('no depende del orden en que llegan las filas', () => {
    const summary = summarizeScanTrail([
      { outcome: 'already_used', scanned_at: '2026-12-11T15:00:00Z', gate: 'Puerta' },
      { outcome: 'checked_in', scanned_at: '2026-12-11T14:10:00Z', gate: 'Puerta' },
    ])
    expect(summary.rejectionsAfterAdmission).toBe(1)
  })
})

describe('buildIncidentRow', () => {
  const base = { eventId: EVENT_ID, kind: 'duplicate_qr', reportedBy: 'staff-1:staff@plu.test' }

  it('rechaza tipos desconocidos y partes sin autor o evento', () => {
    expect(buildIncidentRow({ ...base, kind: 'inventado' })).toBeNull()
    expect(buildIncidentRow({ ...base, reportedBy: '' })).toBeNull()
    expect(buildIncidentRow({ ...base, eventId: null })).toBeNull()
  })

  it('guarda el fingerprint del QR, nunca el token crudo', () => {
    const row = buildIncidentRow({ ...base, qrToken: TOKEN })
    expect(row.qr_fingerprint).toBe(auditFingerprint(TOKEN))
    expect(JSON.stringify(row)).not.toContain(TOKEN)
  })

  it('recorta la nota y la deja nula si queda vacía', () => {
    expect(buildIncidentRow({ ...base, note: '  ' }).note).toBeNull()
    expect(buildIncidentRow({ ...base, note: 'x'.repeat(500) }).note).toHaveLength(300)
  })
})

describe('mapIncident', () => {
  it('muestra el email de quien reportó y no el id interno', () => {
    const incident = mapIncident({
      id: INCIDENT_ID,
      kind: 'other',
      status: 'open',
      reported_by: 'staff-1:staff@plu.test',
      reported_at: '2026-12-11T14:10:00Z',
    })
    expect(incident.reportedBy).toBe('staff@plu.test')
    expect(incident.resolvedBy).toBeNull()
  })
})

describe('POST /api/tickets/checkin/trail', () => {
  it('busca por fingerprint dentro del evento y nunca expone actor ni dispositivo', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession())
    const { client, calls } = trailClient([
      { outcome: 'checked_in', scanned_at: '2026-12-11T14:10:00Z', gate: 'Puerta', zone_scope: 'x' },
    ])
    const server = listen(buildApp({ supabaseAdmin: client }))
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/trail', {
        eventSlug: 'pitbull-classic',
        qrToken: TOKEN,
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.trail.firstAdmission.gate).toBe('Puerta')
      expect(JSON.stringify(body)).not.toMatch(/actor|device|dni/i)
      expect(calls.table).toBe('checkin_scan_events')
      expect(calls.filters).toContainEqual(['event_id', EVENT_ID])
      expect(calls.filters).toContainEqual(['qr_fingerprint', auditFingerprint(TOKEN)])
      expect(JSON.stringify(calls.filters)).not.toContain(TOKEN)
    } finally {
      server.close()
    }
  })

  it('exige el permiso de check-in', async () => {
    readSessionFromRequest.mockResolvedValue(session(['admin.events.read']))
    const server = listen(buildApp({ supabaseAdmin: trailClient([]).client }))
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/trail', {
        eventSlug: 'pitbull-classic',
        qrToken: TOKEN,
      })
      expect(response.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('una cuenta acotada a otro evento no puede consultar el rastro', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession({ eventSlug: 'otro-evento' }))
    const server = listen(buildApp({ supabaseAdmin: trailClient([]).client }))
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/trail', {
        eventSlug: 'pitbull-classic',
        qrToken: TOKEN,
      })
      expect(response.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('rechaza un cuerpo sin token', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession())
    const server = listen(buildApp({ supabaseAdmin: trailClient([]).client }))
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/trail', {
        eventSlug: 'pitbull-classic',
      })
      expect(response.status).toBe(400)
    } finally {
      server.close()
    }
  })
})

describe('POST /api/tickets/checkin/incidents', () => {
  function incidentSpy() {
    const reports = []
    return {
      reports,
      repository: {
        report: vi.fn(async (input) => {
          reports.push(input)
          return { id: INCIDENT_ID, kind: input.kind, status: 'open' }
        }),
      },
    }
  }

  it('toma puesto y autor de la cuenta, no del cuerpo', async () => {
    readSessionFromRequest.mockResolvedValue(
      gateSession({ securityZone: { id: 'z1', name: 'Puerta norte', scope: 'gate_tickets' } }),
    )
    const spy = incidentSpy()
    const server = listen(
      buildApp({
        checkinIncidentRepository: spy.repository,
        ticketRepository: {
          resolveTicketByQrToken: async () => ({ id: TICKET_ID, event_id: EVENT_ID }),
        },
      }),
    )
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/incidents', {
        eventSlug: 'pitbull-classic',
        kind: 'duplicate_qr',
        note: 'Mostró el mismo QR desde otro celular',
        qrToken: TOKEN,
        // Superficie de envenenamiento: nada de esto debe llegar al repositorio.
        gate: 'Puerta inventada',
        reportedBy: 'otra-persona',
        eventId: OTHER_EVENT_ID,
      })
      expect(response.status).toBe(201)
      const [input] = spy.reports
      expect(input.eventId).toBe(EVENT_ID)
      expect(input.gate).toBe('Puerta norte')
      expect(input.reportedBy).toBe('staff-1:staff@plu.test')
      expect(input.ticketId).toBe(TICKET_ID)
      expect(input.kind).toBe('duplicate_qr')
    } finally {
      server.close()
    }
  })

  it('un token de otro evento no cuelga el parte de esa entrada', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession())
    const spy = incidentSpy()
    const server = listen(
      buildApp({
        checkinIncidentRepository: spy.repository,
        ticketRepository: {
          resolveTicketByQrToken: async () => ({ id: TICKET_ID, event_id: OTHER_EVENT_ID }),
        },
      }),
    )
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/incidents', {
        eventSlug: 'pitbull-classic',
        kind: 'other',
        qrToken: TOKEN,
      })
      expect(response.status).toBe(201)
      expect(spy.reports[0].ticketId).toBeNull()
    } finally {
      server.close()
    }
  })

  it('rechaza un tipo de incidente inventado', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession())
    const spy = incidentSpy()
    const server = listen(buildApp({ checkinIncidentRepository: spy.repository }))
    try {
      const response = await request(server, 'POST', '/api/tickets/checkin/incidents', {
        eventSlug: 'pitbull-classic',
        kind: 'cualquiera',
      })
      expect(response.status).toBe(400)
      expect(spy.reports).toHaveLength(0)
    } finally {
      server.close()
    }
  })
})

describe('GET y resolución de incidentes (panel)', () => {
  it('listar exige admin.audit.read: el staff de puerta no ve el parte', async () => {
    readSessionFromRequest.mockResolvedValue(gateSession())
    const server = listen(
      buildApp({ checkinIncidentRepository: { listForEvent: async () => [] } }),
    )
    try {
      const response = await request(
        server,
        'GET',
        '/api/tickets/checkin/incidents/pitbull-classic',
      )
      expect(response.status).toBe(403)
    } finally {
      server.close()
    }
  })

  it('lista los incidentes abiertos del evento', async () => {
    readSessionFromRequest.mockResolvedValue(auditSession())
    const listForEvent = vi.fn(async () => [{ id: INCIDENT_ID, kind: 'other', status: 'open' }])
    const server = listen(buildApp({ checkinIncidentRepository: { listForEvent } }))
    try {
      const response = await request(
        server,
        'GET',
        '/api/tickets/checkin/incidents/pitbull-classic?status=open',
      )
      expect(response.status).toBe(200)
      expect((await response.json()).incidents).toHaveLength(1)
      expect(listForEvent).toHaveBeenCalledWith(EVENT_ID, { status: 'open' })
    } finally {
      server.close()
    }
  })

  it('cerrar un incidente exige poder editar eventos y registra quién lo cerró', async () => {
    const resolve = vi.fn(async () => ({ id: INCIDENT_ID, status: 'resolved' }))

    readSessionFromRequest.mockResolvedValue(auditSession())
    let server = listen(buildApp({ checkinIncidentRepository: { resolve } }))
    try {
      const denied = await request(
        server,
        'POST',
        `/api/tickets/checkin/incidents/pitbull-classic/${INCIDENT_ID}/resolve`,
        {},
      )
      expect(denied.status).toBe(403)
    } finally {
      server.close()
    }

    readSessionFromRequest.mockResolvedValue(
      session(['admin.checkin.execute', 'admin.events.write']),
    )
    server = listen(buildApp({ checkinIncidentRepository: { resolve } }))
    try {
      const ok = await request(
        server,
        'POST',
        `/api/tickets/checkin/incidents/pitbull-classic/${INCIDENT_ID}/resolve`,
        { resolutionNote: 'Era el mismo comprador' },
      )
      expect(ok.status).toBe(200)
      expect(resolve).toHaveBeenCalledWith(EVENT_ID, INCIDENT_ID, {
        resolvedBy: 'staff-1:staff@plu.test',
        resolutionNote: 'Era el mismo comprador',
      })
    } finally {
      server.close()
    }
  })

  it('un id de incidente que no es uuid es un 400, no un 500', async () => {
    readSessionFromRequest.mockResolvedValue(
      session(['admin.checkin.execute', 'admin.events.write']),
    )
    const server = listen(buildApp({ checkinIncidentRepository: { resolve: vi.fn() } }))
    try {
      const response = await request(
        server,
        'POST',
        '/api/tickets/checkin/incidents/pitbull-classic/no-es-uuid/resolve',
        {},
      )
      expect(response.status).toBe(400)
    } finally {
      server.close()
    }
  })
})
