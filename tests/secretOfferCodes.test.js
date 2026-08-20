import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { assertComboAccessCodeOrDiscountCode } from '../server/services/registrationAccessService.js'
import {
  assertDiscountCodeEventScope,
  assertPreviewEventScope,
  isOfferUnlockKind,
} from '../server/services/offerCodeService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260902100000_secret_offer_codes.sql'),
  'utf8',
)

const RESTRICTED_OFFER = { audience: 'code', accessCode: 'COMBO-PITBULL' }

describe('kind=offer y alcance por inscripción (migración)', () => {
  it('agrega offer al check de kind', () => {
    expect(migration).toContain(
      "check (kind in ('percent', 'fixed_price', 'access', 'offer'))",
    )
  })

  it('exige importe, alcance combo, inscripción y audiencia por código en offer', () => {
    const shape = migration.slice(
      migration.indexOf('discount_codes_kind_shape_check'),
      migration.indexOf('discount_codes_fixed_price_manual_kind_check'),
    )
    const offerBranch = shape.slice(shape.indexOf("kind = 'offer'"))
    expect(offerBranch).toContain('fixed_price is not null')
    expect(offerBranch).toContain('percent_off is null')
    expect(offerBranch).toContain("applies_to = 'combo'")
    expect(offerBranch).toContain('event_id is not null')
    expect(offerBranch).toContain("audience = 'code'")
  })

  it('cotiza offer como precio fijo', () => {
    expect(migration).toContain("when p_kind in ('fixed_price', 'offer')")
  })

  it('no permite alcance de evento en una afiliación', () => {
    expect(migration).toContain(
      "check (event_id is null or applies_to in ('registration', 'combo'))",
    )
  })

  // Sin esto, `resolve_public_promo` (que no recibe el evento) podría levantar
  // una promo de otro torneo y dejar la compra sin ninguna promo aplicada.
  it('no permite alcance de evento en una promo pública', () => {
    expect(migration).toContain("check (audience = 'code' or event_id is null)")
  })

  it('verifica el alcance contra el evento real de la orden, no contra el slug del cliente', () => {
    expect(migration).toContain('create or replace function plu_private.order_event_id')
    expect(migration).toContain('from public.event_registrations r')
    expect(migration).toContain('where r.payment_order_id = p_order_id')
    expect(migration).toContain('v_order_event_id := plu_private.order_event_id(v_order.id)')
    expect(migration).toContain('if v_order_event_id is distinct from v_code.event_id then')
    expect(migration).toContain("using errcode = 'PLU27'")
  })

  it('un offer sí tiene que mejorar el precio; sólo access queda exento', () => {
    expect(migration).toContain("if v_code.kind <> 'access' and v_discount <= 0 then")
  })

  it('separa el canje de la llave de la redención contable', () => {
    expect(migration).toContain('create table if not exists public.discount_code_unlocks')
    // El unlock no lleva importe: no es un registro de Finanzas.
    const table = migration.slice(
      migration.indexOf('create table if not exists public.discount_code_unlocks'),
      migration.indexOf('create index if not exists discount_code_unlocks_athlete_idx'),
    )
    expect(table).not.toContain('discount_amount')
    expect(table).toContain('unique (discount_code_id, athlete_id)')
  })

  it('el canje no consume cupo pero rechaza un código sin cupo disponible', () => {
    const fn = migration.slice(
      migration.indexOf('create or replace function public.athlete_unlock_offer_code'),
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
    )
    expect(fn).toContain("'limit_reached'")
    // Nunca escribe en discount_code_redemptions: la redención es del checkout.
    expect(fn).not.toContain('insert into public.discount_code_redemptions')
    expect(fn).toContain('on conflict (discount_code_id, athlete_id) do nothing')
  })

  it('el canje rechaza modalidades que no desbloquean nada', () => {
    expect(migration).toContain("if v_code.kind not in ('offer', 'access') then")
  })

  // Un 'access' legado sin evento sirve en el checkout pero no se puede
  // convertir en ficha: no hay paquete ni precio que mostrar.
  it('el canje rechaza un código sin inscripción, y el listado tampoco lo muestra', () => {
    const unlock = migration.slice(
      migration.indexOf('create or replace function public.athlete_unlock_offer_code'),
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
    )
    expect(unlock).toContain('if v_code.event_id is null then')
    const list = migration.slice(
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
    )
    expect(list).toContain('and c.event_id is not null')
  })

  it('una oferta ya comprada sigue listada aunque el código quede inactivo', () => {
    const fn = migration.slice(
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
    )
    expect(fn).toContain('from public.discount_code_redemptions r')
    expect(fn).toContain('c.archived_at is null')
  })

  it('el CRUD admin acepta offer y valida el combo de la inscripción', () => {
    expect(migration).toContain(
      "if v_kind not in ('percent', 'fixed_price', 'access', 'offer') then",
    )
    expect(migration).toContain("if v_kind = 'offer' then")
    expect(migration).toContain('from public.event_combo_offers where event_id = v_event_id')
    expect(migration).toContain('if v_fixed_price >= v_combo.price then')
  })

  it('el panel lee el alcance y cuántos canjearon la llave', () => {
    expect(migration).toContain("'eventId', c.event_id")
    expect(migration).toContain("'eventTitle', ev.title")
    expect(migration).toContain("'unlockedCount', (")
  })

  it('no crea overloads nuevos de las funciones tocadas', () => {
    // Las cinco mantienen su firma vigente: `create or replace` puro.
    expect(migration).not.toContain('drop function if exists public.apply_discount_code_to_order')
    expect(migration).not.toContain('drop function if exists public.athlete_preview_discount_code')
    expect(migration).not.toContain('drop function if exists public.staff_upsert_discount_code')
  })
})

