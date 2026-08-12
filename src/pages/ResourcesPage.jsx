import '../styles/pages/institutional-pages.css'
import { useMemo } from 'react'
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Download,
  FileText,
  Flag,
  IdCard,
  ListChecks,
  Mail,
  Trophy,
  UsersRound,
} from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getRulebookContent } from '../services/rulebookContentService.js'

function ActionLink({ children, icon: Icon = ArrowRight, onClick }) {
  return (
    <button type="button" className="resource-action-link" onClick={onClick}>
      <span>{children}</span>
      <Icon size={16} aria-hidden />
    </button>
  )
}

export default function ResourcesPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const rulebook = useMemo(() => getRulebookContent(locale), [locale])
  const activeDoc = rulebook.documents.find((document) => document.locale === locale) ?? rulebook.documents[0]
  const fileName = `reglamento-plu-v${rulebook.manifest.version}-${activeDoc?.locale ?? 'es'}.pdf`

  const athletePath = [
    { key: 'members', icon: IdCard },
    { key: 'events', icon: Flag },
    { key: 'rulebook', icon: ListChecks },
    { key: 'standards', icon: BookOpen },
    { key: 'results', icon: Trophy },
  ]

  const supportItems = [
    { key: 'faq', icon: CircleHelp, type: 'help' },
    { key: 'community', icon: UsersRound, type: 'community' },
    { key: 'contact', icon: Mail, type: 'contact' },
  ]

  return (
    <main className="institutional-page resources-page">
      <InstitutionalPageHero
        aside={(
          <dl className="institutional-hero__ledger">
            <div><dt>{t('pages.resources.heroLedgerDocument')}</dt><dd>v{rulebook.manifest.version}</dd></div>
            <div><dt>{t('pages.resources.heroLedgerCoverage')}</dt><dd>{t('pages.resources.heroLedgerAudience')}</dd></div>
          </dl>
        )}
        breadcrumb={t('pages.resources.heroBreadcrumb')}
        description={t('pages.resources.heroDesc')}
        eyebrow={t('pages.resources.heroEyebrow')}
        index="R / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.resources.heroTitle')}
      />

      <div className="institutional-page__inner resources-page__inner">
        <Reveal variant="fade">
          <section className="resource-feature" aria-labelledby="resource-rulebook-title">
            <div className="resource-feature__rail" aria-hidden>
              <span>DOC</span>
              <i />
              <span>26.1</span>
            </div>
            <div className="resource-feature__copy">
              <p className="institutional-kicker">{t('pages.resources.featuredEyebrow')}</p>
              <h2 id="resource-rulebook-title">{t('pages.resources.featuredTitle')}</h2>
              <p>{t('pages.resources.featuredDesc')}</p>
              <dl className="resource-feature__meta">
                <div><dt>{t('pages.resources.version')}</dt><dd>{rulebook.manifest.version}</dd></div>
                <div><dt>{t('pages.resources.pages')}</dt><dd>{rulebook.manifest.pageCount}</dd></div>
                <div><dt>{t('pages.resources.languages')}</dt><dd>ES / EN</dd></div>
              </dl>
              <div className="resource-feature__actions">
                <button type="button" className="institutional-button institutional-button--primary" onClick={() => onNavigate?.('rulebook')}>
                  <BookOpen size={17} aria-hidden />
                  {t('pages.resources.readRulebook')}
                </button>
                {activeDoc ? (
                  <a className="institutional-button institutional-button--quiet" download={fileName} href={activeDoc.url} rel="noopener">
                    <Download size={16} aria-hidden />
                    {t('pages.resources.downloadRulebook')}
                  </a>
                ) : null}
              </div>
            </div>
            <div className="resource-feature__document" aria-hidden>
              <div className="resource-feature__document-spine" />
              <FileText size={30} strokeWidth={1.4} />
              <span>POWERLIFTING UNITED</span>
              <strong>{t('pages.resources.documentCover')}</strong>
              <small>VERSION {rulebook.manifest.version}</small>
              <div className="resource-feature__document-lines"><i /><i /><i /></div>
            </div>
          </section>
        </Reveal>

        <section className="resource-path" aria-labelledby="resource-path-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.resources.pathEyebrow')}</p>
            <div>
              <h2 id="resource-path-title">{t('pages.resources.pathTitle')}</h2>
              <p>{t('pages.resources.pathDesc')}</p>
            </div>
          </header>
          <ol className="resource-path__list">
            {athletePath.map(({ key, icon: Icon }, index) => (
              <li key={key}>
                <button type="button" onClick={() => onNavigate?.(key)}>
                  <span className="resource-path__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="resource-path__icon"><Icon size={18} aria-hidden /></span>
                  <span className="resource-path__copy">
                    <strong>{t(`pages.resources.path.${key}Title`)}</strong>
                    <small>{t(`pages.resources.path.${key}Desc`)}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="resource-support" aria-labelledby="resource-support-title">
          <header className="institutional-section-head institutional-section-head--compact">
            <p className="institutional-kicker">03 / {t('pages.resources.supportEyebrow')}</p>
            <div>
              <h2 id="resource-support-title">{t('pages.resources.supportTitle')}</h2>
              <p>{t('pages.resources.supportDesc')}</p>
            </div>
          </header>
          <div className="resource-support__layout">
            <div className="resource-support__directory">
              {supportItems.map(({ key, icon: Icon, type }, index) => (
                <article key={key} className={`resource-support__row resource-support__row--${type}`}>
                  <span className="resource-support__index">0{index + 1}</span>
                  <Icon size={18} aria-hidden />
                  <div>
                    <h3>{t(`pages.resources.support.${key}Title`)}</h3>
                    <p>{t(`pages.resources.support.${key}Desc`)}</p>
                  </div>
                  <ActionLink onClick={() => onNavigate?.(key)}>{t(`pages.resources.support.${key}Cta`)}</ActionLink>
                </article>
              ))}
            </div>
            <aside className="resource-support__note">
              <span className="resource-support__note-mark" aria-hidden>PLU</span>
              <p className="institutional-kicker">{t('pages.resources.recordsEyebrow')}</p>
              <h3>{t('pages.resources.recordsTitle')}</h3>
              <p>{t('pages.resources.recordsDesc')}</p>
              <ActionLink onClick={() => onNavigate?.('records')}>{t('pages.resources.recordsCta')}</ActionLink>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}
