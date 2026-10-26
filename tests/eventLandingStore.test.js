import { describe, expect, it, vi } from 'vitest'
import { saveEventLanding } from '../server/modules/events/eventLandingStore.js'

const MISSING = { code: 'PGRST202', message: 'Could not find the function in the schema cache' }
const RPC = {
  slots: 'staff_merge_event_landing',
  state: 'staff_merge_event_landing_state',
  layout: 'staff_merge_event_landing_layout',
}

/**
 * Cliente falso: registra las RPC en orden y simula la fila `events` para el
 * respaldo directo. `failures` mapea nombre de RPC → error que devuelve.
 */
function fakeClient({ failures = {}, rules = {}, withReader = true } = {}) {
  const calls = []
  const updates = []
  const client = {
    calls,
    updates,
    rpc: vi.fn(async (name, args) => {
      calls.push([name, args])
      return { data: null, error: failures[name] ?? null }
    }),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          ...(withReader ? { maybeSingle: async () => ({ data: { rules }, error: null }) } : {}),
        }),
      }),
      update: (payload) => ({
        eq: async (_column, slug) => {
          updates.push({ slug, payload })
          return { data: null, error: null }
        },
      }),
    })),
  }
  return client
}

const builderEvent = {
  slug: 'barbell-submission-2027',
  publicCopy: { publicTitle: 'Título del panel', heroLead: 'Bajada del panel' },
  landing: {
    templateId: 'builder',
    themeId: 'ember',
    publicVisible: false,
    phase: 'published',
    slots: { heroTitle: 'Título propio', experienceTitle: 'Jueces' },
    layout: {
      blocks: [
        { id: 'hero', type: 'hero' },
        { id: 'cta-1', type: 'cta', props: { label: 'Ir', href: 'javascript:alert(1)' } },
      ],
      palette: { accent: '#FF8800' },
    },
  },
}

const names = (client) => client.calls.map(([name]) => name)

