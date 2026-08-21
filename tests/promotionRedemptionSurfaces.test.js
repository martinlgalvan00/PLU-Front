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

  it('concentra el canje general en la ficha Beneficios del perfil', () => {
    const profile = read('src/pages/AthleteProfilePage.jsx')
    const benefits = read('src/pages/profile/PromotionBenefitsSection.jsx')

    expect(profile).toContain('PromotionBenefitsSection')
    expect(profile).toContain('[ACCOUNT_BENEFITS_TAB]')
    expect(benefits).toContain('<SecretOfferCodeRedeemer')
    expect(benefits).toContain('defaultOpen')
  })

  it('mantiene el código dentro de los checkouts que recalculan el precio', () => {
    expect(read('src/pages/RegisterPage.jsx')).toContain('registration-discount-code')
    expect(read('src/pages/profile/MembershipPurchaseSection.jsx')).toContain(
      'membership-discount-code',
    )
  })
})
