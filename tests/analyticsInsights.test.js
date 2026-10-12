import { describe, expect, it } from 'vitest'
import { buildAnalyticsInsights } from '../src/lib/analyticsInsights.js'

const FUNNEL = [
  { step_name: 'landing_view', visitors: 900 },
  { step_name: 'membership_view', visitors: 400 },
  { step_name: 'membership_checkout_opened', visitors: 160 },
  { step_name: 'membership_payment_submitted', visitors: 100 },
  { step_name: 'membership_payment_approved', visitors: 90 },
]

/** Dos semanas desde el lunes 5/10/2026, con fines de semana más flojos. */
function twoWeeks(overrides = {}) {
  const series = []
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(2026, 9, 5 + offset)
    const dow = date.getDay()
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    series.push({ day, visitors: dow === 0 || dow === 6 ? 20 : 50, ...overrides[day] })
  }
  return series
}

const byId = (list, id) => list.find((item) => item.id === id)

describe('conversión de punta a punta', () => {
  it('compara el último paso con el primero', () => {
    const insight = byId(buildAnalyticsInsights({ funnel: FUNNEL }), 'conversion')

    expect(insight).toMatchObject({ entered: 900, completed: 90, firstStep: 'landing_view' })
    expect(insight.rate).toBeCloseTo(0.1)
    expect(insight.lastStep).toBe('membership_payment_approved')
  })

  it('no se emite con un embudo de un solo paso o sin gente suficiente', () => {
    expect(byId(buildAnalyticsInsights({ funnel: [FUNNEL[0]] }), 'conversion')).toBeUndefined()
    expect(
      byId(
        buildAnalyticsInsights({
          funnel: [
            { step_name: 'a', visitors: 6 },
            { step_name: 'b', visitors: 3 },
          ],
        }),
        'conversion',
      ),
    ).toBeUndefined()
  })
})

describe('dónde se pierde más gente', () => {
  it('elige el tramo con mayor proporción de caída, no el de más personas', () => {
    const insight = byId(buildAnalyticsInsights({ funnel: FUNNEL }), 'leak')

    // 400 → 160 cae 60%; 900 → 400 cae 55,6%, aunque pierde más personas.
    expect(insight.from).toBe('membership_view')
    expect(insight.to).toBe('membership_checkout_opened')
    expect(insight.lossRate).toBeCloseTo(0.6)
    expect(insight.lost).toBe(240)
  })

  it('ignora tramos con muy poca gente de base', () => {
    const insight = buildAnalyticsInsights({
      funnel: [
        { step_name: 'a', visitors: 500 },
        { step_name: 'b', visitors: 450 },
        { step_name: 'c', visitors: 10 },
        { step_name: 'd', visitors: 1 },
      ],
    })
    // 450 → 10 sí cuenta (base alta); 10 → 1 no (base < 20).
    expect(byId(insight, 'leak').from).toBe('b')
  })

  it('no señala nada si el embudo casi no pierde gente', () => {
    const insight = buildAnalyticsInsights({
      funnel: [
        { step_name: 'a', visitors: 100 },
        { step_name: 'b', visitors: 95 },
        { step_name: 'c', visitors: 92 },
      ],
    })
    expect(byId(insight, 'leak')).toBeUndefined()
  })
})

describe('mejor día', () => {
  it('marca el día de más visitantes y cuántas veces supera al promedio', () => {
    const series = twoWeeks({ '2026-10-08': { visitors: 200 } })
    const insight = byId(buildAnalyticsInsights({ series }), 'bestDay')

    expect(insight.day).toBe('2026-10-08')
    expect(insight.visitors).toBe(200)
    expect(insight.ratio).toBeGreaterThan(2)
  })

  it('sin un día claramente superior no inventa un múltiplo', () => {
    const series = [
      { day: '2026-10-05', visitors: 30 },
      { day: '2026-10-06', visitors: 32 },
    ]
    expect(byId(buildAnalyticsInsights({ series }), 'bestDay').ratio).toBeNull()
  })

  it('una serie vacía o sin visitas no produce titular', () => {
    expect(byId(buildAnalyticsInsights({ series: [] }), 'bestDay')).toBeUndefined()
    expect(
      byId(buildAnalyticsInsights({ series: [{ day: '2026-10-05', visitors: 0 }] }), 'bestDay'),
    ).toBeUndefined()
  })
})

describe('días hábiles contra fines de semana', () => {
  it('compara promedios por día, no totales', () => {
    const insight = byId(buildAnalyticsInsights({ series: twoWeeks() }), 'rhythm')

    expect(insight.leader).toBe('weekdays')
    // 50 contra 20 por día: 150% más.
    expect(insight.gap).toBeCloseTo(1.5)
  })

  it('detecta cuando el fin de semana es el fuerte', () => {
    const flipped = twoWeeks().map((item) => ({
      ...item,
      visitors: item.visitors === 20 ? 90 : 30,
    }))
    expect(byId(buildAnalyticsInsights({ series: flipped }), 'rhythm').leader).toBe('weekend')
  })

  it('no afirma un patrón con pocos días', () => {
    expect(
      byId(buildAnalyticsInsights({ series: twoWeeks().slice(0, 5) }), 'rhythm'),
    ).toBeUndefined()
  })

  it('no lo destaca si la diferencia es mínima', () => {
    const flat = twoWeeks().map((item) => ({ ...item, visitors: 40 }))
    expect(byId(buildAnalyticsInsights({ series: flat }), 'rhythm')).toBeUndefined()
  })
})

describe('página más vista', () => {
  it('usa las páginas vistas del período como denominador', () => {
    const insight = byId(
      buildAnalyticsInsights({
        pages: [
          { path: '/', pageviews: 300 },
          { path: '/afiliarse', pageviews: 100 },
        ],
        pageviews: 1000,
      }),
      'topPage',
    )
    expect(insight).toMatchObject({ path: '/', share: 0.3 })
  })

  it('si el total no es coherente se apoya en lo listado', () => {
    const insight = byId(
      buildAnalyticsInsights({
        pages: [
          { path: '/', pageviews: 300 },
          { path: '/x', pageviews: 100 },
        ],
        pageviews: 50,
      }),
      'topPage',
    )
    expect(insight.share).toBe(0.75)
  })
})

describe('conjunto de titulares', () => {
  it('emite a lo sumo cuatro, en orden de prioridad', () => {
    const insights = buildAnalyticsInsights({
      funnel: FUNNEL,
      series: twoWeeks({ '2026-10-08': { visitors: 200 } }),
      pages: [{ path: '/', pageviews: 300 }],
      pageviews: 1000,
    })

    expect(insights).toHaveLength(4)
    expect(insights.map((item) => item.id)).toEqual(['conversion', 'leak', 'bestDay', 'rhythm'])
  })

  it('sin datos no devuelve nada en vez de rellenar', () => {
    expect(buildAnalyticsInsights({})).toEqual([])
    expect(buildAnalyticsInsights()).toEqual([])
  })
})
