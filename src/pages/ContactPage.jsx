import '../styles/pages/institutional-pages.css'
import '../styles/pages/contact.css'
import '../styles/pages/institutional-editorial.css'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import ContactForm from '../components/ui/ContactForm.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { buildMailtoHref, CONTACT_EMAIL } from '../lib/contact.js'

export default function ContactPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page institutional-page contact-page contact-page--institutional">
      <InstitutionalPageHero
        aside={
          <dl className="institutional-hero__ledger">
            <div>
              <dt>{t('pages.contact.sidebarResponse')}</dt>
              <dd>{t('contact.sidebarResponse')}</dd>
            </div>
            <div>
              <dt>{t('pages.contact.sidebarEmail')}</dt>
              <dd>
                <a className="contact-hero__email" href={buildMailtoHref()}>
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div>
              <dt>{t('pages.contact.sidebarLocation')}</dt>
              <dd>{t('contact.sidebarLocation')}</dd>
            </div>
          </dl>
        }
        breadcrumb={t('pages.contact.heroBreadcrumbShort')}
        className="institutional-hero--editorial"
        description={t('pages.contact.heroDesc')}
        eyebrow={t('pages.contact.heroEyebrow')}
        index="CT / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.contact.heroTitle')}
      />

      <div className="contact-page__inner">
        <Reveal variant="fade">
          <ContactForm />
        </Reveal>
      </div>
    </main>
  )
}
