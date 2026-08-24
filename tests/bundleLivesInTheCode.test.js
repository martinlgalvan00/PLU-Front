import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discountCodeSchema } from '../server/routes/pricing.js'

/**
 * bundleLivesInTheCode.test.js — PLU ARG
 *
 * El paquete de afiliación + inscripción se configuraba en una sección aparte de
 * Precios y después había que crear el código que lo abría: dos objetos para un
 * solo trámite. 20260914100000 cierra el círculo que abrió 20260913100000 —
 * archiva los combos vivos y revoca su escritura— y el panel queda con una sola
 * superficie: el código.
 */
const ROOT = process.cwd()
const migration = readFileSync(
  resolve(ROOT, 'supabase/migrations/20260914100000_bundle_lives_in_the_code.sql'),
  'utf8',
)
const panel = readFileSync(resolve(ROOT, 'src/pages/admin/PricingSection.jsx'), 'utf8')
const pricingRoutes = readFileSync(resolve(ROOT, 'server/routes/pricing.js'), 'utf8')
const pricingRepository = readFileSync(
  resolve(ROOT, 'server/modules/pricing/supabasePricingRepository.js'),
  'utf8',
)

describe('la migración cierra el combo como objeto configurable', () => {
  it('archiva los combos vivos sin tocar su precio ni su historia', () => {
    expect(migration).toContain('update public.event_combo_offers')
    expect(migration).toContain('set archived_at = now()')
    expect(migration).toContain('where archived_at is null')
    // No se apaga ni se reescribe: una orden vieja tiene que seguir siendo
    // legible con los números del día en que se cobró.
    expect(migration).not.toMatch(/set[\s\S]{0,80}active = false/)
    expect(migration).toContain("'event_combo_offer.archived'")
  })

  it('revoca la escritura en vez de confiar en que nadie la llame', () => {
    expect(migration).toContain(
      'revoke execute on function public.staff_save_event_combo_offer(text, jsonb, text)\n  from service_role;',
    )
    expect(migration).toContain(
      'revoke execute on function public.staff_delete_event_combo_offer(text, text)\n  from service_role;',
    )
    expect(migration).toContain("raise exception 'La escritura del combo sigue abierta.'")
  })

  it('conserva la rama de lectura: hay órdenes cobradas con esos precios', () => {
    expect(migration).toContain('create_membership_registration_combo_order_core')
    expect(migration).toContain('athlete_event_offer_bundle')
    expect(migration).not.toMatch(/drop table/i)
  })

  it('verifica que no quede ningún combo sirviéndose', () => {
    expect(migration).toContain("raise exception 'Quedaron combos sin archivar.'")
  })
})

describe('el panel tiene una sola superficie', () => {
  it('no queda nada de la sección del combo', () => {
    for (const trace of [
      'admin-pricing__block--combo',
      'comboDraft',
      'comboEditorOpen',
      'onSaveComboOffer',
      'onDeleteComboOffer',
      'submitCombo',
    ]) {
      expect(panel, `quedó ${trace} en el panel`).not.toContain(trace)
    }
  })

  it('el formulario del código no conserva restos de la oferta retirada', () => {
    // 20260915100000 retiró las ofertas por código: el paquete se vende como
    // precio fijo con alcance 'combo', y el formulario de la oferta —su aside
    // del flujo secreto, sus etiquetas propias— se fue con ella. Nada de eso
    // puede reaparecer por un merge distraído.
    for (const trace of [
      'offerPlanLabel',
      'offerEventLabel',
      'draftOpensOffer',
      'offer_access',
      'exclusiveFlow',
    ]) {
      expect(panel, `quedó ${trace} en el panel`).not.toContain(trace)
    }
  })

  // `membershipPlanId` sí vuelve, y no es un resto de la oferta: es el séptimo
  // dato del paquete —qué afiliación se empaqueta— que 20260918100000 le dio al
  // código de combo para que no necesite el objeto combo del evento. La
  // diferencia con la oferta retirada es que acá lo pide el mismo formulario
  // que fija el precio, no una segunda sección.
  it('el combo nombra su afiliación desde el mismo formulario', () => {
    expect(panel).toContain('membershipPlanId')
    expect(panel).toContain('bundlePlans')
    expect(panel).not.toContain('admin-pricing__block--combo')
  })

  // El combo dejó de estar escondido dentro de "Aplica a": elegirlo ahí no
  // arrastraba las condiciones que necesita (inscripción, audiencia, paquete),
  // y por eso se podía guardar un código que el canje después rechazaba.
  it('el combo es un tipo del panel, no un alcance más (20260918100000)', () => {
    expect(panel).toContain("const CODE_TYPES = ['percent', 'fixed_price', 'combo']")
    expect(panel).toContain('codeShapeForType')
    // Y deja de ofrecerse por duplicado en el selector de alcance.
    expect(panel).not.toContain('<option value="combo">')
  })
})

describe('la API ya no puede volver a partir la configuración en dos', () => {
  it('no expone endpoints del combo ni sus RPC', () => {
    expect(pricingRoutes).not.toContain("'/events/:eventSlug/combo'")
    expect(pricingRoutes).not.toContain('comboOfferSchema')
    expect(pricingRepository).not.toContain('staff_save_event_combo_offer')
    expect(pricingRepository).not.toContain('staff_delete_event_combo_offer')
  })

  it("'access' y 'offer' salen del contrato: sólo quedan los dos descuentos (20260915100000)", () => {
    const base = {
      code: 'TEST-CODE',
      appliesTo: 'membership',
      percentOff: 10,
    }
    expect(discountCodeSchema.safeParse({ ...base, kind: 'access' }).success).toBe(false)
    expect(discountCodeSchema.safeParse({ ...base, kind: 'percent' }).success).toBe(true)
    expect(
      discountCodeSchema.safeParse({
        code: 'TEST-FIJO',
        kind: 'fixed_price',
        appliesTo: 'membership',
        fixedPrice: 50000,
      }).success,
    ).toBe(true)
    expect(
      discountCodeSchema.safeParse({
        code: 'TEST-OFERTA',
        kind: 'offer',
        appliesTo: 'combo',
        audience: 'code',
        eventId: '11111111-1111-4111-8111-111111111111',
        membershipPlanId: '22222222-2222-4222-8222-222222222222',
        fixedPrice: 120000,
      }).success,
    ).toBe(false)
  })
})

describe('el corpus de migraciones queda ordenado', () => {
  // Se verifica el ORDEN RELATIVO, no el máximo global: fijar "la última" hacía
  // que cualquier migración de otro dominio —Finanzas, eventos— rompiera este
  // test sin haber tocado nada del combo.
  it('las migraciones del paquete van en orden y ninguna versión colisiona', () => {
    const versions = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql'))
      .map((name) => name.split('_')[0])
    const duplicated = versions.filter((version, index) => versions.indexOf(version) !== index)
    expect(duplicated).toEqual([])
    // La cadena que movió el paquete adentro del código, en el orden en que
    // tiene que aplicarse: sin combo → sin sección → sin oferta → con tipo.
    const chain = ['20260913100000', '20260914100000', '20260915100000', '20260918100000']
    for (const version of chain) {
      expect(versions, `falta la migración ${version}`).toContain(version)
    }
    expect([...chain].sort()).toEqual(chain)
  })
})
