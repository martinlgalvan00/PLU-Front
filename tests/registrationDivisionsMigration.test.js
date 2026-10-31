import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAthleteRepository } from '../server/modules/athletes/supabaseAthleteRepository.js'

const sql = readFileSync(
  'supabase/migrations/20261228100000_registration_divisions_and_modalities.sql',
  'utf8',
)

describe('migración de segunda división y modalidades', () => {
  it('agrega las columnas sin reescribir inscripciones existentes', () => {
    expect(sql).toContain('add column if not exists secondary_division text')
    expect(sql).toContain("add column if not exists modalities text[] not null default array['full_power']")
    // El único update es el de una inscripción puntual, nunca un backfill.
    expect(sql.match(/update\s+public\.event_registrations/gi)).toHaveLength(1)
    expect(sql).toContain('where id = p_registration_id')
  })

  it('restringe la segunda división y las modalidades al catálogo', () => {
    expect(sql).toContain("secondary_division in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')")
    expect(sql).toContain('cardinality(modalities) between 1 and 5')
    expect(sql).toContain("'push_pull', 'squat', 'bench', 'deadlift'")
  })

  it('no abre una segunda fila por atleta: el unique de evento/atleta sigue vigente', () => {
    expect(sql).not.toMatch(/drop\s+constraint[^;]*event_id[^;]*athlete_id/i)
    expect(sql).not.toMatch(/insert\s+into\s+public\.event_registrations/i)
  })

  it('envuelve los checkouts vigentes y guarda la elección en la misma transacción', () => {
    expect(sql).toContain('create_competition_registration_checkout_v3')
    expect(sql).toContain('create_membership_registration_combo_checkout_v3')
    expect(sql).toContain('public.create_competition_registration_checkout_v2(')
    expect(sql).toContain('public.create_membership_registration_combo_checkout_v2(')
    expect(sql).toContain('plu_private.apply_registration_selection(')
    expect(sql).not.toContain('drop function if exists public.create_competition_registration_checkout_v2')
  })

  it('las RPC nuevas solo las ejecuta service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.create_competition_registration_checkout_v3\([^)]*\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.create_competition_registration_checkout_v3\([^)]*\)\s+to service_role/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.create_membership_registration_combo_checkout_v3\([^)]*\)\s+to service_role/,
    )
  })

  it('no deja que la segunda división sea igual a la primera', () => {
    expect(sql).toContain('v_secondary is distinct from division')
  })

  it('una corrección de staff que iguala las divisiones descarta la segunda', () => {
    expect(sql).toContain('drop_duplicate_secondary_division')
    expect(sql).toContain('new.secondary_division := null')
    expect(sql).toMatch(/before insert or update of division, secondary_division on public\.event_registrations/)
  })
})

describe('repositorio: alta de inscripción con división y modalidades', () => {
  const base = {
    eventSlug: 'pitbull-classic-2026',
    division: 'Junior',
    category: 'Raw',
    bodyweightKg: 90,
    paymentMethod: 'mercado_pago',
    idempotencyKey: 'key-1',
    defaultPrice: 112500,
    manualPrice: 90000,
    manualPaymentChannel: null,
    declaredWeightClass: '90',
  }

  function repo() {
    const rpc = vi.fn(async () => ({ data: { order: { id: 'o1' } }, error: null }))
    return { rpc, repository: createSupabaseAthleteRepository({ rpc, from: vi.fn() }) }
  }

  it('la inscripción suelta llama a la RPC v4 con segunda división, modalidades y categorías adicionales', async () => {
    const { rpc, repository } = repo()
    await repository.createRegistration('athlete-1', {
      ...base,
      secondaryDivision: 'Open',
      modalities: ['full_power', 'bench'],
    })
    expect(rpc).toHaveBeenCalledWith(
      'create_competition_registration_checkout_v5',
      expect.objectContaining({
        p_division: 'Junior',
        p_secondary_division: 'Open',
        p_modalities: ['full_power', 'bench'],
        p_additional_categories: [],
        p_default_price: 112500,
        p_manual_price: 90000,
        p_declared_weight_class: '90',
      }),
    )
  })

  it('sin segunda división manda null y Full Power por defecto', async () => {
    const { rpc, repository } = repo()
    await repository.createRegistration('athlete-1', base)
    expect(rpc).toHaveBeenCalledWith(
      'create_competition_registration_checkout_v5',
      expect.objectContaining({
        p_secondary_division: null,
        p_modalities: ['full_power'],
        p_additional_categories: [],
      }),
    )
  })

  it('el combo también usa la RPC v4', async () => {
    const { rpc, repository } = repo()
    await repository.createRegistrationCombo('athlete-1', {
      ...base,
      secondaryDivision: 'Open',
      modalities: ['full_power'],
    })
    expect(rpc).toHaveBeenCalledWith(
      'create_membership_registration_combo_checkout_v5',
      expect.objectContaining({
        p_secondary_division: 'Open',
        p_modalities: ['full_power'],
        p_additional_categories: [],
      }),
    )
  })
})
