import { useMemo, useState } from 'react'
import RulebookDocShell from '../components/rulebook/RulebookDocShell.jsx'
import RulebookSummary from '../components/rulebook/RulebookSummary.jsx'
import DesignPageHero from '../components/layout/DesignPageHero.jsx'
import SubNav from '../components/ui/SubNav.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getRulebookContent } from '../services/rulebookContentService.js'

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

export default function RulebookPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const rulebook = useMemo(() => getRulebookContent(locale), [locale])

  const tabItems = [
    {
      href: '#tab-marco',
      label: t('pages.rulebook.navFramework'),
      shortLabel: t('pages.rulebook.navFrameworkShort'),
    },
    {
      href: '#tab-peso',
      label: t('pages.rulebook.navWeight'),
      shortLabel: t('pages.rulebook.navWeightShort'),
    },
    {
      href: '#tab-edad',
      label: t('pages.rulebook.navDivisions'),
      shortLabel: t('pages.rulebook.navDivisionsShort'),
    },
    {
      href: '#tab-equipamiento',
      label: t('pages.rulebook.navEquipment'),
      shortLabel: t('pages.rulebook.navEquipmentShort'),
    },
    {
      href: '#tab-levantamientos',
      label: t('pages.rulebook.navLifts'),
      shortLabel: t('pages.rulebook.navLiftsShort'),
    },
    {
      href: '#tab-jueceo',
      label: t('pages.rulebook.navJudging'),
      shortLabel: t('pages.rulebook.navJudgingShort'),
    },
  ]

  const [activeTab, setActiveTab] = useState('tab-marco')

  const downloadMeta = t('pages.rulebook.downloadMeta', {
    version: rulebook.manifest.version,
    pages: rulebook.manifest.pageCount,
  })

  return (
    <main className="page page--design rulebook-page rulebook-page--premium">
      <DesignPageHero
        className="rulebook-hero"
        compact
        breadcrumbLabel={t('pages.rulebook.heroBreadcrumb')}
        onHome={() => onNavigate?.('home')}
        title={t('pages.rulebook.heroTitle')}
        description={t('pages.rulebook.heroDesc')}
      />

      <div className="rulebook-page__inner">
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
          {activeTab === 'tab-marco' && (
            <RulebookSection
              index="01"
              note={t('pages.rulebook.frameworkNote', {
                section: rulebook.manifest.sourceSection.framework,
              })}
              title={t('pages.rulebook.frameworkTitle')}
            >
              <div className="rulebook-framework-grid">
                {rulebook.framework.map((item) => (
                  <article key={item.title} className="rulebook-framework-card">
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
            </RulebookSection>
          )}

          {activeTab === 'tab-peso' && (
            <RulebookSection
              index="02"
              note={t('pages.rulebook.weightDisclaimer', { section: rulebook.manifest.sourceSection.weight })}
              title={t('pages.rulebook.weightTitle')}
            >
              <div className="rulebook-weight-grid">
                {rulebook.weightClasses.map((group) => (
                  <div key={group.id} className="rulebook-weight-grid__group">
                    <h3 className="rulebook-weight-grid__label">{group.title}</h3>
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
            </RulebookSection>
          )}

          {activeTab === 'tab-edad' && (
            <RulebookSection
              index="03"
              note={t('pages.rulebook.divisionsNote', { section: rulebook.manifest.sourceSection.age })}
              title={t('pages.rulebook.divisionsTitle')}
            >
              <dl className="rulebook-ledger rulebook-ledger--age">
                {rulebook.ageDivisions.map((division) => (
                  <div key={division.title} className="rulebook-ledger__row">
                    <dt>{division.title}</dt>
                    <dd>{division.range}</dd>
                  </div>
                ))}
              </dl>
            </RulebookSection>
          )}

          {activeTab === 'tab-equipamiento' && (
            <RulebookSection
              index="04"
              note={t('pages.rulebook.equipmentNote', { section: rulebook.manifest.sourceSection.equipment })}
              title={t('pages.rulebook.equipmentTitle')}
            >
              <div className="rulebook-modality-grid">
                {rulebook.equipment.map((item) => (
                  <article key={item.title} className="rulebook-modality-card">
                    <h3 className="rulebook-modality-card__title">{item.title}</h3>
                    <p className="rulebook-modality-card__text">{item.text}</p>
                  </article>
                ))}
              </div>
            </RulebookSection>
          )}

          {activeTab === 'tab-levantamientos' && (
            <RulebookSection
              index="05"
              note={t('pages.rulebook.liftsNote', { section: rulebook.manifest.sourceSection.lifts })}
              title={t('pages.rulebook.liftsTitle')}
            >
              <div className="rulebook-lifts-grid">
                {rulebook.lifts.map((lift) => (
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
            </RulebookSection>
          )}

          {activeTab === 'tab-jueceo' && (
            <RulebookSection
              index="06"
              note={t('pages.rulebook.judgingNote', { section: rulebook.manifest.sourceSection.judging })}
              title={t('pages.rulebook.judgingTitle')}
            >
              <ol className="rulebook-canon">
                {rulebook.judging.map((rule) => (
                  <li key={rule.numeral} className="rulebook-canon__item">
                    <span className="rulebook-canon__numeral" aria-hidden>
                      {rule.numeral}
                    </span>
                    <p>{rule.text}</p>
                  </li>
                ))}
              </ol>
            </RulebookSection>
          )}
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
