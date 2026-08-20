import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { assertComboAccessCodeOrDiscountCode } from '../server/services/registrationAccessService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260901100000_discount_code_access_kind.sql'),
  'utf8',
)

const RESTRICTED_OFFER = { audience: 'code', accessCode: 'COMBO-PITBULL' }

describe('discount_codes kind=access (migración)', () => {
  it('agrega access al check de kind', () => {
    expect(migration).toContain("check (kind in ('percent', 'fixed_price', 'access'))")
  })

  it('exige ambos campos de descuento en null y alcance combo para access', () => {
    expect(migration).toContain("kind = 'access'")
    expect(migration).toContain('and applies_to = \'combo\'')
  })

  it('resuelve el descuento de access en 0', () => {
    expect(migration).toContain("when p_kind = 'access' then 0")
  })

  it('no rechaza un access por "no mejora el precio" en el canje', () => {
    expect(migration).toContain("if v_code.kind <> 'access' and v_discount <= 0 then")
  })

  it('no rechaza un access por "no_savings" en el preview', () => {
    expect(migration).toContain(
      "if v_code.kind <> 'access' and (v_discount <= 0 or v_discount >= p_base_amount) then",
    )
  })

  it('el CRUD admin acepta kind=access y lo restringe a combo', () => {
    expect(migration).toContain("if v_kind not in ('percent', 'fixed_price', 'access') then")
    expect(migration).toContain("if v_kind = 'access' and v_applies <> 'combo' then")
  })

  it('no crea un overload nuevo de las funciones tocadas', () => {
    // Firma sin cambios respecto de 20260828100000: un `create or replace`
    // sobre el mismo tipo, nunca un `drop function` seguido de una firma
    // distinta.
    expect(migration).not.toContain('drop function if exists public.apply_discount_code_to_order')
    expect(migration).not.toContain(
      'drop function if exists public.athlete_preview_discount_code',
    )
  })
})

describe('assertComboAccessCodeOrDiscountCode', () => {
  it('acepta el access_code del evento como antes', async () => {
    const previewDiscountCode = vi.fn()
    const result = await assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
      comboAccessCode: ' combo-pitbull ',
      discountCode: '',
      previewDiscountCode,
      athleteId: 'athlete-1',
      baseAmount: 120000,
    })
    expect(result).toBe(RESTRICTED_OFFER)
    expect(previewDiscountCode).not.toHaveBeenCalled()
  })

  it('acepta un discount code kind=access enviado en discountCode', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'access' })
    const result = await assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
      comboAccessCode: '',
      discountCode: 'combo-secreto',
      previewDiscountCode,
      athleteId: 'athlete-1',
      baseAmount: 120000,
    })
    expect(result).toBe(RESTRICTED_OFFER)
    expect(previewDiscountCode).toHaveBeenCalledWith('athlete-1', {
      code: 'COMBO-SECRETO',
      appliesTo: 'combo',
      baseAmount: 120000,
    })
  })

  it('acepta un discount code kind=access enviado en comboAccessCode (fallback)', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'access' })
    const result = await assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
      comboAccessCode: 'combo-secreto',
      discountCode: '',
      previewDiscountCode,
      athleteId: 'athlete-1',
      baseAmount: 120000,
    })
    expect(result).toBe(RESTRICTED_OFFER)
  })

  it('rechaza un código de descuento válido que no es kind=access', async () => {
    const previewDiscountCode = vi.fn().mockResolvedValue({ valid: true, kind: 'percent' })
    await expect(
      assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
        comboAccessCode: '',
        discountCode: 'DESCUENTO10',
        previewDiscountCode,
        athleteId: 'athlete-1',
        baseAmount: 120000,
      }),
    ).rejects.toThrowError(/no es válido/)
  })

  it('sigue exigiendo un código cuando no llega ninguno', async () => {
    await expect(
      assertComboAccessCodeOrDiscountCode(RESTRICTED_OFFER, {
        comboAccessCode: '',
        discountCode: '',
        previewDiscountCode: vi.fn(),
        athleteId: 'athlete-1',
        baseAmount: 120000,
      }),
    ).rejects.toThrowError(/requiere un código/)
  })

  it('un combo público no pide nada', async () => {
    const result = await assertComboAccessCodeOrDiscountCode(
      { audience: 'public' },
      {
        comboAccessCode: '',
        discountCode: '',
        previewDiscountCode: vi.fn(),
        athleteId: 'athlete-1',
        baseAmount: 0,
      },
    )
    expect(result).toBeNull()
  })
})
