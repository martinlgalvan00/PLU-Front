import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertComboAccessCode } from '../server/services/registrationAccessService.js'
import { comboOfferSchema } from '../server/routes/pricing.js'
import { getEventComboAvailability } from '../src/services/comboOfferService.js'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827110000_combo_access_code_and_promo_archive.sql',
  ),
  'utf8',
)

const PLAN_ID = '11111111-1111-4111-8111-111111111111'

function comboPayload(overrides = {}) {
  return {
    membershipPlanId: PLAN_ID,
    price: 120000,
    active: true,
    startsAt: '',
    endsAt: '',
    ...overrides,
  }
}

describe('combo restringido por código', () => {
  it('agrega audiencia y código al combo, y no deja restringirlo sin código', () => {
    expect(migration).toContain("add column if not exists audience text not null default 'public'")
    expect(migration).toContain('add column if not exists access_code text')
    expect(migration).toContain("check (audience = 'public' or access_code is not null)")
  })

  it('deja los combos existentes públicos, que es lo que eran', () => {
    expect(migration).toContain("audience text not null default 'public'")
  })

  it('borra el código al volver el combo a público', () => {
    // Si lo conservara, restringirlo de nuevo reviviría en silencio un código
    // que ya se repartió.
    expect(migration).toContain('v_access_code := null')
    const parsed = comboOfferSchema.safeParse(
      comboPayload({ audience: 'public', accessCode: 'COMBO-VIEJO' }),
    )
    expect(parsed.success).toBe(true)
    expect(parsed.data.accessCode).toBe('')
  })

  it('exige un código válido cuando el combo es restringido', () => {
    expect(comboOfferSchema.safeParse(comboPayload({ audience: 'code' })).success).toBe(false)
    expect(
      comboOfferSchema.safeParse(comboPayload({ audience: 'code', accessCode: 'ma l' })).success,
    ).toBe(false)
    const ok = comboOfferSchema.safeParse(
      comboPayload({ audience: 'code', accessCode: 'combo-pitbull' }),
    )
    expect(ok.success).toBe(true)
    expect(ok.data.accessCode).toBe('COMBO-PITBULL')
  })

  it('mantiene el código fuera de la bitácora', () => {
    // La auditoría registra que el combo pasó a restringido, no el material que
    // se reparte.
    expect(migration).toContain("(to_jsonb(v_offer) - 'access_code')")
    expect(migration).toContain("'accessCodeSet', v_offer.access_code is not null")
  })

  it('no ofrece el combo restringido hasta que se destraba', () => {
    const event = {
      comboOffer: { price: 120000, active: true, audience: 'code' },
      status: 'inscripcion_abierta',
    }
    const locked = getEventComboAvailability(event, { hasActiveMembership: false })
    expect(locked.requiresCode).toBe(true)
    expect(locked.enabled).toBe(false)

    const unlocked = getEventComboAvailability(event, {
      hasActiveMembership: false,
      unlocked: true,
    })
    expect(unlocked.enabled || unlocked.comingSoon).toBe(true)
  })

  it('un combo público sigue disponible sin código', () => {
    const event = {
      comboOffer: { price: 120000, active: true, audience: 'public' },
      status: 'inscripcion_abierta',
    }
    const availability = getEventComboAvailability(event, { hasActiveMembership: false })
    expect(availability.requiresCode).toBe(false)
    expect(availability.locked).toBe(false)
  })

  it('valida el código del combo comparando texto normalizado', () => {
    const offer = { audience: 'code', accessCode: 'COMBO-PITBULL' }
    expect(assertComboAccessCode(offer, '  combo-pitbull ')).toBe(offer)
    expect(() => assertComboAccessCode(offer, 'OTRO')).toThrowError(/no es válido/)
    expect(() => assertComboAccessCode(offer, '')).toThrowError(/requiere un código/)
    // Un combo público no pide nada.
    expect(assertComboAccessCode({ audience: 'public' }, '')).toBeNull()
  })
})

describe('baja de una promoción ya canjeada', () => {
  it('archiva en vez de romper la contabilidad', () => {
    // `discount_code_redemptions` respalda órdenes ya cobradas y Finanzas
    // reporta sobre ellas: borrarlas sería corromper la contabilidad.
    expect(migration).toContain('add column if not exists archived_at timestamptz')
    expect(migration).toContain("'discount_code.archived'")
    expect(migration).toContain("jsonb_build_object(\n      'deleted', true, 'archived', true")
  })

  it('borra de verdad la promo que nunca se usó', () => {
    expect(migration).toContain('delete from public.discount_codes where id = p_code_id')
    expect(migration).toContain("'deleted', true, 'archived', false")
  })

  it('libera el texto del código al archivar', () => {
    // Con el único parcial, "eliminar" no deja un fantasma bloqueando el alta
    // de una promo nueva con el mismo nombre.
    expect(migration).toContain('create unique index if not exists discount_codes_org_code_live_uidx')
    expect(migration).toContain('where archived_at is null')
  })

  it('deja de canjear y de previsualizar una promo archivada', () => {
    // Sin esto, archivar la esconde del panel pero la deja viva para cualquiera
    // que todavía tenga el código anotado.
    expect(migration).toContain('and archived_at is null\n    for update')
    expect(migration).toContain("and c.archived_at is null")
  })

  it('no la lista en el panel', () => {
    expect(migration).toContain('and c.archived_at is null\n    ), \'[]\'::jsonb)')
  })

  it('no deja cambiarle el estado a una promo archivada', () => {
    expect(migration).toContain("raise exception 'La promoción está archivada.'")
  })
})
