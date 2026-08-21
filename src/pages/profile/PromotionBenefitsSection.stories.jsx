import '../../styles/pages/account.css'
import PromotionBenefitsSection from './PromotionBenefitsSection.jsx'

export default {
  title: 'Pages/Account/PromotionBenefitsSection',
  component: PromotionBenefitsSection,
  parameters: { layout: 'fullscreen' },
  args: {
    session: { role: 'athlete_plu', email: 'martina@plu.test' },
    hasExclusiveOffer: false,
    onNavigate: () => {},
    onNavigateSection: () => {},
    onOfferUnlocked: async () => {},
  },
  decorators: [
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-dashboard">
          <aside className="account-sidebar" />
          <div className="account-main">
            <div className="account-sections">
              <div className="account-tab-panel">
                <Story />
              </div>
            </div>
          </div>
        </div>
      </main>
    ),
  ],
}

export const Default = {}

export const ConOfertaDesbloqueada = {
  args: { hasExclusiveOffer: true },
}

export const Mobile = {
  parameters: { viewport: { defaultViewport: 'mobile2' } },
}
