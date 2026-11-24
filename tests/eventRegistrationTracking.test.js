import { describe, expect, it } from 'vitest'
import {
  buildEventRegistrationRows,
  eventRegistrationCsvRows,
  eventRegistrationFacets,
  filterEventRegistrationRows,
  hasActiveTrackingFilters,
  summarizeEventRegistrations,
} from '../src/services/eventRegistrationTracking.js'

const event = { id: 'evt-1', slug: 'copa-norte-2026', title: 'Copa Norte', slots: 40 }

const athletes = [
  { id: 'a1', fullName: 'Ana Pérez', documentId: '30111222', email: 'ana@plu.test' },
  { id: 'a2', fullName: 'Bruno Díaz', documentId: '30222333', email: 'bruno@plu.test' },
  { id: 'a3', fullName: '=HYPERLINK("x")', documentId: '30333444', email: 'c@plu.test' },
  { id: 'a4', fullName: 'Dana Ruiz', documentId: '30444555', email: 'dana@plu.test' },
]

const registrations = [
  {
    id: 'r1',
    athleteId: 'a1',
    eventSlug: event.slug,
    category: 'Raw',
    division: 'Masters',
    secondaryDivision: 'Open',
    modalities: ['full_power', 'bench'],
    status: 'confirmada',
    paymentOrderId: 'o1',
    createdAt: '2026-10-01T12:00:00Z',
  },
  {
    id: 'r2',
    athleteId: 'a2',
    eventSlug: event.slug,
    category: 'Raw',
    division: 'Open',
    secondaryDivision: '',
    modalities: ['full_power'],
    status: 'pendiente_pago',
    paymentOrderId: 'o2',
  },
  {
    id: 'r3',
    athleteId: 'a3',
    eventSlug: event.slug,
    category: 'Equipped',
    division: 'Junior',
    secondaryDivision: 'Open',
    modalities: ['push_pull'],
    status: 'validacion_manual',
    paymentOrderId: 'o3',
  },
  {
    id: 'r4',
    athleteId: 'a4',
    eventSlug: event.slug,
    category: 'Raw',
    division: 'Open',
    modalities: ['full_power'],
    status: 'cancelada',
    paymentOrderId: 'o4',
  },
  // Otro evento: no entra.
  {
    id: 'r5',
    athleteId: 'a1',
    eventSlug: 'otro',
    category: 'Raw',
    division: 'Open',
    status: 'confirmada',
  },
]

const payments = [
  { id: 'o1', athleteId: 'a1', amount: 90000, status: 'aprobado', method: 'mercado_pago' },
  { id: 'o2', athleteId: 'a2', amount: 60000, status: 'pendiente', method: 'mercado_pago' },
  {
    id: 'o3',
    athleteId: 'a3',
    amount: 135,
    currency: 'USD',
    status: 'validacion_manual',
    method: 'manual_link',
    manualPaymentChannel: 'wise_transfer',
  },
  {
    id: 'o4',
    athleteId: 'a4',
    amount: 60000,
    status: 'cancelado',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
  },
]

const rows = buildEventRegistrationRows({ registrations, athletes, payments, event })

