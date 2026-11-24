import { offeringFromRules } from '../../shared/eventOffering.js'
import { diffRegistrationImportRow } from '../../shared/registrationSheet.js'

function embedded(value) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/** Fila de `findRegistrationImportContexts` → lo que compara `diffRegistrationImportRow`. */
export function importCurrentFromContext(row) {
  const athlete = embedded(row.athlete)
  const event = embedded(row.event)
  const bodyweight = row.bodyweight_kg == null ? null : Number(row.bodyweight_kg)
  return {
    division: row.division ?? '',
    secondaryDivision: row.secondary_division ?? '',
    category: row.category ?? '',
    modalities: row.modalities ?? ['full_power'],
    declaredWeightClass: row.declared_weight_class ?? '',
    bodyweightKg: Number.isFinite(bodyweight) ? bodyweight : null,
    isFirstMeet: row.is_first_meet === true ? true : row.is_first_meet === false ? false : null,
    competitionBestTotalKg:
      row.competition_best_total_kg == null ? null : Number(row.competition_best_total_kg),
    trainingBestTotalKg:
      row.training_best_total_kg == null ? null : Number(row.training_best_total_kg),
    status: row.status ?? '',
    sex: athlete?.sex ?? '',
    rosterFrozen: Boolean(event?.roster_frozen_at),
    offering: offeringFromRules(event?.rules),
  }
}

const COMPETITION_FIELDS = new Set(['division', 'category', 'bodyweightKg'])

/**
 * Importación de la planilla de inscripciones: compara cada fila con lo
 * guardado y, si `apply`, aplica las filas válidas con cambios.
 *
 * División, categoría y peso pasan por `correctRegistrationCompetition` (la
 * RPC auditada que salta el lock de la selección); la categoría de peso por
 * `updateDeclaredWeightClass`; las modalidades por un update directo. Una
 * fila que falla no frena al resto: queda como `failed` con su mensaje.
 *
 * @param {{
 *   repository: object,
 *   rows: { row: number, registrationId: string, values: Record<string, unknown> }[],
 *   apply?: boolean,
 *   eventSlug?: string|null,
 *   actor: string,
 * }} input
 */
export async function runRegistrationSheetImport({
  repository,
  rows,
  apply = false,
  eventSlug = null,
  actor,
}) {
  const ids = [...new Set(rows.map((row) => row.registrationId))]
  const contexts = ids.length ? await repository.findRegistrationImportContexts(ids) : []
  const contextById = new Map((contexts ?? []).map((context) => [context.id, context]))

  const results = rows.map(({ row, registrationId, values }) => {
    const context = contextById.get(registrationId)
    if (!context) {
      return {
        row,
        registrationId,
        state: 'invalid',
        changes: [],
        warnings: [],
        errors: [{ field: 'registrationId', code: 'NOT_FOUND' }],
      }
    }
    const athlete = embedded(context.athlete)
    const event = embedded(context.event)
    const base = {
      row,
      registrationId,
      athlete: athlete?.full_name ?? '',
      event: event?.title ?? event?.slug ?? '',
    }
    if (eventSlug && event?.slug !== eventSlug) {
      return {
        ...base,
        state: 'invalid',
        changes: [],
        warnings: [],
        errors: [{ field: 'registrationId', code: 'OTHER_EVENT' }],
      }
    }
    const { changes, errors, warnings, next } = diffRegistrationImportRow(
      importCurrentFromContext(context),
      values,
    )
    const state = errors.length ? 'invalid' : changes.length ? 'changed' : 'unchanged'
    return { ...base, state, changes, errors, warnings, next }
  })

  if (apply) {
    for (const result of results) {
      if (result.state !== 'changed') continue
      const fields = new Set(result.changes.map((change) => change.field))
      try {
        if ([...fields].some((field) => COMPETITION_FIELDS.has(field))) {
          await repository.correctRegistrationCompetition(
            result.registrationId,
            {
              division: result.next.division,
              category: result.next.category,
              bodyweightKg: result.next.bodyweightKg,
            },
            actor,
          )
        }
        if (fields.has('declaredWeightClass')) {
          await repository.updateDeclaredWeightClass(
            result.registrationId,
            result.next.declaredWeightClass,
            actor,
          )
        }
        if (fields.has('modalities')) {
          await repository.updateRegistrationModalities(
            result.registrationId,
            result.next.modalities,
          )
        }
        if (fields.has('firstMeet') || fields.has('declaredTotalKg')) {
          await repository.updateRegistrationDeclaredTotals(result.registrationId, {
            isFirstMeet: result.next.isFirstMeet,
            competitionBestTotalKg: result.next.competitionBestTotalKg,
            trainingBestTotalKg: result.next.trainingBestTotalKg,
          })
        }
        result.state = 'applied'
      } catch (error) {
        result.state = 'failed'
        result.message = error?.message ?? 'No se pudo aplicar el cambio.'
      }
    }
  }

  const count = (state) => results.filter((result) => result.state === state).length
  return {
    applied: apply,
    summary: {
      total: results.length,
      changed: count('changed'),
      unchanged: count('unchanged'),
      invalid: count('invalid'),
      applied: count('applied'),
      failed: count('failed'),
    },
    // `next` es interno: el cliente solo necesita qué cambia.
    rows: results.map(({ next: _next, ...result }) => result),
  }
}
