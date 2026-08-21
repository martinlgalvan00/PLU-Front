import { useState } from 'react'
import { ACCOUNT_OFFER_TAB, ACCOUNT_TAB_IDS } from '../../lib/navigation.js'
import '../../styles/pages/account.css'
import AccountNav from './AccountNav.jsx'

function LifecycleNav({ offerVisible }) {
  const [activeId, setActiveId] = useState('account-events')
  const visibleIds = offerVisible
    ? ACCOUNT_TAB_IDS
    : ACCOUNT_TAB_IDS.filter((id) => id !== ACCOUNT_OFFER_TAB)

  return (
    <main className="page page--design account-page--design">
      <div className="account-dashboard">
        <aside className="account-sidebar">
          <AccountNav activeId={activeId} onChange={setActiveId} visibleIds={visibleIds} />
        </aside>
        <div className="account-main">
          <section className="account-section">
            <header className="account-section__heading">
              <span className="account-section__heading-copy">
                <span className="account-section__eyebrow">Ciclo de la oferta</span>
                <h2>
                  {offerVisible ? 'Oferta pendiente' : 'Afiliación e inscripción habilitadas'}
                </h2>
              </span>
            </header>
            <p className="account-section__lead">
              {offerVisible
                ? 'La ficha secreta sigue disponible porque todavía requiere una acción.'
                : 'La promoción dejó la navegación; el estado continúa en Torneos y Pagos.'}
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}

export default {
  title: 'Cuenta/AccountNav/Lifecycle',
  component: AccountNav,
  parameters: { layout: 'fullscreen' },
}

export const OfertaPendiente = { render: () => <LifecycleNav offerVisible /> }

export const OfertaFinalizada = { render: () => <LifecycleNav offerVisible={false} /> }
