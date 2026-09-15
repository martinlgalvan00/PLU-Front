import { describe, expect, it } from 'vitest'
import { eventSchema } from '../server/routes/events.js'
import { validateAdminEventDraft } from '../src/lib/schemas/adminEvent.js'

function validEvent(overrides = {}) {
  return {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    description: 'Fecha nacional de powerlifting.',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    startsAt: '2026-08-15T09:00',
    endsAt: '2026-08-15T20:00',
    status: 'proximamente',
    published: false,
    slots: 120,
    featured: true,
    pricing: {
      membership: 75000,
      registration: 75000,
      combo: 120000,
      ticketsEnabled: true,
      ticketAddons: [{ id: 'food', label: 'Comida', price: 12000 }],
    },
    eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
    ticketTypes: [
      {
        name: 'Pase general',
        price: 20000,
        quota: 100,
        dayIndexes: [0],
        includedAddonIds: ['food'],
      },
    ],
    ...overrides,
  }
}

describe('eventSchema del backend', () => {
  it('normaliza números y acepta un evento completo', () => {
    const result = eventSchema.safeParse(validEvent({ slots: '120' }))

    expect(result.success).toBe(true)
    expect(result.data.slots).toBe(120)
    expect(result.data.requiresMembership).toBe(true)
  })

  it('acepta requiresMembership false y default true si falta', () => {
    const withoutField = eventSchema.safeParse(validEvent())
    const withFalse = eventSchema.safeParse(validEvent({ requiresMembership: false }))

    expect(withoutField.success).toBe(true)
    expect(withoutField.data.requiresMembership).toBe(true)
    expect(withFalse.success).toBe(true)
    expect(withFalse.data.requiresMembership).toBe(false)
  })

  it('rechaza una fecha final anterior al inicio', () => {
    const result = eventSchema.safeParse(
      validEvent({ startsAt: '2026-08-15T20:00', endsAt: '2026-08-15T09:00' }),
    )

    expect(result.success).toBe(false)
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'endsAt')).toBe(true)
  })

  it('acepta y conserva la descripción editable del evento', () => {
    const result = eventSchema.safeParse(validEvent({ description: '  Torneo abierto.  ' }))

    expect(result.success).toBe(true)
    expect(result.data.description).toBe('Torneo abierto.')
  })

  it('rechaza jornadas duplicadas y referencias inexistentes', () => {
    const result = eventSchema.safeParse(
      validEvent({
        eventDays: [
          { dayIndex: 0, label: 'Día 1' },
          { dayIndex: 0, label: 'Otra jornada' },
        ],
        ticketTypes: [
          {
            name: 'Pase inválido',
            price: 20000,
            dayIndexes: [3],
            includedAddonIds: ['missing'],
          },
        ],
      }),
    )

    expect(result.success).toBe(false)
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['eventDays', 'ticketTypes']),
    )
  })

  it('rechaza venta de entradas habilitada sin catálogo vendible', () => {
    const result = eventSchema.safeParse(
      validEvent({
        eventDays: [],
        ticketTypes: [],
      }),
    )

    expect(result.success).toBe(false)
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['eventDays', 'ticketTypes']),
    )
    expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'La venta de entradas necesita al menos un día del evento.',
        'La venta de entradas necesita al menos un tipo activo con precio.',
      ]),
    )
  })
})

