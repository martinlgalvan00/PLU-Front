import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, ChevronDown } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import RulebookDocShell from '../components/rulebook/RulebookDocShell.jsx'
import RulebookSummary from '../components/rulebook/RulebookSummary.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getRulebookContent } from '../services/rulebookContentService.js'

function RulebookSection({ children, id, index, note, title }) {
  const titleId = `${id}-title`
  return (
    <section className="rulebook-section rulebook-section--document" id={id} aria-labelledby={titleId}>
      <header className="rulebook-section__head">
        <span className="rulebook-section__index" aria-hidden>{index}</span>
        <h2 className="rulebook-section__title" id={titleId}>{title}</h2>
      </header>
      <div className="rulebook-section__body">{children}</div>
      {note ? <p className="rulebook-section__note">{note}</p> : null}
    </section>
  )
}

function ChapterCards({ cards }) {
  return (
    <div className="rulebook-framework-grid">
      {cards.map((card, index) => (
        <article key={card.title} className="rulebook-framework-card">
          <span aria-hidden>{String(index + 1).padStart(2, '0')}</span>
          <div><h3>{card.title}</h3><p>{card.text}</p></div>
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
            {lift.points.map((point) => <li key={point}>{point}</li>)}
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
          <span className="rulebook-canon__numeral" aria-hidden>{rule.numeral}</span>
          <p>{rule.text}</p>
        </li>
      ))}
    </ol>
  )
}

