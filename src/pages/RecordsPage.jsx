import { Medal, Trophy } from 'lucide-react'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function RecordsPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page page--design records-page">
      <DesignPageHero
        className="records-hero"
        compact
        breadcrumbLabel={t('pages.records.heroBreadcrumb')}
        eyebrow={t('pages.records.heroEyebrow')}
        onHome={() => onNavigate('home')}
        title={t('pages.records.heroTitle')}
        description={t('pages.records.heroDesc')}
      />

      <div className="design-section">
        <Reveal as="section" variant="up">
          <SectionHeading title={t('pages.records.distinctionTitle')} />
          <div className="content-grid records-distinction">
            <article className="info-card">
              <Trophy size={26} strokeWidth={1.6} aria-hidden />
              <h3>{t('pages.records.distinctionResultsTitle')}</h3>
              <p>{t('pages.records.distinctionResultsText')}</p>
            </article>
            <article className="info-card">
              <Medal size={26} strokeWidth={1.6} aria-hidden />
              <h3>{t('pages.records.distinctionRecordsTitle')}</h3>
              <p>{t('pages.records.distinctionRecordsText')}</p>
            </article>
          </div>
        </Reveal>

        <Reveal delay={60} className="records-comingsoon">
          <EmptyState
            icon={Medal}
            title={t('pages.records.comingSoonTitle')}
            description={t('pages.records.comingSoonDesc')}
          />
        </Reveal>
      </div>

      <CTASection
        title={t('pages.records.ctaTitle')}
        description={t('pages.records.ctaDesc')}
        primaryLabel={t('pages.records.ctaResults')}
        onPrimary={() => onNavigate('results')}
        secondaryLabel={t('pages.records.ctaContact')}
        onSecondary={() => onNavigate('contact')}
      />
    </main>
  )
}