describe('validateAdminEventDraft del editor', () => {
  const t = (key) => key

  function validDraft(overrides = {}) {
    return {
      title: 'Pitbull Classic',
      slots: 120,
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'proximamente',
      startsAt: '2026-08-15T09:00',
      endsAt: '2026-08-15T20:00',
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      ...overrides,
    }
  }

  it('acepta un draft completo', () => {
    expect(validateAdminEventDraft(validDraft(), t).ok).toBe(true)
  })

  // startsAt/endsAt pasaron de opcionales a requeridos: eran opcionales acá pero
  // obligatorios en el backend, así que un evento sin horario pasaba la
  // validación del editor y lo rechazaba la API. Además convivían con un
  // `dateISO` aparte que podía contradecirlos.
  it('exige inicio y fin, que antes eran opcionales', () => {
    const missingStart = validateAdminEventDraft(validDraft({ startsAt: '' }), t)
    const missingEnd = validateAdminEventDraft(validDraft({ endsAt: '' }), t)

    expect(missingStart.ok).toBe(false)
    expect(missingStart.fieldErrors.startsAt).toBe('admin.eventEditor.validation.startsAtRequired')
    expect(missingEnd.ok).toBe(false)
    expect(missingEnd.fieldErrors.endsAt).toBe('admin.eventEditor.validation.endsAtRequired')
  })

  it('ya no pide dateISO por separado: el inicio es la única fuente de fecha', () => {
    expect(validateAdminEventDraft(validDraft({ dateISO: '' }), t).ok).toBe(true)
  })

  it('rechaza un fin anterior al inicio', () => {
    const result = validateAdminEventDraft(
      validDraft({ startsAt: '2026-08-15T20:00', endsAt: '2026-08-15T09:00' }),
      t,
    )

    expect(result.ok).toBe(false)
    expect(result.fieldErrors.endsAt).toBe('admin.eventEditor.validation.endsBeforeStarts')
  })

  it('valida jornadas, entradas y beneficios antes de llamar al backend', () => {
    const result = validateAdminEventDraft(
      validDraft({
        eventDays: [{ dayIndex: 0, label: '' }],
        pricing: {
          membership: 75000,
          registration: 75000,
          combo: 120000,
          ticketAddons: [{ id: 'food', label: '', price: -1 }],
        },
        ticketTypes: [{ name: '', price: 1000, dayIndexes: [3], includedAddonIds: ['missing'] }],
      }),
      t,
    )

    expect(result.ok).toBe(false)
    expect(result.fieldErrors).toMatchObject({
      'eventDays.0.label': 'admin.eventEditor.validation.dayLabelRequired',
      'pricing.ticketAddons.0.label': 'admin.eventEditor.validation.addonLabelRequired',
      'ticketTypes.0.name': 'admin.eventEditor.validation.ticketTypeNameRequired',
      'ticketTypes.0.dayIndexes': 'admin.eventEditor.validation.ticketTypeDayMissing',
      'ticketTypes.0.includedAddonIds': 'admin.eventEditor.validation.ticketTypeAddonMissing',
    })
  })

  it('exige día y tipo con precio si se habilita la venta de entradas', () => {
    const missingDays = validateAdminEventDraft(
      validDraft({
        pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
        ticketTypes: [{ name: 'General', price: 12000, active: true, dayIndexes: [] }],
      }),
      t,
    )
    const missingType = validateAdminEventDraft(
      validDraft({
        pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
        eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
        ticketTypes: [{ name: 'Cortesía', price: 0, active: true, dayIndexes: [0] }],
      }),
      t,
    )

    expect(missingDays.ok).toBe(false)
    expect(missingDays.fieldErrors.eventDays).toBe('admin.eventEditor.validation.ticketsNeedDays')
    expect(missingType.ok).toBe(false)
    expect(missingType.fieldErrors.ticketTypes).toBe(
      'admin.eventEditor.validation.ticketsNeedType',
    )
  })

  it('rechaza una franja de pesaje incompleta o con cierre antes de la apertura', () => {
    const incomplete = validateAdminEventDraft(
      validDraft({
        weighInWindows: [{ label: 'Viernes', date: '2026-08-14', startsAt: '', endsAt: '' }],
      }),
      t,
    )
    const inverted = validateAdminEventDraft(
      validDraft({
        weighInWindows: [
          {
            label: 'Viernes',
            date: '2026-08-14',
            startsAt: '2026-08-14T16:00',
            endsAt: '2026-08-14T09:00',
          },
        ],
      }),
      t,
    )

    expect(incomplete.ok).toBe(false)
    expect(incomplete.fieldErrors['weighInWindows.0.startsAt']).toBe(
      'admin.eventEditor.validation.weighInStartsRequired',
    )
    expect(inverted.ok).toBe(false)
    expect(inverted.fieldErrors['weighInWindows.0.endsAt']).toBe(
      'admin.eventEditor.validation.weighInWindowInvalid',
    )
  })
})

/**
 * Cerrar los cuatro medios de cobro de entradas equivale a cerrar la venta,
 * pero por un camino que no se ve: el evento queda publicado y la pantalla
 * pública deja de ofrecer la compra sin que nadie lo haya decidido así.
 */