describe('isOfferUnlockKind', () => {
  it('sólo access y offer desbloquean', () => {
    expect(isOfferUnlockKind('access')).toBe(true)
    expect(isOfferUnlockKind('offer')).toBe(true)
    expect(isOfferUnlockKind('percent')).toBe(false)
    expect(isOfferUnlockKind('fixed_price')).toBe(false)
    expect(isOfferUnlockKind(undefined)).toBe(false)
  })
})

describe('assertPreviewEventScope', () => {
  it('deja pasar un preview sin alcance de evento', () => {
    const preview = { valid: true, code: 'DESC10', eventSlug: null }
    expect(assertPreviewEventScope(preview, 'pitbull-classic')).toBe(preview)
  })

  it('deja pasar un preview del mismo evento', () => {
    const preview = { valid: true, code: 'ONLY-PITBULL', eventSlug: 'pitbull-classic' }
    expect(assertPreviewEventScope(preview, 'pitbull-classic')).toBe(preview)
  })

  it('invalida un preview de otra inscripción y dice de cuál es', () => {
    const preview = {
      valid: true,
      code: 'ONLY-PITBULL',
      eventSlug: 'pitbull-classic',
      eventTitle: 'Pitbull Classic',
    }
    expect(assertPreviewEventScope(preview, 'otro-torneo')).toEqual({
      valid: false,
      reason: 'other_event',
      eventSlug: 'pitbull-classic',
      eventTitle: 'Pitbull Classic',
    })
  })

  it('invalida un código atado a un evento cuando no se pidió ninguno', () => {
    const preview = { valid: true, code: 'ONLY-PITBULL', eventSlug: 'pitbull-classic' }
    expect(assertPreviewEventScope(preview, undefined).reason).toBe('other_event')
  })

  it('no toca un preview que ya venía inválido', () => {
    const preview = { valid: false, reason: 'expired' }
    expect(assertPreviewEventScope(preview, 'pitbull-classic')).toBe(preview)
  })
})

describe('assertDiscountCodeEventScope', () => {
  const base = {
    athleteId: 'athlete-1',
    code: 'ONLY-PITBULL',
    appliesTo: 'combo',
    baseAmount: 150000,
  }

  it('corta el alta cuando el código es de otra inscripción', async () => {
    const previewDiscountCode = vi
      .fn()
      .mockResolvedValue({ valid: true, kind: 'offer', eventSlug: 'pitbull-classic' })
    await expect(
      assertDiscountCodeEventScope({
        ...base,
        previewDiscountCode,
        eventSlug: 'otro-torneo',
      }),
    ).rejects.toThrowError(/otra inscripción/)
  })

  it('no corta cuando el evento coincide', async () => {
    const previewDiscountCode = vi
      .fn()
      .mockResolvedValue({ valid: true, kind: 'offer', eventSlug: 'pitbull-classic' })
    await expect(
      assertDiscountCodeEventScope({
        ...base,
        previewDiscountCode,
        eventSlug: 'pitbull-classic',
      }),
    ).resolves.toBeUndefined()
  })

  it('no corta cuando el código no declara inscripción', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'percent' })
    await expect(
      assertDiscountCodeEventScope({
        ...base,
        code: 'DESC10',
        previewDiscountCode,
        eventSlug: 'pitbull-classic',
      }),
    ).resolves.toBeUndefined()
  })

  it('sin código no consulta nada', async () => {
    const previewDiscountCode = vi.fn()
    await assertDiscountCodeEventScope({ ...base, code: '', previewDiscountCode, eventSlug: 'x' })
    expect(previewDiscountCode).not.toHaveBeenCalled()
  })

  // La RPC vuelve a validar el código entero dentro de la transacción: un
  // preview caído no puede ser lo que impida comprar.
  it('un preview que falla no bloquea la compra', async () => {
    const previewDiscountCode = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(
      assertDiscountCodeEventScope({ ...base, previewDiscountCode, eventSlug: 'pitbull-classic' }),
    ).resolves.toBeUndefined()
  })
})

describe('assertComboAccessCodeOrDiscountCode con kind=offer', () => {
  it('un offer destraba el combo restringido', async () => {
    const previewDiscountCode = vi
      .fn()
      .mockResolvedValue({ valid: true, kind: 'offer', eventSlug: 'pitbull-classic' })
    const result = await assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
      comboAccessCode: '',
      discountCode: 'only-pitbull',
      previewDiscountCode,
      athleteId: 'athlete-1',
      baseAmount: 150000,
      eventSlug: 'pitbull-classic',
    })
    expect(result).toBe(RESTRICTED_OFFER)
  })

  // El punto del alcance: con dos torneos con combo restringido, el código de
  // uno no puede abrir el del otro.
  it('un offer de otro torneo no destraba este combo', async () => {
    const previewDiscountCode = vi
      .fn()
      .mockResolvedValue({ valid: true, kind: 'offer', eventSlug: 'pitbull-classic' })
    await expect(
      assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
        comboAccessCode: '',
        discountCode: 'only-pitbull',
        previewDiscountCode,
        athleteId: 'athlete-1',
        baseAmount: 150000,
        eventSlug: 'otro-torneo',
      }),
    ).rejects.toThrowError(/no es válido/)
  })

  it('un access sin alcance de evento sigue destrabando cualquier combo', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'access' })
    const result = await assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
      comboAccessCode: '',
      discountCode: 'combo-secreto',
      previewDiscountCode,
      athleteId: 'athlete-1',
      baseAmount: 150000,
      eventSlug: 'cualquiera',
    })
    expect(result).toBe(RESTRICTED_OFFER)
  })
})
