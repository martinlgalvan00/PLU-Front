import {
  layoutPayloadForMerge,
} from '../../../src/lib/eventLandingLayout.js'
import {
  EMPTY_EVENT_LANDING_SLOTS,
  EVENT_LANDING_THEMES,
} from '../../../src/lib/eventLanding.js'
import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult, isMissingRelation } from '../../lib/supabaseRpc.js'

/**
 * Guardado de la landing de un evento (`rules.landing`).
 *
 * `staff_upsert_event` reconstruye `rules` clave por clave, así que la landing se
 * persiste aparte, en tres pasos que deben ir en este orden porque el primero
 * reconstruye `rules.landing` entero:
 *
 *   1. `staff_merge_event_landing`        plantilla histórica + tema + slots de texto
 *   2. `staff_merge_event_landing_state`  plantilla definitiva, switch público y fase
 *   3. `staff_merge_event_landing_layout` bloques y paleta del Constructor
 *
 * Cada paso tolera que su RPC todavía no exista en la base (despliegue
 * escalonado): el evento se guarda igual, con un respaldo directo o un aviso.
 */

const DEFAULT_THEME = 'plu-default'

/** `rules.landing` actual y las reglas completas, para el respaldo directo. */
async function readLandingRules(client, slug) {
  const reader = client.from('events').select('rules').eq('slug', slug)
  // Un adaptador sin `maybeSingle` no puede hacer el respaldo directo: la RPC
  // principal ya guardó lo suyo y esa limitación no debe volverse un 500.
  if (typeof reader?.maybeSingle !== 'function') return null
  const current = assertSupabaseResult(
    await client.from('events').select('rules').eq('slug', slug).maybeSingle(),
    'No se pudo leer la configuracion de la landing.',
  )
  if (!current) throw new HttpError(404, 'El evento no existe.')
  const rules = current.rules && typeof current.rules === 'object' ? current.rules : {}
  const landing = rules.landing && typeof rules.landing === 'object' ? rules.landing : {}
  return { rules, landing }
}

/** Escribe `rules.landing = { ...landing, ...patch }` sin tocar el resto de `rules`. */
async function patchLandingRules(client, slug, patch, failureMessage) {
  const current = await readLandingRules(client, slug)
  if (!current) return
  assertSupabaseResult(
    await client
      .from('events')
      .update({ rules: { ...current.rules, landing: { ...current.landing, ...patch } } })
      .eq('slug', slug),
    failureMessage,
  )
}

/** Slots de texto completos; hero y cupo caen a `publicCopy` por compat con el panel viejo. */
function slotsForRpc(landing, publicCopy) {
  const own = landing?.slots ?? {}
  const copy = publicCopy ?? {}
  const fallback = {
    heroTitle: copy.publicTitle,
    heroLead: copy.heroLead,
    ctaLabel: copy.ctaLabel,
    inscriptionMark: copy.inscriptionMark,
    inscriptionNote: copy.inscriptionNote,
  }
  return Object.fromEntries(
    Object.keys(EMPTY_EVENT_LANDING_SLOTS).map((key) => [key, own[key] ?? fallback[key] ?? '']),
  )
}

async function saveSlots(client, event, { warn }) {
  const { landing, publicCopy, slug } = event
  const result = await client.rpc('staff_merge_event_landing', {
    p_slug: slug,
    p_landing: {
      // La RPC histórica solo conoce meet/editorial: la plantilla definitiva
      // (submission, builder) se persiste en el paso de estado.
      templateId: landing?.templateId === 'editorial' ? 'editorial' : 'meet',
      themeId: EVENT_LANDING_THEMES.includes(landing?.themeId) ? landing.themeId : DEFAULT_THEME,
      slots: slotsForRpc(landing, publicCopy),
    },
  })
  if (result.error && isMissingRelation(result.error)) {
    warn(
      '[eventos] `staff_merge_event_landing` no existe en esta base: el evento se guardó sin la plantilla de landing. Aplicá las migraciones 20261219100000_event_landing.sql y 20261220100000_event_landing_faq_seo.sql.',
    )
    return
  }
  assertSupabaseResult(result, 'No se pudo guardar la landing del evento.')
}

/** La RPC de estado anterior al Constructor rechaza `builder` con este mensaje. */
function rejectsBuilderTemplate(error, templateId) {
  return templateId === 'builder' && /Plantilla de landing inv/i.test(error?.message ?? '')
}

async function saveState(client, event) {
  const { landing, slug } = event
  const state = {
    templateId: landing?.templateId ?? 'meet',
    publicVisible: landing?.publicVisible !== false,
    phase: landing?.phase ?? 'coming_soon',
  }
  const result = await client.rpc('staff_merge_event_landing_state', {
    p_slug: slug,
    p_template_id: state.templateId,
    p_public_visible: state.publicVisible,
    p_phase: state.phase,
  })
  if (
    result.error &&
    (isMissingRelation(result.error) || rejectsBuilderTemplate(result.error, state.templateId))
  ) {
    await patchLandingRules(client, slug, state, 'No se pudo guardar la visibilidad de la landing.')
    return
  }
  assertSupabaseResult(result, 'No se pudo guardar la visibilidad de la landing.')
}

async function saveLayout(client, event) {
  const { landing, slug } = event
  if (!landing?.layout) return
  // Normalizado igual que lo validaría la RPC (topes, ids únicos, links seguros).
  const layout = layoutPayloadForMerge(landing.layout, { templateId: landing.templateId })
  const result = await client.rpc('staff_merge_event_landing_layout', {
    p_slug: slug,
    p_layout: layout,
  })
  if (result.error && isMissingRelation(result.error)) {
    await patchLandingRules(client, slug, { layout }, 'No se pudo guardar el layout de la landing.')
    return
  }
  assertSupabaseResult(result, 'No se pudo guardar el layout de la landing.')
}

/**
 * @param {object} client cliente de Supabase con service role
 * @param {{ slug: string, landing?: object, publicCopy?: object }} event evento ya validado
 * @param {{ warn?: (message: string) => void }} [options]
 */
export async function saveEventLanding(client, event, { warn = console.warn } = {}) {
  await saveSlots(client, event, { warn })
  await saveState(client, event)
  await saveLayout(client, event)
}
