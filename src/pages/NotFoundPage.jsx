import '../styles/pages/institutional-pages.css'
import '../styles/pages/not-found.css'
import { ArrowRight, Compass, Mail } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Button from '../components/ui/Button.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function NotFoundPage({ onNavigate }) {
  const { t } = useI18n()

  function goHome() {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({ view: 'home' }, '', '/')
    }
    onNavigate?.('home')
  }

  function goContact() {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({ view: 'contact' }, '', '/')
    }
    onNavigate?.('contact')
  }

  return (
    <main className="institutional-page not-found-page">
      <InstitutionalPageHero
        aside={(
          <dl className="institutional-hero__ledger">
            <div>
              <dt>{t('pages.notFound.heroLedgerCode')}</dt>
              <dd>404</dd>
            </div>
            <div>
              <dt>{t('pages.notFound.heroLedgerChannel')}</dt>
              <dd>{t('pages.notFound.heroLedgerChannelValue')}</dd>
            </div>
          </dl>
        )}
        breadcrumb={t('pages.notFound.heroBreadcrumb')}
        description={t('pages.notFound.heroDesc')}
        eyebrow={t('pages.notFound.heroChapter')}
        index="404"
        onHome={goHome}
        title={t('pages.notFound.heroTitle')}
      />

      <div className="institutional-page__inner not-found-page__inner">
        <section className="not-found-page__panel" aria-labelledby="not-found-panel-title">
          <Compass className="not-found-page__icon" size={28} aria-hidden />
          <p className="institutional-kicker">01 / {t('pages.notFound.panelEyebrow')}</p>
          <h2 id="not-found-panel-title">{t('pages.notFound.panelTitle')}</h2>
          <p className="not-found-page__lead">{t('pages.notFound.panelLead')}</p>
          <div className="not-found-page__actions" role="group" aria-label={t('pages.notFound.actionsAria')}>
            <Button type="button" onClick={goHome}>
              {t('pages.notFound.ctaHome')}
              <ArrowRight size={16} aria-hidden />
            </Button>
            <Button type="button" variant="ghost" onClick={goContact}>
              <Mail size={16} aria-hidden />
              {t('pages.notFound.ctaContact')}
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