describe('filas del evento', () => {
  it('solo las de este evento, con su atleta, orden, medio e importe', () => {
    expect(rows.map((row) => row.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(rows[0]).toMatchObject({
      athlete: { fullName: 'Ana Pérez' },
      channel: 'mercado_pago',
      amount: 90000,
      currency: 'ARS',
    })
    expect(rows[2]).toMatchObject({ channel: 'wise_transfer', currency: 'USD', amount: 135 })
  })

  it('sin evento no hay filas', () => {
    expect(buildEventRegistrationRows({ registrations, athletes, payments, event: null })).toEqual(
      [],
    )
  })
})

describe('resumen', () => {
  it('cuenta vigentes y estados, y suma cobrado y pendiente por moneda', () => {
    expect(summarizeEventRegistrations(rows, event)).toEqual({
      active: 3,
      confirmed: 1,
      pending: 2,
      observed: 0,
      cancelled: 1,
      capacity: 40,
      collected: { ARS: 90000 },
      outstanding: { ARS: 60000, USD: 135 },
    })
  })

  it('sin cupo cargado no inventa uno', () => {
    expect(summarizeEventRegistrations(rows, { ...event, slots: null }).capacity).toBeNull()
  })
})

describe('conteos para filtrar', () => {
  it('quien compite en dos divisiones cuenta en las dos; las canceladas no cuentan', () => {
    const facets = eventRegistrationFacets(rows)
    expect(Object.fromEntries(facets.divisions)).toEqual({ Open: 3, Masters: 1, Junior: 1 })
    expect(facets.secondDivision).toBe(2)
    expect(Object.fromEntries(facets.categories)).toEqual({ Raw: 2, Equipped: 1 })
    // Orden del catálogo: Full Power primero.
    expect(facets.modalities).toEqual([
      ['full_power', 2],
      ['push_pull', 1],
      ['bench', 1],
    ])
    expect(Object.fromEntries(facets.channels)).toEqual({ mercado_pago: 2, wise_transfer: 1 })
  })
})

describe('filtro combinado', () => {
  const ids = (list) => list.map((row) => row.id)

  it('división incluye la segunda; categoría, modalidad y medio se combinan', () => {
    expect(ids(filterEventRegistrationRows(rows, { division: 'Open' }))).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
    ])
    expect(ids(filterEventRegistrationRows(rows, { division: 'Masters' }))).toEqual(['r1'])
    expect(
      ids(
        filterEventRegistrationRows(rows, {
          category: 'Raw',
          modality: 'full_power',
          channel: 'mercado_pago',
        }),
      ),
    ).toEqual(['r1', 'r2'])
  })

  it('el estado mira inscripción y pago', () => {
    expect(ids(filterEventRegistrationRows(rows, { status: 'aprobado' }))).toEqual(['r1'])
    expect(ids(filterEventRegistrationRows(rows, { status: 'validacion_manual' }))).toEqual(['r3'])
  })

  it('la búsqueda ignora tildes y encuentra por DNI', () => {
    expect(ids(filterEventRegistrationRows(rows, { query: 'perez' }))).toEqual(['r1'])
    expect(ids(filterEventRegistrationRows(rows, { query: '30222' }))).toEqual(['r2'])
  })

  it('sabe si hay algún filtro puesto', () => {
    expect(hasActiveTrackingFilters({})).toBe(false)
    expect(hasActiveTrackingFilters({ query: '  ' })).toBe(false)
    expect(hasActiveTrackingFilters({ division: 'Open' })).toBe(true)
  })
})

describe('CSV', () => {
  const labels = {
    athlete: 'Atleta',
    document: 'DNI',
    email: 'Email',
    category: 'Categoría',
    division: 'División',
    secondaryDivision: 'Segunda división',
    modalities: 'Modalidad',
    status: 'Estado',
    channel: 'Medio',
    amount: 'Importe',
    currency: 'Moneda',
    paymentStatus: 'Pago',
    createdAt: 'Fecha',
  }
  const format = {
    status: (value) => `s:${value}`,
    modality: (value) => `m:${value}`,
    channel: (value) => `c:${value}`,
  }

  it('una fila por inscripción con divisiones, modalidades, medio e importe', () => {
    const [first] = eventRegistrationCsvRows(rows, { labels, format })
    expect(first).toEqual({
      Atleta: 'Ana Pérez',
      DNI: '30111222',
      Email: 'ana@plu.test',
      Categoría: 'Raw',
      División: 'Masters',
      'Segunda división': 'Open',
      Modalidad: 'm:full_power + m:bench',
      Estado: 's:confirmada',
      Medio: 'c:mercado_pago',
      Importe: 90000,
      Moneda: 'ARS',
      Pago: 's:aprobado',
      Fecha: '2026-10-01',
    })
  })

  it('neutraliza celdas que Excel ejecutaría como fórmula', () => {
    const csv = eventRegistrationCsvRows(rows, { labels, format })
    expect(csv[2].Atleta).toBe(`'=HYPERLINK("x")`)
  })
})