describe('medios de cobro de entradas', () => {
  const closed = {
    mercado_pago: false,
    bank_transfer: false,
    cash_pitbull: false,
    wise_transfer: false,
  }

  function draftWith(paymentChannelOverrides) {
    return {
      title: 'Pitbull Classic',
      description: '',
      slots: 120,
      venue: 'La Troupé',
      location: 'Banfield',
      status: 'inscripcion_abierta',
      startsAt: '2026-12-12T12:00:00.000Z',
      endsAt: '2026-12-13T23:00:00.000Z',
      pricing: { membership: 0, registration: 85000, combo: 0, ticketsEnabled: true },
      eventDays: [{ dayIndex: 0, label: 'Sábado' }],
      ticketTypes: [{ name: 'General', price: 15000, active: true, dayIndexes: [0] }],
      paymentChannelOverrides,
    }
  }

  it('rechaza el evento con los cuatro medios de entradas cerrados', () => {
    const result = validateAdminEventDraft(draftWith({ ticket: closed }), (key) => key)
    expect(result.ok).toBe(false)
    expect(result.fieldErrors['paymentChannelOverrides.ticket']).toMatch(/ticketsNoChannel/)
  })

  it('con un solo medio abierto no dice nada', () => {
    const result = validateAdminEventDraft(
      draftWith({ ticket: { ...closed, mercado_pago: true } }),
      (key) => key,
    )
    expect(result.fieldErrors['paymentChannelOverrides.ticket']).toBeUndefined()
  })

  it('no se mete con inscripción', () => {
    const result = validateAdminEventDraft(
      draftWith({ registration: closed, ticket: { ...closed, bank_transfer: true } }),
      (key) => key,
    )
    expect(result.fieldErrors['paymentChannelOverrides.ticket']).toBeUndefined()
    expect(result.fieldErrors['paymentChannelOverrides.registration']).toBeUndefined()
  })

  it('sin override no hay nada que validar', () => {
    const result = validateAdminEventDraft(draftWith(null), (key) => key)
    expect(result.fieldErrors['paymentChannelOverrides.ticket']).toBeUndefined()
  })
})

/**
 * Precio propio en USD y ventana propia por tipo de entrada: los dos esquemas
 * —el del editor y el de la API— tienen que aceptar y rechazar lo mismo. Si uno
 * es más laxo, el guardado pasa la validación del panel y rebota en el backend
 * con un error que no apunta a ninguna fila.
 */
