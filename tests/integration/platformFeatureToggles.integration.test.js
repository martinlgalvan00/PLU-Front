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
