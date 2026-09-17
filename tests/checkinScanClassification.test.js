import { describe, expect, it } from 'vitest'
import { checkinRejectionOutcome } from '../src/services/checkinScanService.js'

/**
 * Antes de esta clasificación por código PLU, un 409 del check-in se
 * adivinaba con una regex sobre el mensaje en español y todo lo que no
 * matcheara "no habilita esta zona" caía en "sin pago". Estas pruebas fijan
 * que un QR vencido o todavía no vigente ya no se confunda con eso.
 */
describe('checkinRejectionOutcome clasifica el rechazo del check-in por código PLU', () => {
  it('PLU06 es entrada ya usada', () => {
    expect(checkinRejectionOutcome({ body: { code: 'PLU06', alreadyUsed: true } })).toBe(
      'already_used',
    )
  })

  it('PLU14 es QR todavía no vigente', () => {
    expect(checkinRejectionOutcome({ body: { code: 'PLU14' } })).toBe('not_yet_valid')
  })

  it('PLU15 es QR vencido, nunca "sin pago"', () => {
    expect(checkinRejectionOutcome({ body: { code: 'PLU15' } })).toBe('expired')
  })

  it('PLU16 es zona incorrecta', () => {
    expect(checkinRejectionOutcome({ body: { code: 'PLU16' } })).toBe('wrong_zone')
  })

  it('PLU05 (sin pago) y cualquier código desconocido caen en not_paid', () => {
    expect(checkinRejectionOutcome({ body: { code: 'PLU05' } })).toBe('not_paid')
    expect(checkinRejectionOutcome({ body: {} })).toBe('not_paid')
    expect(checkinRejectionOutcome({})).toBe('not_paid')
  })

  it('alreadyUsed sin código todavía clasifica como ya usada (compatibilidad)', () => {
    expect(checkinRejectionOutcome({ body: { alreadyUsed: true } })).toBe('already_used')
  })
})