describe('saveEventLanding', () => {
  it('guarda en orden: slots, estado y layout', async () => {
    const client = fakeClient()
    await saveEventLanding(client, builderEvent)
    expect(names(client)).toEqual([RPC.slots, RPC.state, RPC.layout])
  })

  it('la RPC histórica recibe solo meet/editorial, el tema válido y todos los slots', async () => {
    const client = fakeClient()
    await saveEventLanding(client, builderEvent)
    const [, args] = client.calls[0]

    expect(args.p_slug).toBe('barbell-submission-2027')
    expect(args.p_landing.templateId).toBe('meet') // builder se persiste en el paso de estado
    expect(args.p_landing.themeId).toBe('ember')
    expect(Object.keys(args.p_landing.slots)).toHaveLength(20)
    expect(args.p_landing.slots.heroTitle).toBe('Título propio')
    // Lo que no tiene slot propio cae a publicCopy; lo demás, vacío.
    expect(args.p_landing.slots.heroLead).toBe('Bajada del panel')
    expect(args.p_landing.slots.faq1Question).toBe('')
  })

  it('un tema desconocido cae al de PLU y editorial se conserva', async () => {
    const client = fakeClient()
    await saveEventLanding(client, {
      slug: 'x-evento',
      landing: { templateId: 'editorial', themeId: 'rosa-furioso' },
    })
    const { templateId, themeId } = client.calls[0][1].p_landing
    expect(templateId).toBe('editorial')
    expect(themeId).toBe('plu-default')
  })

  it('el estado lleva plantilla definitiva, switch y fase', async () => {
    const client = fakeClient()
    await saveEventLanding(client, builderEvent)
    expect(client.calls[1][1]).toEqual({
      p_slug: 'barbell-submission-2027',
      p_template_id: 'builder',
      p_public_visible: false,
      p_phase: 'published',
    })
  })

  it('sin landing usa los valores por defecto y no guarda layout', async () => {
    const client = fakeClient()
    await saveEventLanding(client, { slug: 'x-evento' })
    expect(client.calls[1][1]).toMatchObject({
      p_template_id: 'meet',
      p_public_visible: true,
      p_phase: 'coming_soon',
    })
    expect(names(client)).toEqual([RPC.slots, RPC.state])
  })

  it('el layout viaja normalizado: link inseguro descartado y color en minúscula', async () => {
    const client = fakeClient()
    await saveEventLanding(client, builderEvent)
    const layout = client.calls[2][1].p_layout
    expect(layout.palette).toEqual({ accent: '#ff8800' })
    expect(layout.blocks[1].props.href).toBe('')
  })

  it('fuera del Constructor guarda solo la paleta', async () => {
    const client = fakeClient()
    await saveEventLanding(client, {
      slug: 'x-evento',
      landing: {
        templateId: 'editorial',
        layout: { blocks: [{ id: 'hero', type: 'hero' }], palette: { accent: '#ff8800' } },
      },
    })
    expect(client.calls[2][1].p_layout).toEqual({ blocks: [], palette: { accent: '#ff8800' }, motion: 'soft' })
  })

  describe('despliegue escalonado (RPC todavía inexistente)', () => {
    it('sin la RPC de slots avisa y sigue con el resto', async () => {
      const warn = vi.fn()
      const client = fakeClient({ failures: { [RPC.slots]: MISSING } })
      await saveEventLanding(client, builderEvent, { warn })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('staff_merge_event_landing'))
      expect(names(client)).toEqual([RPC.slots, RPC.state, RPC.layout])
    })

    it('sin la RPC de estado escribe directo, conservando el resto de rules.landing', async () => {
      const client = fakeClient({
        failures: { [RPC.state]: MISSING },
        rules: { comboPrice: 5, landing: { slots: { heroTitle: 'ya guardado' } } },
      })
      await saveEventLanding(client, builderEvent)
      const { slug, payload } = client.updates[0]
      expect(slug).toBe('barbell-submission-2027')
      expect(payload.rules.comboPrice).toBe(5)
      expect(payload.rules.landing).toEqual({
        slots: { heroTitle: 'ya guardado' },
        templateId: 'builder',
        publicVisible: false,
        phase: 'published',
      })
    })

    it('una base anterior que rechaza "builder" también cae al respaldo directo', async () => {
      const client = fakeClient({
        failures: { [RPC.state]: { code: 'PLU01', message: 'Plantilla de landing inválida.' } },
      })
      await saveEventLanding(client, builderEvent)
      expect(client.updates).toHaveLength(1)
      expect(client.updates[0].payload.rules.landing.templateId).toBe('builder')
    })

    it('pero rechaza una plantilla inválida real: no la tapa con el respaldo', async () => {
      const client = fakeClient({
        failures: { [RPC.state]: { code: 'PLU01', message: 'Plantilla de landing inválida.' } },
      })
      await expect(
        saveEventLanding(client, { slug: 'x-evento', landing: { templateId: 'editorial' } }),
      ).rejects.toThrow()
      expect(client.updates).toHaveLength(0)
    })

    it('sin la RPC de layout escribe layout directo', async () => {
      const client = fakeClient({ failures: { [RPC.layout]: MISSING }, rules: { landing: { templateId: 'builder' } } })
      await saveEventLanding(client, builderEvent)
      expect(client.updates[0].payload.rules.landing.layout.palette).toEqual({ accent: '#ff8800' })
      expect(client.updates[0].payload.rules.landing.templateId).toBe('builder')
    })

    it('un adaptador sin lectura no puede respaldar y no rompe el guardado', async () => {
      const client = fakeClient({ failures: { [RPC.layout]: MISSING }, withReader: false })
      await expect(saveEventLanding(client, builderEvent)).resolves.toBeUndefined()
      expect(client.updates).toHaveLength(0)
    })
  })

  describe('errores reales', () => {
    it('un error que no es de schema se propaga', async () => {
      const client = fakeClient({ failures: { [RPC.layout]: { code: '23514', message: 'Color de landing inválido.' } } })
      await expect(saveEventLanding(client, builderEvent)).rejects.toThrow()
    })

    it('si el evento no existe en el respaldo directo, 404', async () => {
      const client = fakeClient({ failures: { [RPC.state]: MISSING } })
      client.from = vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }))
      await expect(saveEventLanding(client, builderEvent)).rejects.toMatchObject({ status: 404 })
    })
  })
})
