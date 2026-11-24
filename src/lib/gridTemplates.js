/**
 * gridTemplates.js — PLU ARG
 *
 * Plantillas de grilla: la decisión de "cómo se arma" (tablados, tope por tanda,
 * qué separa las tandas, horarios) separada de lo que es del evento (días,
 * atletas). Las predefinidas viven acá; las propias de la organización las
 * guarda el backend con esta misma forma.
 *
 * Todo es puro: convertir una plantilla en opciones del planificador y volver,
 * y leer/escribir las clases de peso que tipea la organización.
 */
import { DEFAULT_PLAN_OPTIONS } from '../services/eventBoardPlanner.js'

export const MAX_TEMPLATE_PLATFORMS = 2

const GROUP_KEYS = ['sex', 'category', 'division']

/** Plantillas incluidas: puntos de partida razonables, no datos del torneo. */
export const BUILT_IN_TEMPLATES = Object.freeze([
  {
    id: 'builtin:double-balanced',
    builtIn: true,
    name: 'Doble tablado · carga pareja',
    config: {
      platforms: ['Tablado 1', 'Tablado 2'],
      maxPerSession: 12,
      groupBy: ['sex', 'category'],
      sortBy: 'weight',
      mergeSmall: true,
      platformMode: 'balance',
      weightClasses: null,
      schedule: null,
    },
  },
  {
    id: 'builtin:double-by-sex',
    builtIn: true,
    name: 'Doble tablado · un sexo por tablado',
    config: {
      platforms: ['Tablado 1', 'Tablado 2'],
      maxPerSession: 12,
      groupBy: ['sex', 'category'],
      sortBy: 'weight',
      mergeSmall: true,
      platformMode: 'sex',
      weightClasses: null,
      schedule: null,
    },
  },
  {
    id: 'builtin:single',
    builtIn: true,
    name: 'Un tablado · por sexo y peso',
    config: {
      platforms: ['Tablado 1'],
      maxPerSession: 12,
      groupBy: ['sex', 'category'],
      sortBy: 'weight',
      mergeSmall: true,
      platformMode: 'balance',
      weightClasses: null,
      schedule: null,
    },
  },
])

/** Un tope de clase por debajo de esto no es un peso corporal: es un error de tipeo. */
const MIN_CLASS_KG = 20

/**
 * "47, 52 57.5" → [47, 52, 57.5]. `invalid` avisa si algún pedazo no era un peso.
 *
 * La coma separa la lista, así que los decimales van con punto: "63,5" son dos
 * pedazos (63 y 5) y el 5 se marca inválido en vez de colarse como una clase.
 */
export function parseWeightClasses(input) {
  const tokens = String(input ?? '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
  const values = []
  let invalid = false
  for (const token of tokens) {
    const value = Number(token)
    if (!Number.isFinite(value) || value < MIN_CLASS_KG || value > 300) invalid = true
    else values.push(value)
  }
  return { values: [...new Set(values)].sort((a, b) => a - b), invalid }
}

export function formatWeightClasses(values) {
  return Array.isArray(values) ? values.join(', ') : ''
}

/** Normaliza `weightClasses`: sin ninguna clase cargada es null (no hay clases). */
function normalizeWeightClasses(raw) {
  const result = {}
  for (const sex of ['Femenino', 'Masculino']) {
    const values = Array.isArray(raw?.[sex])
      ? [...new Set(raw[sex].map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort(
          (a, b) => a - b,
        )
      : []
    if (values.length > 0) result[sex] = values
  }
  return Object.keys(result).length > 0 ? result : null
}

function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const firstStart = String(raw.firstStart ?? '').trim()
  const sessionMinutes = Number(raw.sessionMinutes)
  const perAthlete = Number(raw.minutesPerAthlete)
  const hasPerAthlete = Number.isFinite(perAthlete) && perAthlete > 0
  if (
    !/^\d{1,2}:\d{2}$/.test(firstStart) ||
    (!hasPerAthlete && (!Number.isFinite(sessionMinutes) || sessionMinutes < 1))
  ) {
    return null
  }
  const gap = Number(raw.gapMinutes)
  const lead = Number(raw.weighInLeadMinutes)
  return {
    firstStart,
    sessionMinutes: Number.isFinite(sessionMinutes) && sessionMinutes >= 1 ? sessionMinutes : 45,
    ...(hasPerAthlete ? { minutesPerAthlete: perAthlete } : {}),
    gapMinutes: Number.isFinite(gap) && gap >= 0 ? gap : 0,
    weighInLeadMinutes: Number.isFinite(lead) && lead >= 0 ? lead : 0,
  }
}

/**
 * Opciones del planificador a partir de una plantilla (guardada o predefinida).
 * Lo que la plantilla no trae toma el valor por defecto: una plantilla vieja
 * sigue siendo aplicable cuando el planificador gana opciones.
 */
export function optionsFromConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  const maxPerSession = Number(source.maxPerSession)
  return {
    maxPerSession:
      Number.isFinite(maxPerSession) && maxPerSession >= 1
        ? Math.min(100, Math.round(maxPerSession))
        : DEFAULT_PLAN_OPTIONS.maxPerSession,
    groupBy: Array.isArray(source.groupBy)
      ? GROUP_KEYS.filter((key) => source.groupBy.includes(key))
      : [...DEFAULT_PLAN_OPTIONS.groupBy],
    sortBy: source.sortBy === 'age' ? 'age' : 'weight',
    mergeSmall: source.mergeSmall !== false,
    platformMode: ['balance', 'alternate', 'sex'].includes(source.platformMode)
      ? source.platformMode
      : DEFAULT_PLAN_OPTIONS.platformMode,
    weightClasses: normalizeWeightClasses(source.weightClasses),
    schedule: normalizeSchedule(source.schedule),
  }
}

/** Nombres de tablado de una plantilla, recortados y sin repetir (1 a 2). */
export function platformNamesFromConfig(config) {
  const names = []
  for (const raw of Array.isArray(config?.platforms) ? config.platforms : []) {
    const name = String(raw ?? '').trim().slice(0, 80)
    if (name && !names.some((item) => item.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  return names.slice(0, MAX_TEMPLATE_PLATFORMS)
}

/** Lo que se guarda: la configuración del asistente, sin días ni atletas. */
export function configFromState({ options, platformNames }) {
  return {
    platforms: platformNames.map((name) => String(name).trim()).filter(Boolean),
    maxPerSession: Math.max(1, Math.round(Number(options.maxPerSession) || 12)),
    groupBy: GROUP_KEYS.filter((key) => options.groupBy?.includes(key)),
    sortBy: options.sortBy === 'age' ? 'age' : 'weight',
    mergeSmall: options.mergeSmall !== false,
    platformMode: options.platformMode,
    weightClasses: normalizeWeightClasses(options.weightClasses),
    schedule: normalizeSchedule(options.schedule),
  }
}
