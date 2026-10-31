import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  carryDeclaredTotalOnModeChange,
  optionalDeclaredTotalKg,
  registrationDeclaredTotalView,
  resolveRegistrationDeclaredTotals,
} from '../shared/declaredMeetTotal.js'
import { diffRegistrationImportRow } from '../shared/registrationSheet.js'
import { normalizeEventOffering } from '../shared/eventOffering.js'

const migration = readFileSync(
  'supabase/migrations/20270110100000_registration_declared_totals.sql',
  'utf8',
)

const current = {
  division: 'Open',
  category: 'Raw',
  modalities: ['full_power'],
  declaredWeightClass: '83',
  bodyweightKg: 82,
  status: 'confirmada',
  sex: 'Masculino',
  rosterFrozen: false,
  offering: normalizeEventOffering(null),
  isFirstMeet: false,
  competitionBestTotalKg: 500,
  trainingBestTotalKg: null,
}

describe('máximo total declarado', () => {
  it('guarda el de competencia y descarta el de entrenamiento', () => {
    expect(
      resolveRegistrationDeclaredTotals({
        firstMeet: false,
        competitionBestTotalKg: '625,5 kg',
        trainingBestTotalKg: 400,
      }),
    ).toEqual({
      ok: true,
      isFirstMeet: false,
      competitionBestTotalKg: 625.5,
      trainingBestTotalKg: null,
    })
  })

  it('en el primer torneo guarda sólo el máximo entrenando', () => {
    expect(
      resolveRegistrationDeclaredTotals({
        firstMeet: true,
        competitionBestTotalKg: 700,
        trainingBestTotalKg: '480.25',
      }),
    ).toEqual({
      ok: true,
      isFirstMeet: true,
      competitionBestTotalKg: null,
      trainingBestTotalKg: 480.25,
    })
  })

  it('el perfil acepta el mismo texto que la inscripción y deja vacío en null', () => {
    expect(optionalDeclaredTotalKg('')).toBeNull()
    expect(optionalDeclaredTotalKg('625,5 kg')).toBe(625.5)
    expect(optionalDeclaredTotalKg('9')).toBeNull()
  })

  it('al marcar primer torneo el número escrito pasa al máximo entrenando', () => {
    expect(
      carryDeclaredTotalOnModeChange({
        competition: '625,5',
        training: '',
        firstMeet: true,
      }),
    ).toEqual({ firstMeet: true, competition: '625,5', training: '625,5' })
  })

  it('no pisa un máximo entrenando que ya estaba cargado', () => {
    expect(
      carryDeclaredTotalOnModeChange({
        competition: '700',
        training: '480',
        firstMeet: true,
      }),
    ).toEqual({ firstMeet: true, competition: '700', training: '480' })
  })

  it('al desmarcar primer torneo recupera el número si el de competencia está vacío', () => {
    expect(
      carryDeclaredTotalOnModeChange({
        competition: '  ',
        training: '500',
        firstMeet: false,
      }),
    ).toEqual({ firstMeet: false, competition: '500', training: '500' })
  })

  it('una inscripción vieja no inventa el total', () => {
    expect(registrationDeclaredTotalView({ isFirstMeet: null })).toBeNull()
    expect(
      registrationDeclaredTotalView({
        isFirstMeet: true,
        trainingBestTotalKg: '410.00',
      }),
    ).toEqual({ kg: 410, source: 'training', firstMeet: true })
  })

  it('la planilla puede corregir el total sin tocar el resto', () => {
    const result = diffRegistrationImportRow(current, { declaredTotalKg: 540 })
    expect(result.errors).toEqual([])
    expect(result.changes).toEqual([
      { field: 'declaredTotalKg', from: 500, to: 540 },
    ])
    expect(result.next.competitionBestTotalKg).toBe(540)
    expect(result.next.trainingBestTotalKg).toBeNull()
  })

  it('pasar a primer torneo mueve el mismo número al total de entrenamiento', () => {
    const result = diffRegistrationImportRow(current, { firstMeet: true })
    expect(result.errors).toEqual([])
    expect(result.next).toMatchObject({
      isFirstMeet: true,
      competitionBestTotalKg: null,
      trainingBestTotalKg: 500,
    })
  })
})

describe('migración del máximo total', () => {
  it('no reescribe inscripciones existentes y deja el dato en null', () => {
    expect(migration).toContain('add column if not exists is_first_meet boolean')
    expect(migration).toContain('where id = p_registration_id')
    expect(migration).not.toMatch(/update\s+public\.event_registrations\s+set\s+is_first_meet\s*=\s*true/i)
    expect(migration).toContain('is_first_meet is null')
  })

  it('el alta nueva pasa por checkout v5 y sólo service_role', () => {
    expect(migration).toContain('create_competition_registration_checkout_v5')
    expect(migration).toContain('create_membership_registration_combo_checkout_v5')
    expect(migration).toContain('plu_private.apply_registration_declared_totals')
    expect(migration).toMatch(
      /grant execute on function public\.create_competition_registration_checkout_v5\([\s\S]*?\)\s+to service_role/,
    )
  })
})
