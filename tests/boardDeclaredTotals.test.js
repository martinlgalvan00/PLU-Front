import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toCamelEventBoard } from '../src/services/eventRegistrationApi.js'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20270111100000_board_declared_totals.sql'),
  'utf8',
)

describe('tablero con máximo total declarado', () => {
  it('trae el total de la inscripción y no el del perfil', () => {
    expect(sql).toContain('r.is_first_meet')
    expect(sql).toContain('r.competition_best_total_kg')
    expect(sql).toContain('r.training_best_total_kg')
    expect(sql).not.toContain('declared_best_total_kg')
    expect(sql.match(/'competitionBestTotalKg', rows.competition_best_total_kg/g)).toHaveLength(3)
  })

  it('no publica el número: la grilla pública no se toca', () => {
    expect(sql).not.toContain('public_event_schedule')
    expect(sql).not.toContain('document_id')
    expect(sql).not.toContain('a.email')
  })

  it('sigue ordenando por peso corporal', () => {
    expect(sql.match(/rows.bodyweight_kg nulls last, rows.full_name/g)).toHaveLength(3)
    expect(sql).not.toContain('competition_best_total_kg nulls last')
  })

  it('el tablero queda solo para service_role', () => {
    expect(sql).toContain(
      'revoke all on function public.staff_get_event_board(text) from public, anon, authenticated',
    )
    expect(sql).toContain(
      'grant execute on function public.staff_get_event_board(text) to service_role',
    )
    expect(sql).toContain(
      'revoke all on function plu_private.board_registration_rows(uuid)',
    )
  })

  it('normaliza el total que devuelve el tablero', () => {
    const board = toCamelEventBoard({
      unassigned: [
        {
          registration_id: 'reg-1',
          full_name: 'Ana',
          is_first_meet: false,
          competition_best_total_kg: '500.00',
          training_best_total_kg: null,
        },
        {
          registrationId: 'reg-2',
          fullName: 'Luis',
        },
      ],
    })

    expect(board.unassigned[0]).toMatchObject({
      isFirstMeet: false,
      competitionBestTotalKg: 500,
      trainingBestTotalKg: null,
    })
    expect(board.unassigned[1]).toMatchObject({
      isFirstMeet: null,
      competitionBestTotalKg: null,
      trainingBestTotalKg: null,
    })
  })
})
