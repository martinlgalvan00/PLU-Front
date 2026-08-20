import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PLATFORM_FEATURES } from '../../server/routes/platformSettings.js'
import { createSupabaseTestClient } from './helpers/supabaseTestClient.js'

/**
 * Los diez interruptores contra la RPC real.
 *
 * El setter usa una lista blanca de nombre -> columna y un UPDATE dinámico
 * (`plu_private.platform_feature_toggle_column`), así que la ida y vuelta de
 * cada uno es lo único que prueba que la columna existe, que se escribe la que
 * corresponde y que no se pisan entre sí. Un doble en memoria no puede
 * verificarlo.
 *
 * El estado original se guarda y se restaura: esta suite corre contra la base
 * compartida, y dejar un interruptor apagado cortaría los cobros de verdad.
 */
function toggleKey(feature) {
  return `${feature.replace(/_(.)/g, (_match, char) => char.toUpperCase())}Enabled`
}

const ACTOR = 'integration:platform-feature-toggles'

describe('interruptores de plataforma contra Supabase', () => {
  const admin = createSupabaseTestClient()
  let original = null

  beforeAll(async () => {
    const current = await admin.rpc('staff_get_platform_feature_toggles')
    if (current.error) throw new Error(current.error.message)
    original = current.data
  })

  afterAll(async () => {
    if (!original) return
    for (const feature of PLATFORM_FEATURES) {
      const wasEnabled = original[toggleKey(feature)] !== false
      await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: feature,
        p_enabled: wasEnabled,
        p_actor: original.updatedBy ?? ACTOR,
      })
    }
  })

  it('expone los diez interruptores que conoce la API', async () => {
    const result = await admin.rpc('staff_get_platform_feature_toggles')
    if (result.error) throw new Error(result.error.message)
    for (const feature of PLATFORM_FEATURES) {
      expect(result.data, feature).toHaveProperty(toggleKey(feature))
      expect(typeof result.data[toggleKey(feature)], feature).toBe('boolean')
    }
  })

  it('apaga y reabre cada interruptor sin arrastrar a los demás', async () => {
    for (const feature of PLATFORM_FEATURES) {
      const key = toggleKey(feature)
      const others = PLATFORM_FEATURES.filter((item) => item !== feature).map(toggleKey)

      // El punto de partida es el que tenga la base, no "todo encendido": los
      // canales manuales de afiliación e inscripción viven apagados a propósito
      // mientras el lanzamiento vaya sólo con Mercado Pago. Lo que se prueba es
      // que el UPDATE dinámico toque una columna y deje las demás como estaban.
      const before = await admin.rpc('staff_get_platform_feature_toggles')
      if (before.error) throw new Error(`${feature}: ${before.error.message}`)

      const off = await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: feature,
        p_enabled: false,
        p_actor: ACTOR,
      })
      if (off.error) throw new Error(`${feature}: ${off.error.message}`)
      expect(off.data[key], feature).toBe(false)
      for (const other of others) {
        expect(off.data[other], `${feature} -> ${other}`).toBe(before.data[other])
      }

      const on = await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: feature,
        p_enabled: true,
        p_actor: ACTOR,
      })
      if (on.error) throw new Error(`${feature}: ${on.error.message}`)
      expect(on.data[key], feature).toBe(true)
      for (const other of others) {
        expect(on.data[other], `${feature} -> ${other}`).toBe(before.data[other])
      }

      // Se restaura acá y no sólo en el afterAll: la fila es compartida y el
      // resto de la suite corre en paralelo contra ella.
      if (before.data[key] !== true) {
        const restored = await admin.rpc('staff_set_platform_feature_toggle', {
          p_feature: feature,
          p_enabled: before.data[key],
          p_actor: original?.updatedBy ?? ACTOR,
        })
        if (restored.error) throw new Error(`${feature}: ${restored.error.message}`)
      }
    }
  })

  it('rechaza un nombre de interruptor fuera de la lista blanca', async () => {
    const result = await admin.rpc('staff_set_platform_feature_toggle', {
      p_feature: 'membershipManual',
      p_enabled: false,
      p_actor: ACTOR,
    })
    expect(result.error?.message).toContain('no es válida')
  })

  it('deja el cambio en la auditoría con el valor anterior', async () => {
    // El punto de partida se fija acá y con otro actor: el aserto es sobre el
    // par false -> true que escribe ACTOR, y la consulta filtra por ese actor,
    // así que este set no entra en la muestra ni depende de cómo esté la fila.
    const setup = await admin.rpc('staff_set_platform_feature_toggle', {
      p_feature: 'ticket_validation',
      p_enabled: true,
      p_actor: `${ACTOR}:setup`,
    })
    if (setup.error) throw new Error(setup.error.message)

    await admin.rpc('staff_set_platform_feature_toggle', {
      p_feature: 'ticket_validation',
      p_enabled: false,
      p_actor: ACTOR,
    })
    await admin.rpc('staff_set_platform_feature_toggle', {
      p_feature: 'ticket_validation',
      p_enabled: true,
      p_actor: ACTOR,
    })

    const audit = await admin
      .from('domain_audit_logs')
      .select('metadata, created_at')
      .eq('action', 'platform_feature_toggle.updated')
      .eq('entity_id', 'ticket_validation')
      .eq('actor_id', ACTOR)
      .order('created_at', { ascending: false })
      .limit(2)
    if (audit.error) throw new Error(audit.error.message)

    expect(audit.data).toHaveLength(2)
    expect(audit.data[0].metadata).toMatchObject({
      feature: 'ticket_validation',
      enabled: true,
      previousEnabled: false,
    })
    expect(audit.data[1].metadata).toMatchObject({ enabled: false, previousEnabled: true })

    await admin
      .from('domain_audit_logs')
      .delete()
      .eq('action', 'platform_feature_toggle.updated')
      .in('actor_id', [ACTOR, `${ACTOR}:setup`])
  })
})