describe('tipo de entrada: precio Wise y ventana propia', () => {
  const t = (key) => key

  function draftWithType(type) {
    return {
      title: 'Pitbull Classic',
      slots: 120,
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'proximamente',
      startsAt: '2026-08-15T09:00',
      endsAt: '2026-08-15T20:00',
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      ticketTypes: [{ name: 'Pase general', price: 20000, ...type }],
    }
  }

  function apiWithType(type) {
    return validEvent({
      ticketTypes: [
        {
          name: 'Pase general',
          price: 20000,
          quota: 100,
          dayIndexes: [0],
          includedAddonIds: ['food'],
          ...type,
        },
      ],
    })
  }

  it('vacío es válido en los dos: significa heredar la conversión y la ventana del evento', () => {
    expect(validateAdminEventDraft(draftWithType({ wisePrice: '' }), t).ok).toBe(true)
    expect(eventSchema.safeParse(apiWithType({ wisePrice: '' })).success).toBe(true)
  })

  it('acepta un USD cargado a mano', () => {
    expect(validateAdminEventDraft(draftWithType({ wisePrice: 15 }), t).ok).toBe(true)
    const parsed = eventSchema.safeParse(apiWithType({ wisePrice: '15' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data.ticketTypes[0].wisePrice).toBe(15)
  })

  it('rechaza un USD que no se puede cobrar', () => {
    for (const wisePrice of [0, -5, 100001]) {
      expect(validateAdminEventDraft(draftWithType({ wisePrice }), t).ok).toBe(false)
      expect(eventSchema.safeParse(apiWithType({ wisePrice })).success).toBe(false)
    }
  })

  it('rechaza una ventana que cierra antes de abrir, señalando la fila', () => {
    const draft = validateAdminEventDraft(
      draftWithType({ salesOpensAt: '2026-08-10T10:00', salesClosesAt: '2026-08-01T10:00' }),
      t,
    )
    expect(draft.ok).toBe(false)
    expect(draft.fieldErrors['ticketTypes.0.salesClosesAt']).toBe(
      'admin.eventEditor.validation.ticketTypeSaleWindowInvalid',
    )

    const api = eventSchema.safeParse(
      apiWithType({ salesOpensAt: '2026-08-10T10:00', salesClosesAt: '2026-08-01T10:00' }),
    )
    expect(api.success).toBe(false)
    expect(api.error.issues.some((issue) => issue.path.join('.') === 'ticketTypes.0.salesClosesAt')).toBe(
      true,
    )
  })

  it('acepta una ventana abierta de un solo lado', () => {
    expect(validateAdminEventDraft(draftWithType({ salesClosesAt: '2026-08-01T10:00' }), t).ok).toBe(
      true,
    )
    expect(eventSchema.safeParse(apiWithType({ salesOpensAt: '2026-08-01T10:00' })).success).toBe(
      true,
    )
  })
})

/**
 * Precio manual (transferencia/efectivo) por tipo de entrada: mismo criterio
 * que el bloque de Wise — el editor y la API tienen que aceptar y rechazar lo
 * mismo, y acá además hay una regla de negocio (no puede superar el precio de
 * lista) que se repite en las dos capas y en la migración.
 */
describe('tipo de entrada: precio manual (transferencia/efectivo)', () => {
  const t = (key) => key

  function draftWithType(type) {
    return {
      title: 'Pitbull Classic',
      slots: 120,
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      status: 'proximamente',
      startsAt: '2026-08-15T09:00',
      endsAt: '2026-08-15T20:00',
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      ticketTypes: [{ name: 'Pase general', price: 20000, ...type }],
    }
  }

  function apiWithType(type) {
    return validEvent({
      ticketTypes: [
        {
          name: 'Pase general',
          price: 20000,
          quota: 100,
          dayIndexes: [0],
          includedAddonIds: ['food'],
          ...type,
        },
      ],
    })
  }

  it('vacío es válido en los dos: cobra igual que Mercado Pago en cualquier canal', () => {
    expect(validateAdminEventDraft(draftWithType({ manualPrice: '' }), t).ok).toBe(true)
    expect(eventSchema.safeParse(apiWithType({ manualPrice: '' })).success).toBe(true)
  })

  it('acepta un precio manual por debajo del de lista', () => {
    expect(validateAdminEventDraft(draftWithType({ manualPrice: 17000 }), t).ok).toBe(true)
    const parsed = eventSchema.safeParse(apiWithType({ manualPrice: '17000' }))
    expect(parsed.success).toBe(true)
    expect(parsed.data.ticketTypes[0].manualPrice).toBe(17000)
  })

  it('acepta un precio manual igual al de lista (sin descuento, pero válido)', () => {
    expect(validateAdminEventDraft(draftWithType({ manualPrice: 20000 }), t).ok).toBe(true)
    expect(eventSchema.safeParse(apiWithType({ manualPrice: 20000 })).success).toBe(true)
  })

  it('rechaza un precio manual por encima del precio de lista en las dos capas', () => {
    const draft = validateAdminEventDraft(draftWithType({ manualPrice: 25000 }), t)
    expect(draft.ok).toBe(false)
    expect(draft.fieldErrors['ticketTypes.0.manualPrice']).toBe(
      'admin.eventEditor.validation.manualPriceAbovePrice',
    )

    const api = eventSchema.safeParse(apiWithType({ manualPrice: 25000 }))
    expect(api.success).toBe(false)
    expect(api.error.issues.some((issue) => issue.path.join('.') === 'ticketTypes.0.manualPrice')).toBe(
      true,
    )
  })

  it('rechaza un precio manual que no se puede cobrar', () => {
    for (const manualPrice of [0, -5, 10_000_001]) {
      expect(validateAdminEventDraft(draftWithType({ manualPrice }), t).ok).toBe(false)
      expect(eventSchema.safeParse(apiWithType({ manualPrice })).success).toBe(false)
    }
  })
})
