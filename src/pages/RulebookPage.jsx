import { useMemo, useState } from 'react'
import RulebookDocShell from '../components/rulebook/RulebookDocShell.jsx'
import RulebookSummary from '../components/rulebook/RulebookSummary.jsx'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import SubNav from '../components/ui/SubNav.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getRulebookContent } from '../services/rulebookContentService.js'
import AnimatedSectionHeader from '../motion/AnimatedSectionHeader.tsx'
import MotionTabPanel from '../motion/MotionTabPanel.tsx'

function RulebookSection({ title, note, index, children }) {
  return (
    <section className="rulebook-section rulebook-section--tab" role="tabpanel">
      <header className="rulebook-section__head">
        <span className="rulebook-section__index" aria-hidden>
          {index}
        </span>
        <h2 className="rulebook-section__title">{title}</h2>
      </header>
      <div className="rulebook-section__body">{children}</div>
      {note && <p className="rulebook-section__note">{note}</p>}
    </section>
  )
}

function ChapterCards({ cards }) {
  return (
    <div className="rulebook-framework-grid">
      {cards.map((card) => (
        <article key={card.title} className="rulebook-framework-card">
          <h3>{card.title}</h3>
          <p>{card.text}</p>
        </article>
      ))}
    </div>
  )
}

function ChapterLifts({ lifts }) {
  return (
    <div className="rulebook-lifts-grid">
      {lifts.map((lift) => (
        <article key={lift.id} className="rulebook-lift-card">
          <header className="rulebook-lift-card__head">
            <h3>{lift.title}</h3>
            <span className="rulebook-lift-card__section">{lift.section}</span>
          </header>
          <ul className="rulebook-lift-card__points">
            {lift.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}

function ChapterCanon({ canon }) {
  return (
    <ol className="rulebook-canon">
      {canon.map((rule) => (
        <li key={rule.numeral} className="rulebook-canon__item">
          <span className="rulebook-canon__numeral" aria-hidden>
            {rule.numeral}
          </span>
          <p>{rule.text}</p>
        </li>
      ))}
    </ol>
  )
}

function AgeWeightAppendix({ ageDivisions, weightClasses, t }) {
  return (
    <div className="rulebook-chapter-appendix">
      <div className="rulebook-chapter-appendix__block">
        <h3 className="rulebook-weight-grid__label">{t('pages.rulebook.divisionsTitle')}</h3>
        <dl className="rulebook-ledger rulebook-ledger--age">
          {ageDivisions.map((division) => (
            <div key={division.title} className="rulebook-ledger__row">
              <dt>{division.title}</dt>
              <dd>{division.range}</dd>
            </div>
          ))}
        </dl>
        <p className="rulebook-section__note">{t('pages.rulebook.divisionsNote')}</p>
      </div>

      <div className="rulebook-chapter-appendix__block">
        <h3 className="rulebook-weight-grid__label">{t('pages.rulebook.weightTitle')}</h3>
        <div className="rulebook-weight-grid">
          {weightClasses.map((group) => (
            <div key={group.id} className="rulebook-weight-grid__group">
              <h4 className="rulebook-weight-grid__label">{group.title}</h4>
              <ul className="rulebook-weight-grid__chips" aria-label={group.title}>
                {group.classes.map((weightClass) => (
                  <li key={`${group.id}-${weightClass.label}`}>
                    <span className="rulebook-weight-chip">
                      <span className="rulebook-weight-chip__value">
                        {weightClass.label}
                        <span className="rulebook-weight-chip__unit">{group.unit}</span>
                      </span>
                      <span className="rulebook-weight-chip__range">{weightClass.range}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="rulebook-section__note">{t('pages.rulebook.weightDisclaimer')}</p>
      </div>
    </div>
  )
}

export default function RulebookPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const rulebook = useMemo(() => getRulebookContent(locale), [locale])

  const tabItems = rulebook.chapters.map((chapter) => ({
    href: `#tab-${chapter.id}`,
    label: chapter.numeral ? `${chapter.numeral}. ${chapter.title}` : chapter.title,
    shortLabel: chapter.numeral || chapter.title,
  }))

  const [activeTab, setActiveTab] = useState(`tab-${rulebook.chapters[0].id}`)

  const downloadMeta = t('pages.rulebook.downloadMeta', {
    version: rulebook.manifest.version,
    pages: rulebook.manifest.pageCount,
  })

  const activeChapter = rulebook.chapters.find((chapter) => `tab-${chapter.id}` === activeTab)

  return (
    <main className="page page--design page--plu-ref rulebook-page rulebook-page--premium">
      <PluPageHero
        breadcrumbLabel={t('pages.rulebook.heroBreadcrumb')}
        chapter={t('pages.rulebook.heroChapter')}
        description={t('pages.rulebook.heroDesc')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.rulebook.heroTitle')}
      />

      <div className="rulebook-page__inner">
        <AnimatedSectionHeader
          align="left"
          className="rulebook-doc-intro motion-section-header--rulebook"
          description={t('pages.rulebook.docSectionLead')}
          eyebrow={t('pages.rulebook.docSectionEyebrow')}
          showRule={false}
          title={t('pages.rulebook.docSectionTitle')}
        />

        <RulebookDocShell
          documents={rulebook.documents}
          downloadMeta={downloadMeta}
          locale={locale}
          manifest={rulebook.manifest}
        />

        <RulebookSummary items={rulebook.summary} />

        <SubNav
          className="sub-nav--rulebook-premium sub-nav--tabs"
          items={tabItems}
          label={t('pages.rulebook.navAria')}
          mode="tabs"
          activeTabId={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="rulebook-tab-panel">
          <MotionTabPanel panelKey={activeTab} className="rulebook-tab-panel__motion">
            {activeChapter ? (
              <RulebookSection
                index={activeChapter.numeral || '·'}
                note={t('pages.rulebook.sourceNote', { section: activeChapter.sourceLabel })}
                title={activeChapter.title}
              >
                {activeChapter.cards && <ChapterCards cards={activeChapter.cards} />}
                {activeChapter.lifts && <ChapterLifts lifts={activeChapter.lifts} />}
                {activeChapter.canon && <ChapterCanon canon={activeChapter.canon} />}
                {activeChapter.includeAgeWeight && (
                  <AgeWeightAppendix
                    ageDivisions={rulebook.ageDivisions}
                    weightClasses={rulebook.weightClasses}
                    t={t}
                  />
                )}
              </RulebookSection>
            ) : null}
          </MotionTabPanel>
        </div>

        <div className="rulebook-page__action">
          <button type="button" className="rulebook-page__link" onClick={() => onNavigate('contact')}>
            {t('pages.rulebook.contactCta')}
          </button>
        </div>
      </div>
    </main>
  )
}