/**
 * Matriz de cobro concepto × canal.
 *
 * Vive en este archivo y no en uno propio a propósito: los archivos de la suite
 * de integración corren en paralelo, y la fila de interruptores de la
 * organización es única. Con dos archivos escribiéndola, el test de "no se pisan
 * entre sí" de arriba fallaba de forma intermitente por interferencia ajena, no
 * por un bug. Un solo archivo dueño del recurso compartido, y los describes de
 * acá corren en secuencia.
 */
const CONCEPTS = ['membership', 'registration', 'ticket']
const CHANNELS = ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']
const MATRIX_ACTOR = 'integration:payment-channel-matrix'

describe('matriz de canales de pago contra Supabase', () => {
  const admin = createSupabaseTestClient()
  let original = null

  const toggles = async () => {
    const result = await admin.rpc('staff_get_platform_feature_toggles')
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  const setChannel = async (concept, channel, enabled) => {
    const result = await admin.rpc('staff_set_payment_channel', {
      p_concept: concept,
      p_channel: channel,
      p_enabled: enabled,
      p_actor: MATRIX_ACTOR,
    })
    if (result.error) throw new Error(`${concept}/${channel}: ${result.error.message}`)
    return result.data
  }

  beforeAll(async () => {
    original = await toggles()
  })

  afterAll(async () => {
    if (!original?.paymentChannels) return
    for (const concept of CONCEPTS) {
      for (const channel of CHANNELS) {
        await setChannel(concept, channel, original.paymentChannels[concept][channel])
      }
    }
    // El actor de la fila vuelve a ser quien la tocó de verdad, no este test.
    if (original.updatedBy) {
      await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: 'checkout',
        p_enabled: original.checkoutEnabled !== false,
        p_actor: original.updatedBy,
      })
    }
  })

  it('expone las doce celdas como booleanos', async () => {
    const current = await toggles()
    for (const concept of CONCEPTS) {
      for (const channel of CHANNELS) {
        expect(typeof current.paymentChannels?.[concept]?.[channel], `${concept}/${channel}`).toBe(
          'boolean',
        )
      }
    }
  })

  it('deriva el booleano manual del contrato anterior desde la matriz', async () => {
    const current = await toggles()
    for (const concept of CONCEPTS) {
      const cells = current.paymentChannels[concept]
      expect(current[`${concept}ManualEnabled`], concept).toBe(
        cells.bank_transfer || cells.cash_pitbull,
      )
    }
  })

  it('cierra y reabre cada celda sin arrastrar a las demás', async () => {
    for (const concept of CONCEPTS) {
      for (const channel of CHANNELS) {
        const before = await toggles()
        const others = []
        for (const otherConcept of CONCEPTS) {
          for (const otherChannel of CHANNELS) {
            if (otherConcept === concept && otherChannel === channel) continue
            others.push([otherConcept, otherChannel])
          }
        }

        const off = await setChannel(concept, channel, false)
        expect(off.paymentChannels[concept][channel], `${concept}/${channel}`).toBe(false)
        for (const [otherConcept, otherChannel] of others) {
          expect(
            off.paymentChannels[otherConcept][otherChannel],
            `${concept}/${channel} -> ${otherConcept}/${otherChannel}`,
          ).toBe(before.paymentChannels[otherConcept][otherChannel])
        }

        const on = await setChannel(concept, channel, true)
        expect(on.paymentChannels[concept][channel], `${concept}/${channel}`).toBe(true)

        // Se restaura acá y no sólo en el afterAll: la fila es compartida y el
        // resto de la suite corre en paralelo contra ella.
        await setChannel(concept, channel, before.paymentChannels[concept][channel])
      }
    }
  })

  it('deja cerrar los cuatro canales de un concepto', async () => {
    const before = await toggles()
    try {
      let last = null
      for (const channel of CHANNELS) last = await setChannel('ticket', channel, false)
      expect(last.paymentChannels.ticket).toEqual({
        mercado_pago: false,
        bank_transfer: false,
        cash_pitbull: false,
        wise_transfer: false,
      })
      expect(last.ticketManualEnabled).toBe(false)
    } finally {
      for (const channel of CHANNELS) {
        await setChannel('ticket', channel, before.paymentChannels.ticket[channel])
      }
    }
  })

  // El contrato anterior sigue vivo: un cliente que sólo conoce `*_manual` tiene
  // que seguir logrando el mismo efecto observable.
  it('el alias manual del contrato anterior escribe los dos canales manuales', async () => {
    const before = await toggles()
    try {
      const opened = await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: 'membership_manual',
        p_enabled: true,
        p_actor: MATRIX_ACTOR,
      })
      if (opened.error) throw new Error(opened.error.message)
      expect(opened.data.paymentChannels.membership.bank_transfer).toBe(true)
      expect(opened.data.paymentChannels.membership.cash_pitbull).toBe(true)
      expect(opened.data.membershipManualEnabled).toBe(true)
      // La pasarela no se toca con el alias.
      expect(opened.data.paymentChannels.membership.mercado_pago).toBe(
        before.paymentChannels.membership.mercado_pago,
      )
      // Wise tampoco: cobra en USD y el contrato anterior no lo conocía, así
      // que abrir "los dos canales manuales" no puede reabrir el cobro del
      // exterior de arrastre. El setter escribe sólo bank_transfer y
      // cash_pitbull (`staff_set_platform_feature_toggle`).
      expect(opened.data.paymentChannels.membership.wise_transfer).toBe(
        before.paymentChannels.membership.wise_transfer,
      )

      const closed = await admin.rpc('staff_set_platform_feature_toggle', {
        p_feature: 'membership_manual',
        p_enabled: false,
        p_actor: MATRIX_ACTOR,
      })
      if (closed.error) throw new Error(closed.error.message)
      expect(closed.data.paymentChannels.membership.bank_transfer).toBe(false)
      expect(closed.data.paymentChannels.membership.cash_pitbull).toBe(false)
    } finally {
      for (const channel of CHANNELS) {
        await setChannel('membership', channel, before.paymentChannels.membership[channel])
      }
    }
  })

  it('rechaza un concepto o un canal fuera de la lista blanca', async () => {
    for (const args of [
      { p_concept: 'combo', p_channel: 'mercado_pago' },
      { p_concept: 'membership', p_channel: 'paypal' },
    ]) {
      const result = await admin.rpc('staff_set_payment_channel', {
        ...args,
        p_enabled: false,
        p_actor: MATRIX_ACTOR,
      })
      expect(result.error, JSON.stringify(args)).toBeTruthy()
    }
  })

  it('deja el cambio en la auditoría con el valor anterior', async () => {
    const before = await toggles()
    const target = before.paymentChannels.registration.cash_pitbull
    await setChannel('registration', 'cash_pitbull', !target)
    try {
      const audit = await admin
        .from('domain_audit_logs')
        .select('action, entity_id, metadata')
        .eq('action', 'platform_payment_channel.updated')
        .eq('entity_id', 'registration:cash_pitbull')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (audit.error) throw new Error(audit.error.message)
      expect(audit.data?.metadata).toMatchObject({
        concept: 'registration',
        channel: 'cash_pitbull',
        enabled: !target,
        previousEnabled: target,
      })
    } finally {
      await setChannel('registration', 'cash_pitbull', target)
    }
  })
})
