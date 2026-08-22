import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file) => readFileSync(file, 'utf8')

describe('superficies habilitadas para canjear promociones', () => {
  it('no muestra el canje en páginas públicas ni en Pitbull Classic', () => {
    for (const file of [
      'src/pages/PitbullPage.jsx',
      'src/pages/EventsPage.jsx',
      'src/pages/TicketsPage.jsx',
    ]) {
      expect(read(file)).not.toContain('SecretOfferCodeRedeemer')
    }
  })

  /**
   * No hay página de canje. Un código no se canjea desde ninguna URL propia:
   * se tipea —o se escanea— dentro del checkout que lo va a cobrar, y desde ahí
   * el resolvedor manda a la pestaña que corresponda (la oferta secreta, la
   * afiliación o el checkout del torneo).
   */
  it('no existe una ruta pública de canje', () => {
    for (const file of ['src/App.jsx', 'src/lib/navigation.js']) {
      expect(read(file)).not.toContain('canjear')
      expect(read(file)).not.toContain('matchPromotionCodeRoute')
    }
    // Y el servicio no la puede construir: sin `buildPromotionCodeUrl` no queda
    // un enlace que repartir por accidente.
    expect(read('src/services/promotionCodeService.js')).not.toContain('buildPromotionCodeUrl')
  })

  it('concentra el canje en los dos checkouts, camuflado detrás de "Tengo un código"', () => {
    const membership = read('src/pages/profile/MembershipPurchaseSection.jsx')
    const registration = read('src/pages/RegisterPage.jsx')

    for (const source of [membership, registration]) {
      // El campo nace plegado: el checkout no le pone un input a quien no tiene
      // ningún código.
      expect(source).toContain('discountOpen')
      expect(source).toContain('account.membership.discountToggle')
      // Y el que lo abre resuelve de verdad, contra el resolvedor universal.
      expect(source).toContain('redeemPromotionCode')
      // Con el escaneo del QR en el mismo campo, que es su único destino.
      expect(source).toContain('CodeScanButton')
    }
  })

  it('mantiene el código dentro de los checkouts que recalculan el precio', () => {
    expect(read('src/pages/RegisterPage.jsx')).toContain('registration-discount-code')
    expect(read('src/pages/profile/MembershipPurchaseSection.jsx')).toContain(
      'membership-discount-code',
    )
  })
})
