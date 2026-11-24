import { HttpError } from '../lib/errors.js'
import {
  assertSupabaseResult,
  isMissingRelation,
  isMissingSchemaColumn,
} from '../lib/supabaseRpc.js'
import { attachAthleteMatch } from './liftingResultImport.js'

const SHEET_COLUMNS = [
  'athlete_name',
  'sex',
  'age',
  'division',
  'category',
  'bodyweight_kg',
  'equipment',
  'team_name',
  'place',
  'squat1_kg',
  'squat2_kg',
  'squat3_kg',
  'bench1_kg',
  'bench2_kg',
  'bench3_kg',
  'deadlift1_kg',
  'deadlift2_kg',
  'deadlift3_kg',
  'best_squat_kg',
  'best_bench_kg',
  'best_deadlift_kg',
  'total_kg',
].join(', ')

const MISSING_SHEET = 'La planilla de resultados todavía no está en la base.'
const SHEET_PAGE = 1000
const SHEET_MAX = 5000
const GYM_PAGE = 1000
const GYM_MAX = 20000

/**
 * Une una página al acumulado. Una página corta cierra la lectura.
 * Si la siguiente página pasaría el máximo, no se recorta: el llamador
 * tiene que fallar en vez de publicar un ganador con atletas faltantes.
 */
export function absorbPage(collected, page, { pageSize, max }) {
  const rows = Array.isArray(page) ? page : []
  if (collected.length + rows.length > max) {
    return { rows: collected, truncated: true, done: true }
  }
  return {
    rows: collected.concat(rows),
    truncated: false,
    done: rows.length < pageSize,
  }
}

function asNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function readSheet(result, fallback) {
  if (result?.error && (isMissingRelation(result.error) || isMissingSchemaColumn(result.error))) {
    throw new HttpError(503, MISSING_SHEET)
  }
  return assertSupabaseResult(result, fallback)
}

export function toStoredMeetRow(row) {
  return {
    athlete_name: row.athleteName,
    sex: row.sex ?? null,
    age: row.age == null ? null : Math.trunc(Number(row.age)),
    division: row.division ?? null,
    category: row.category ?? null,
    bodyweight_kg: asNumber(row.bodyweightKg),
    equipment: row.equipment ?? null,
    team_name: row.teamName ?? null,
    place: row.place == null ? null : Math.trunc(Number(row.place)),
    squat1_kg: asNumber(row.squat1Kg),
    squat2_kg: asNumber(row.squat2Kg),
    squat3_kg: asNumber(row.squat3Kg),
    bench1_kg: asNumber(row.bench1Kg),
    bench2_kg: asNumber(row.bench2Kg),
    bench3_kg: asNumber(row.bench3Kg),
    deadlift1_kg: asNumber(row.deadlift1Kg),
    deadlift2_kg: asNumber(row.deadlift2Kg),
    deadlift3_kg: asNumber(row.deadlift3Kg),
    best_squat_kg: asNumber(row.bestSquatKg),
    best_bench_kg: asNumber(row.bestBenchKg),
    best_deadlift_kg: asNumber(row.bestDeadliftKg),
    total_kg: asNumber(row.totalKg),
    formula: 'dots',
    source: 'liftingcast',
  }
}

export function fromStoredMeetRow(row) {
  return {
    athleteName: row.athlete_name,
    sex: row.sex ?? null,
    age: asNumber(row.age),
    division: row.division ?? null,
    category: row.category ?? null,
    bodyweightKg: asNumber(row.bodyweight_kg),
    equipment: row.equipment ?? null,
    teamName: row.team_name ?? null,
    place: asNumber(row.place),
    squat1Kg: asNumber(row.squat1_kg),
    squat2Kg: asNumber(row.squat2_kg),
    squat3Kg: asNumber(row.squat3_kg),
    bench1Kg: asNumber(row.bench1_kg),
    bench2Kg: asNumber(row.bench2_kg),
    bench3Kg: asNumber(row.bench3_kg),
    deadlift1Kg: asNumber(row.deadlift1_kg),
    deadlift2Kg: asNumber(row.deadlift2_kg),
    deadlift3Kg: asNumber(row.deadlift3_kg),
    bestSquatKg: asNumber(row.best_squat_kg),
    bestBenchKg: asNumber(row.best_bench_kg),
    bestDeadliftKg: asNumber(row.best_deadlift_kg),
    totalKg: asNumber(row.total_kg),
  }
}

export async function loadSiteEvent(client, slug) {
  const event = readSheet(
    await client.from('events').select('id, slug, title, published').eq('slug', slug).maybeSingle(),
    'No se pudo leer el evento.',
  )
  if (!event?.id) throw new HttpError(404, 'No encontramos ese evento.')
  return event
}

export async function readMeetSheet(client, eventId) {
  let collected = []
  while (collected.length <= SHEET_MAX) {
    const from = collected.length
    const page = readSheet(
      await client
        .from('event_meet_results')
        .select(SHEET_COLUMNS)
        .eq('event_id', eventId)
        .order('place', { ascending: true, nullsFirst: false })
        .order('athlete_name', { ascending: true })
        .range(from, from + SHEET_PAGE - 1),
      'No se pudo leer la planilla.',
    )
    const step = absorbPage(collected, page, { pageSize: SHEET_PAGE, max: SHEET_MAX })
    if (step.truncated) {
      throw new HttpError(400, 'La planilla supera el máximo que podemos publicar.')
    }
    collected = step.rows
    if (step.done) break
  }
  return collected.map(fromStoredMeetRow)
}

export async function replaceMeetSheet(client, eventId, rows) {
  const inserted = readSheet(
    await client.rpc('replace_event_meet_results', {
      p_event_id: eventId,
      p_rows: rows.map(toStoredMeetRow),
    }),
    'No se pudo guardar la planilla.',
  )
  const count = Number(inserted)
  if (!Number.isFinite(count) || count < 1) {
    throw new HttpError(400, 'No hay filas válidas para guardar.')
  }
  return count
}

export async function listPublishedMeetSlugs(client) {
  const rows = readSheet(
    await client.rpc('list_published_meet_slugs'),
    'No se pudo leer las planillas publicadas.',
  )
  if (!Array.isArray(rows)) return []
  return rows.map((row) => (typeof row === 'string' ? row : row?.slug)).filter(Boolean)
}

/**
 * El equipo del CSV manda. Si viene vacío, se usa el gimnasio de la ficha
 * solo cuando el nombre coincide con una sola persona.
 */
export async function matchAthleteGyms(client, rows) {
  let collected = []
  let truncated = false
  while (!truncated && collected.length <= GYM_MAX) {
    const from = collected.length
    const page = readSheet(
      await client
        .from('athletes')
        .select('full_name, gym')
        .not('gym', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + GYM_PAGE - 1),
      'No se pudo leer el padrón de gimnasios.',
    )
    const step = absorbPage(collected, page, { pageSize: GYM_PAGE, max: GYM_MAX })
    collected = step.rows
    truncated = step.truncated
    if (step.done) break
  }
  // Un padrón cortado puede hacer ver único a un nombre que se repite más adelante.
  const athletes = truncated
    ? []
    : collected
        .filter((athlete) => athlete?.full_name && athlete?.gym)
        .map((athlete) => ({
          firstName: athlete.full_name,
          lastName: '',
          gym: athlete.gym,
        }))
  return attachAthleteMatch(rows, athletes)
}
