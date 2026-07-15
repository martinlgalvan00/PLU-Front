import { ArrowRight, Mail } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

const EMPTY_COLUMNS = ['category', 'division', 'lift', 'mark', 'athlete', 'meet']
const LIFT_KEYS = ['squat', 'bench', 'deadlift', 'total']

export default function RecordsPage({ onNavigate }) {
  const { t } = useI18n()

  return (
    <main className="page page--design page--plu-ref records-page records-page--plu-ref">
      <PluPageHero
        breadcrumbLabel={t('pages.records.heroBreadcrumb')}
        chapter={t('pages.records.heroEyebrow')}
        description={t('pages.records.heroDesc')}
        onHome={() => onNavigate('home')}
        title={t('pages.records.heroTitle')}
      />

      <div className="records-page__body">
        <Reveal as="section" className="records-sheet" aria-labelledby="records-sheet-title">
          <header className="records-sheet__head">
            <div className="records-sheet__titles">
              <h2 id="records-sheet-title" className="records-sheet__title">
                {t('pages.records.sheetTitle')}
              </h2>
              <p className="records-sheet__subtitle">{t('pages.records.sheetSubtitle')}</p>
            </div>
            <p className="records-sheet__stamp">{t('pages.records.sheetStamp')}</p>
          </header>

          <ul className="records-sheet__lifts" aria-label={t('pages.records.liftsAria')}>
            {LIFT_KEYS.map((lift) => (
              <li key={lift} className="records-sheet__lift">
                {t(`pages.records.lifts.${lift}`)}
              </li>
            ))}
          </ul>

          <div className="records-sheet__table-wrap" role="presentation">
            <table className="records-sheet__table">
              <thead>
                <tr>
                  {EMPTY_COLUMNS.map((column) => (
                    <th key={column} scope="col">
                      {t(`pages.records.sheetColumns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }, (_, row) => (
                  <tr key={row}>
                    {EMPTY_COLUMNS.map((column) => (
                      <td key={`${row}-${column}`}>—</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="records-sheet__cards" aria-label={t('pages.records.cardsAria')}>
            {LIFT_KEYS.map((lift) => (
              <li key={lift} className="records-sheet__card">
                <div className="records-sheet__card-top">
                  <span className="records-sheet__card-lift">{t(`pages.records.lifts.${lift}`)}</span>
                  <span className="records-sheet__card-mark" aria-hidden>
                    —
                  </span>
                </div>
                <div className="records-sheet__card-meta">
                  <span>{t('pages.records.sheetColumns.category')}</span>
                  <span aria-hidden>·</span>
                  <span>{t('pages.records.sheetColumns.division')}</span>
                  <span aria-hidden>·</span>
                  <span>{t('pages.records.sheetColumns.athlete')}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="records-sheet__foot">
            <div className="records-sheet__copy">
              <p className="records-sheet__empty">{t('pages.records.sheetEmpty')}</p>
              <p className="records-sheet__hint">{t('pages.records.sheetHint')}</p>
            </div>

            <div
              className="records-sheet__actions"
              role="group"
              aria-label={t('pages.records.actionsAria')}
            >
              <Button
                className="records-sheet__cta records-sheet__cta--primary motion-icon-shift"
                onClick={() => onNavigate('results')}
              >
                {t('pages.records.ctaResults')}
                <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
              </Button>
              <Button
                variant="outline"
                className="records-sheet__cta records-sheet__cta--outline"
                onClick={() => onNavigate('contact')}
              >
                <Mail size={14} aria-hidden />
                {t('pages.records.ctaContact')}
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
