import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatScheduleSummary,
  formatSessionDetail,
  hasScheduledDay,
  toCamelEventSchedule,
  toCamelSchedule,
} from '../src/lib/eventSchedule.js'
import { buildCheckinRows } from '../src/services/checkinWorkspaceService.js'
import { resolveRegistrationScan, scheduleDayIndexes } from '../src/services/checkinScanService.js'

/**
 * Grilla de competencia: qué día y en qué tanda compite cada inscripto
 * (migración 20260806230000).
 *
 * Las verificaciones sobre el SQL son de texto, como el resto de los tests de
 * migración del repo; el comportamiento se valida ejecutando la migración
 * contra Postgres.
 */

vi.mock('../src/services/athleteApi.js', () => ({
  getMembershipByCodeOrToken: vi.fn(),
  getStaffMembershipCredential: vi.fn(),
}))

const { getMembershipByCodeOrToken } = await import('../src/services/athleteApi.js')

afterEach(() => {
  vi.resetAllMocks()
})

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260806230000_event_registration_schedule.sql'),
  'utf8',
)

const previousUpsert = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260722140000_staff_upsert_event_lint_cleanup.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

const SCHEDULE_ROW = {
  day_id: 'day-2',
  day_index: 1,
  day_label: 'Día 2',
  day_date: '2026-11-14',
  session_id: 'ses-b',
  session_name: 'Tanda B',
  platform: 'Plataforma 1',
  weigh_in_at: '2026-11-14T11:30:00.000Z',
  starts_at: '2026-11-14T13:00:00.000Z',
}

