import { Medal, Trophy } from 'lucide-react'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import AnimatedSectionHeader from '../motion/AnimatedSectionHeader.tsx'
import StaggerGroup from '../motion/StaggerGroup.tsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

const DISTINCTION_CARDS = [
  {
    id: 'results',
    icon: Trophy,
    titleKey: 'pages.records.distinctionResultsTitle',
    textKey: 'pages.records.distinctionResultsText',
  },
  {
    id: 'records',
    icon: Medal,
    titleKey: 'pages.records.distinctionRecordsTitle',
    textKey: 'pages.records.distinctionRecordsText',
  },
]

export default function RecordsPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page page--design page--plu-ref records-page">
      <PluPageHero
        breadcrumbLabel={t('pages.records.heroBreadcrumb')}
        chapter={t('pages.records.heroEyebrow')}
        description={t('pages.records.heroDesc')}
        onHome={() => onNavigate('home')}
        title={t('pages.records.heroTitle')}
      />

      <div className="design-section">
        <Reveal as="section" variant="up">
          <AnimatedSectionHeader
            align="left"
            className="records-section-header motion-section-header--records"
            showRule
            title={t('pages.records.distinctionTitle')}
          />
          <StaggerGroup as="div" className="content-grid records-distinction" stagger={70} variant="up">
            {DISTINCTION_CARDS.map(({ icon: Icon, id, textKey, titleKey }) => (
              <article key={id} className="info-card">
                <Icon size={26} strokeWidth={1.6} aria-hidden />
                <h3>{t(titleKey)}</h3>
                <p>{t(textKey)}</p>
              </article>
            ))}
          </StaggerGroup>
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
