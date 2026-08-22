import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertComboAccessCode } from '../server/services/registrationAccessService.js'
import { getEventComboAvailability } from '../src/services/comboOfferService.js'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827110000_combo_access_code_and_promo_archive.sql',
  ),
  'utf8',
)
const comboArchiveMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903100000_combo_offer_archive_visibility.sql'),
  'utf8',
)
const comboVisibilityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260904100000_combo_offer_visibility_states.sql'),
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
    // que ya se repartió. La guarda quedó en la RPC: el panel ya no configura
    // combos —el paquete vive dentro del código de oferta (20260914100000)— así
    // que el schema HTTP que la duplicaba se fue con su sección.
    expect(migration).toContain('v_access_code := null')
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
    expect(locked.offer).toBeNull()
    expect(locked.enabled).toBe(false)
    expect(locked.locked).toBe(true)

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

  it('trata privado como un tercer estado y no como restringido', () => {
    // Lo que sigue importando es cómo lo lee el checkout de un combo que ya
    // existe: privado no es "restringido y hay que canjear", es "fuera de todo
    // canal", ni siquiera con la llave en la mano.
    const availability = getEventComboAvailability(
      {
        comboOffer: { price: 120000, active: true, audience: 'private' },
        status: 'inscripcion_abierta',
      },
      { unlocked: true },
    )
    expect(availability).toMatchObject({
      visibility: 'private',
      hidden: true,
      locked: false,
      offer: null,
      enabled: false,
    })
    expect(() => assertComboAccessCode({ audience: 'private' }, 'ONLY-PITBULL')).toThrowError(
      /no está disponible/,
    )
  })

  it('protege los tres estados y pausa llaves al volver privado el combo', () => {
    expect(comboVisibilityMigration).toContain("audience in ('public', 'code', 'private')")
    expect(comboVisibilityMigration).toContain('discount_codes_secret_combo_visibility')
    expect(comboVisibilityMigration).toContain('event_combo_offers_pause_private_codes')
    expect(comboVisibilityMigration).toContain("'discount_code.paused_private_combo'")
    expect(comboVisibilityMigration).toContain("v_audience not in ('public', 'code', 'private')")
  })
})

describe('baja de una oferta combo', () => {
  it('borra si no hay ordenes y archiva si debe preservar historial', () => {
    expect(comboArchiveMigration).toContain('delete from public.event_combo_offers')
    expect(comboArchiveMigration).toContain("'event_combo_offer.archived'")
    expect(comboArchiveMigration).toContain("'deleted', true, 'archived', true")
  })

  it('la excluye del panel y de las ofertas privadas del atleta', () => {
    expect(comboArchiveMigration).toContain('o.event_id = e.id and o.archived_at is null')
    expect(comboArchiveMigration).toContain('join public.event_combo_offers o')
    expect(comboArchiveMigration).toContain('and o.archived_at is null')
  })

  it('hace que la politica publica solo entregue combos publicos vigentes', () => {
    expect(comboArchiveMigration).toContain("and audience = 'public'")
    expect(comboArchiveMigration).toContain('and active = true')
    expect(comboArchiveMigration).toContain('archived_at is null')
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
    expect(migration).toContain(
      'create unique index if not exists discount_codes_org_code_live_uidx',
    )
    expect(migration).toContain('where archived_at is null')
  })

  it('deja de canjear y de previsualizar una promo archivada', () => {
    // Sin esto, archivar la esconde del panel pero la deja viva para cualquiera
    // que todavía tenga el código anotado.
    expect(migration).toContain('and archived_at is null\n    for update')
    expect(migration).toContain('and c.archived_at is null')
  })

  it('no la lista en el panel', () => {
    expect(migration).toContain("and c.archived_at is null\n    ), '[]'::jsonb)")
  })

  it('no deja cambiarle el estado a una promo archivada', () => {
    expect(migration).toContain("raise exception 'La promoción está archivada.'")
  })
})