function AgeWeightAppendix({ ageDivisions, weightClasses, t }) {
  return (
    <div className="rulebook-chapter-appendix">
      <div className="rulebook-chapter-appendix__block" id="categorias-divisiones">
        <h3 className="rulebook-weight-grid__label">{t('pages.rulebook.divisionsTitle')}</h3>
        <dl className="rulebook-ledger rulebook-ledger--age">
          {ageDivisions.map((division) => (
            <div key={division.title} className="rulebook-ledger__row"><dt>{division.title}</dt><dd>{division.range}</dd></div>
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
              <div className="rulebook-weight-grid__scroll" tabIndex={0} role="region" aria-label={group.title}>
                <table className="rulebook-weight-table">
                  <thead><tr><th scope="col">kg</th><th scope="col">{t('pages.rulebook.rangeLabel')}</th></tr></thead>
                  <tbody>
                    {group.classes.map((weightClass) => (
                      <tr key={`${group.id}-${weightClass.label}`}><th scope="row">{weightClass.label}</th><td>{weightClass.range}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <p className="rulebook-section__note">{t('pages.rulebook.weightDisclaimer')}</p>
      </div>
    </div>
  )
}

function RulebookIndex({ activeId, chapters, label, mobileLabel, onSelect }) {
  return (
    <>
      <aside className="rulebook-index" aria-label={label}>
        <div className="rulebook-index__head">
          <BookOpen size={16} aria-hidden />
          <span>{label}</span>
        </div>
        <ol>
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <button
                type="button"
                className={activeId === chapter.id ? 'is-active' : ''}
                aria-current={activeId === chapter.id ? 'location' : undefined}
                onClick={() => onSelect(chapter.id)}
              >
                <span>{chapter.numeral || 'A'}</span>
                <strong>{chapter.title}</strong>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <div className="rulebook-index-mobile">
        <label htmlFor="rulebook-section-select">{mobileLabel}</label>
        <span>
          <select id="rulebook-section-select" value={activeId} onChange={(event) => onSelect(event.target.value)}>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.numeral ? `${chapter.numeral} · ` : ''}{chapter.title}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden />
        </span>
      </div>
    </>
  )
}

export default function RulebookPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const rulebook = useMemo(() => getRulebookContent(locale), [locale])
  const [activeChapterId, setActiveChapterId] = useState(rulebook.chapters[0]?.id ?? '')

  useEffect(() => {
    setActiveChapterId(rulebook.chapters[0]?.id ?? '')
  }, [rulebook])

  useEffect(() => {
    const sections = rulebook.chapters
      .map((chapter) => document.getElementById(`rule-${chapter.id}`))
      .filter(Boolean)
    if (!sections.length) return undefined

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
      const id = visible[0]?.target.id.replace(/^rule-/, '')
      if (id) setActiveChapterId(id)
    }, { rootMargin: '-22% 0px -62% 0px', threshold: [0, 0.1, 0.35] })

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [rulebook])

  const downloadMeta = t('pages.rulebook.downloadMeta', {
    version: rulebook.manifest.version,
    pages: rulebook.manifest.pageCount,
  })

  function selectChapter(id) {
    setActiveChapterId(id)
    document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="institutional-page rulebook-page--institutional">
      <InstitutionalPageHero
        aside={(
          <dl className="institutional-hero__ledger">
            <div><dt>{t('pages.rulebook.versionLabel')}</dt><dd>{rulebook.manifest.version}</dd></div>
            <div><dt>{t('pages.rulebook.pagesLabel')}</dt><dd>{rulebook.manifest.pageCount}</dd></div>
            <div><dt>{t('pages.rulebook.languageLabel')}</dt><dd>ES / EN</dd></div>
          </dl>
        )}
        breadcrumb={t('pages.rulebook.heroBreadcrumbShort')}
        description={t('pages.rulebook.heroDesc')}
        eyebrow={t('pages.rulebook.heroChapter')}
        index="RB / 26.1"
        onHome={() => onNavigate?.('home')}
        title={t('pages.rulebook.heroTitle')}
      />

      <div className="institutional-page__inner rulebook-institutional__inner">
        <section className="rulebook-document-block" aria-labelledby="rulebook-document-title">
          <header className="rulebook-document-block__head">
            <p className="rulebook-document-block__kicker">01 / {t('pages.rulebook.docSectionEyebrow')}</p>
            <div className="rulebook-document-block__copy">
              <h2 id="rulebook-document-title">{t('pages.rulebook.docSectionTitle')}</h2>
              <p>{t('pages.rulebook.docSectionLead')}</p>
            </div>
          </header>
          <RulebookDocShell documents={rulebook.documents} downloadMeta={downloadMeta} locale={locale} manifest={rulebook.manifest} />
        </section>

        <RulebookSummary items={rulebook.summary} />

        <section className="rulebook-reading" aria-labelledby="rulebook-reading-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.rulebook.readingEyebrow')}</p>
            <div><h2 id="rulebook-reading-title">{t('pages.rulebook.readingTitle')}</h2><p>{t('pages.rulebook.readingDesc')}</p></div>
          </header>

          <RulebookIndex
            activeId={activeChapterId}
            chapters={rulebook.chapters}
            label={t('pages.rulebook.indexTitle')}
            mobileLabel={t('pages.rulebook.indexMobileLabel')}
            onSelect={selectChapter}
          />

          <div className="rulebook-reading__content">
            {rulebook.chapters.map((chapter) => (
              <RulebookSection
                id={`rule-${chapter.id}`}
                index={chapter.numeral || 'A'}
                key={chapter.id}
                note={t('pages.rulebook.sourceNote', { section: chapter.sourceLabel })}
                title={chapter.title}
              >
                {chapter.cards ? <ChapterCards cards={chapter.cards} /> : null}
                {chapter.lifts ? <ChapterLifts lifts={chapter.lifts} /> : null}
                {chapter.canon ? <ChapterCanon canon={chapter.canon} /> : null}
                {chapter.includeAgeWeight ? <AgeWeightAppendix ageDivisions={rulebook.ageDivisions} weightClasses={rulebook.weightClasses} t={t} /> : null}
              </RulebookSection>
            ))}
          </div>
        </section>

        <section className="rulebook-contact-band" aria-labelledby="rulebook-contact-title">
          <div><p className="institutional-kicker">{t('pages.rulebook.technicalEyebrow')}</p><h2 id="rulebook-contact-title">{t('pages.rulebook.technicalTitle')}</h2></div>
          <button type="button" className="institutional-button institutional-button--quiet" onClick={() => onNavigate?.('contact')}>
            {t('pages.rulebook.contactCta')}<ArrowRight size={16} aria-hidden />
          </button>
        </section>
      </div>
    </main>
  )
}