describe('modelo de grilla en la migración', () => {
  it('los días del evento dejan de recrearse en cada guardado', () => {
    // Antes era delete + insert, así que los ids rotaban. Con la grilla
    // colgando de ahí, editar el evento habría borrado la asignación.
    const before = functionBody(
      previousUpsert,
      'create or replace function public.staff_upsert_event(',
    )
    expect(before).toContain('delete from public.event_days where event_id = v_event.id;')

    const after = functionBody(migration, 'create or replace function public.staff_upsert_event(')
    expect(after).not.toContain('delete from public.event_days where event_id = v_event.id;')
    expect(after).toContain('on conflict (event_id, day_index) do update set')
  })

  it('avisa antes de borrar un día que ya tiene grilla armada', () => {
    const upsert = functionBody(migration, 'create or replace function public.staff_upsert_event(')
    expect(upsert).toContain('ya tiene tandas o atletas asignados')
    expect(upsert).toContain("using errcode = 'PLU07'")
  })

  it('las FK compuestas atan la tanda a su día y el día a su evento', () => {
    // Sin esto se podría asignar una inscripción a un día de otro evento, o a
    // una tanda que no es de ese día.
    expect(migration).toContain('references public.event_days (id, event_id) on delete restrict')
    expect(migration).toContain(
      'references public.event_sessions (id, event_day_id) on delete restrict',
    )
  })

  it('prohíbe tanda sin día, que las FK MATCH SIMPLE dejarían pasar', () => {
    expect(migration).toContain('check (event_session_id is null or event_day_id is not null)')
  })

  it('la asignación masiva filtra por evento y descarta canceladas', () => {
    const assign = functionBody(
      migration,
      'create or replace function public.staff_assign_registration_schedule(',
    )
    expect(assign).toContain('r.id = any (p_registration_ids)')
    expect(assign).toContain('and r.event_id = v_event.id')
    expect(assign).toContain("and r.status <> 'cancelada'")
    // El día sale de la tanda: pedirlos por separado los desincroniza.
    expect(assign).toContain('v_day_id := v_session.event_day_id')
    expect(assign).toContain("'registration.schedule_assigned'")
  })

  it('reporta cuántas se asignaron de verdad, no cuántas se pidieron', () => {
    const assign = functionBody(
      migration,
      'create or replace function public.staff_assign_registration_schedule(',
    )
    expect(assign).toContain('get diagnostics v_updated = row_count')
    expect(assign).toContain("'requested', v_requested")
  })

  it('no borra una tanda que todavía tiene atletas asignados', () => {
    const save = functionBody(
      migration,
      'create or replace function public.staff_save_event_sessions(',
    )
    expect(save).toContain('todavía tiene atletas asignados')
    expect(save).toContain("using errcode = 'PLU07'")
  })

  it('la credencial escaneada devuelve la grilla y la fecha del evento', () => {
    const lookup = functionBody(
      migration,
      'create or replace function plu_private.get_membership_by_code_or_token(',
    )
    expect(lookup).toContain("'schedule', plu_private.registration_schedule(r)")
    expect(lookup).toContain("'event_starts_at', e.starts_at")
    expect(lookup).toContain("'schedule', v_schedule")
  })

  it('la proyección pública sigue sin filtrar tokens', () => {
    const lookup = functionBody(
      migration,
      'create or replace function plu_private.get_membership_by_code_or_token(',
    )
    const projection = lookup.slice(lookup.indexOf('return jsonb_build_object'))
    expect(projection).not.toContain('credential_token')
    expect(projection).not.toContain('qr_token')
  })

  it('las RPC de grilla son solo para service_role', () => {
    for (const signature of [
      'public.staff_get_event_schedule(text)',
      'public.staff_save_event_sessions(text, jsonb, text)',
      'public.staff_assign_registration_schedule(text, uuid[], int, uuid, text)',
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`)
      expect(migration).toContain(`grant execute on function ${signature}`)
    }
    expect(migration).not.toContain(
      'grant execute on function public.staff_assign_registration_schedule(text, uuid[], int, uuid, text)\n  to authenticated',
    )
  })
})

describe('formato de la grilla', () => {
  it('arma la línea que lee seguridad en la puerta', () => {
    const schedule = toCamelSchedule(SCHEDULE_ROW)
    expect(formatScheduleSummary(schedule)).toBe('Día 2 · sáb 14 nov · Tanda B')
  })

  it('separa la logística de la tanda del resumen', () => {
    const schedule = toCamelSchedule(SCHEDULE_ROW)
    const detail = formatSessionDetail(schedule, 'es', { weighIn: 'Pesaje', starts: 'Inicio' })
    expect(detail).toContain('Pesaje')
    expect(detail).toContain('Plataforma 1')
  })

  it('sin día asignado no inventa un resumen', () => {
    // "A confirmar" es un estado legítimo: al pagar todavía no hay grilla.
    expect(toCamelSchedule(null)).toBeNull()
    expect(hasScheduledDay(null)).toBe(false)
    expect(formatScheduleSummary(null)).toBe('')
  })

  it('con día pero sin tanda muestra el día y omite la logística', () => {
    const schedule = toCamelSchedule({
      day_id: 'day-1',
      day_index: 0,
      day_label: 'Día 1',
      day_date: '2026-11-13',
      session_id: null,
      session_name: null,
    })
    expect(formatScheduleSummary(schedule)).toBe('Día 1 · vie 13 nov')
    expect(formatSessionDetail(schedule)).toBe('')
  })

  it('normaliza la grilla del evento que devuelve el panel', () => {
    const schedule = toCamelEventSchedule({
      eventSlug: 'pitbull-classic-2026',
      days: [{ id: 'day-1', dayIndex: 0, label: 'Día 1', assignedCount: 12 }],
      sessions: [{ id: 'ses-a', dayIndex: 0, name: 'Tanda A', assignedCount: 6 }],
      unassignedCount: 4,
    })
    expect(schedule.days[0].assignedCount).toBe(12)
    expect(schedule.sessions[0].name).toBe('Tanda A')
    expect(schedule.unassignedCount).toBe(4)
  })
})

describe('la grilla en el roster de check-in', () => {
  it('un atleta con día asignado deja de figurar en todos los días', () => {
    // Antes iba fijo a 'all' y aparecía en la pestaña de cada día.
    expect(scheduleDayIndexes(toCamelSchedule(SCHEDULE_ROW))).toEqual([1])
  })

  it('sin grilla asignada sigue entrando en cualquier día', () => {
    // No se lo saca del roster: todavía no le asignaron nada.
    expect(scheduleDayIndexes(null)).toBe('all')
  })

  it('la fila del roster arrastra el día real de la inscripción', () => {
    const [row] = buildCheckinRows({
      athletes: [{ id: 'ath-1', fullName: 'Ana Torres', documentId: '30111222' }],
      registrations: [
        {
          id: 'reg-1',
          athleteId: 'ath-1',
          eventSlug: 'pitbull-classic-2026',
          status: 'confirmada',
          category: 'Raw',
          division: 'Open',
          schedule: toCamelSchedule(SCHEDULE_ROW),
        },
      ],
      eventSlug: 'pitbull-classic-2026',
    })

    expect(row.dayIndexes).toEqual([1])
    expect(row.schedule.sessionName).toBe('Tanda B')
  })
})

describe('escaneo de un inscripto sin afiliación', () => {
  function credentialWithoutMembership() {
    return {
      athlete: { id: 'ath-9', fullName: 'Lucas Ferro', documentId: '31222333' },
      // Evento con requires_membership = false: no hay fila en memberships.
      membership: null,
      registration: {
        id: 'reg-9',
        status: 'confirmada',
        category: 'Raw',
        division: 'Open',
        checkedInAt: null,
        schedule: toCamelSchedule(SCHEDULE_ROW),
      },
    }
  }

  it('lo habilita en la puerta en vez de rebotarlo como no encontrado', async () => {
    // Regresión: el escáner exigía membresía, así que un atleta inscripto y
    // pagado a un evento que no la pide daba "credencial no encontrada".
    getMembershipByCodeOrToken.mockResolvedValue(credentialWithoutMembership())

    const result = await resolveRegistrationScan(
      { code: 'a4f1c0de-0000-4000-8000-000000000009', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(result.outcome).toBe('ready')
    expect(result.canCheckIn).toBe(true)
    expect(result.row.membershipStatus).toBeNull()
    expect(result.row.schedule.sessionName).toBe('Tanda B')
  })

  it('sin inscripción al evento tampoco rompe la fila por falta de afiliación', async () => {
    getMembershipByCodeOrToken.mockResolvedValue({
      athlete: { id: 'ath-9', fullName: 'Lucas Ferro', documentId: '31222333' },
      membership: null,
      registration: null,
    })

    const result = await resolveRegistrationScan(
      { code: 'a4f1c0de-0000-4000-8000-000000000009', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(result.outcome).toBe('no_registration')
    expect(result.row.id).toBe('ath-ath-9')
  })

  it('un código que no resuelve a nadie sigue siendo not_found', async () => {
    getMembershipByCodeOrToken.mockResolvedValue({ athlete: null, membership: null })

    const result = await resolveRegistrationScan(
      { code: 'no-existe', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(result.outcome).toBe('not_found')
  })
})

/**
 * Identidad en la credencial y acotado de torneos
 * (migración 20260806250000).
 */
describe('identidad y torneos visibles en la credencial', () => {
  const identity = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260806250000_credential_identity_and_upcoming.sql',
    ),
    'utf8',
  )

  const lookup = functionBody(
    identity,
    'create or replace function plu_private.get_membership_by_code_or_token(',
  )

  it('devuelve documento y fecha de nacimiento para cotejar en la puerta', () => {
    expect(lookup).toContain("'document_id', v_athlete.document_id")
    expect(lookup).toContain("'birth_date', v_athlete.birth_date")
  })

  it('pero solo cuando el código era un token no adivinable', () => {
    // El member_code es correlativo: devolver PII por esa vía dejaría cosechar
    // el padrón iterando números de socio.
    expect(lookup).toContain('v_by_token boolean := false')
    expect(lookup).toContain('if v_by_token then')

    const byCodeBranch = lookup.slice(
      lookup.indexOf('where m.member_code = p_code'),
      lookup.indexOf('if v_athlete.id is null'),
    )
    expect(byCodeBranch).not.toContain('v_by_token := true')
  })

  it('la resolución por token sí habilita la identidad', () => {
    expect(lookup).toContain('v_by_token := v_athlete.id is not null')
  })

  it('lista los torneos vigentes contra el reloj, no contra events.status', () => {
    // `events.status` se edita a mano y queda viejo; la fecha no miente.
    const visible = functionBody(
      identity,
      'create or replace function plu_private.athlete_visible_registrations(',
    )
    expect(visible).toContain('(e.ends_at >= now()) as upcoming')
    expect(visible).not.toContain("e.status <> 'finalizado'")
  })

  it('acota la cantidad y ordena por proximidad', () => {
    const visible = functionBody(
      identity,
      'create or replace function plu_private.athlete_visible_registrations(',
    )
    expect(visible).toContain('order by event_starts_at limit p_limit')
    expect(lookup).toContain('plu_private.athlete_visible_registrations(v_athlete.id, 3)')
  })

  it('sin torneos vigentes devuelve el último, no una credencial muda', () => {
    const visible = functionBody(
      identity,
      'create or replace function plu_private.athlete_visible_registrations(',
    )
    expect(visible).toContain('where not exists (select 1 from ranked where upcoming)')
    expect(visible).toContain('order by event_starts_at desc')
  })

  it('la proyección de staff ve la identidad aunque resuelva por member_code', () => {
    const staff = functionBody(
      identity,
      'create or replace function public.staff_get_membership_by_code_or_token(',
    )
    expect(staff).toContain("'document_id', v_athlete.document_id")
    expect(staff).toContain("'birth_date', v_athlete.birth_date")
  })
})

/**
 * Tablero de armado y reparto sugerido (migración 20260806260000).
 */
describe('tablero de armado de grilla', () => {
  const boardSql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260806260000_event_schedule_board.sql'),
    'utf8',
  )

  it('devuelve el roster de cada tanda, no solo el conteo', () => {
    // Contar no dice si la Tanda G quedó con tres y la F con veintidós.
    const board = functionBody(boardSql, 'create or replace function public.staff_get_event_board(')
    expect(board).toContain("'athletes', (")
    expect(board).toContain("'unassigned', (")
  })

  it('muestra a los que tienen día pero todavía no tienen tanda', () => {
    // Si no se mostraran, esa gente desaparecería del tablero.
    const board = functionBody(boardSql, 'create or replace function public.staff_get_event_board(')
    expect(board).toContain("'withoutSession', (")
    expect(board).toContain('rows.event_day_id = d.id and rows.event_session_id is null')
  })

  it('ordena por competencia: categoría, división y después peso', () => {
    expect(boardSql).toContain(
      'order by rows.category, rows.division, rows.bodyweight_kg nulls last, rows.full_name',
    )
  })

  it('el tablero no expone PII: armar tandas no necesita documento', () => {
    const rows = functionBody(
      boardSql,
      'create or replace function plu_private.board_registration_rows(',
    )
    expect(rows).not.toContain('document_id')
    expect(rows).not.toContain('a.email')
  })

  it('el reparto sugerido solo toca a los que no tienen día', () => {
    // Pisar una decisión que la organización ya tomó a mano sería una trampa.
    const autofill = functionBody(
      boardSql,
      'create or replace function public.staff_autofill_event_day(',
    )
    expect(autofill).toContain('and r.event_day_id is null')
  })

  it('respeta lo que cada tanda ya tiene, así correrlo dos veces no desborda', () => {
    const autofill = functionBody(
      boardSql,
      'create or replace function public.staff_autofill_event_day(',
    )
    expect(autofill).toContain('v_room := p_max_per_session - v_taken')
    expect(autofill).toContain('if v_room <= 0 then continue; end if')
  })

  it('reporta cuántos quedaron sin lugar en vez de dar el reparto por completo', () => {
    const autofill = functionBody(
      boardSql,
      'create or replace function public.staff_autofill_event_day(',
    )
    expect(autofill).toContain("'placed', v_placed")
    expect(autofill).toContain("'remaining', (")
    expect(autofill).toContain("'registration.schedule_autofilled'")
  })

  it('las RPC del tablero son solo para service_role', () => {
    for (const signature of [
      'public.staff_get_event_board(text)',
      'public.staff_autofill_event_day(text, int, int, text)',
    ]) {
      expect(boardSql).toContain(`revoke all on function ${signature}`)
      expect(boardSql).toContain(`grant execute on function ${signature} to service_role`)
    }
  })
})
