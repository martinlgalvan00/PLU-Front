import { MapPin, X } from 'lucide-react'
import Podium from './Podium.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getEventResults } from '../../services/resultsService.js'

function formatWeight(value, locale) {
  if (value == null) return '—'
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.0', '')
  return locale === 'en' ? `${formatted} kg` : `${formatted} kg`
}

export default function ResultsEventPanel({ entry, onClose }) {
  const { locale, t } = useI18n()
  const results = getEventResults(entry.slug)

  if (!results) return null

  return (
    <div className="results-event-panel" role="region" aria-label={t('pages.results.detailAria', { event: entry.title })}>
      <header className="results-event-panel__head">
        <div>
          <span className="results-event-panel__eyebrow">{t('pages.results.detailEyebrow')}</span>
          <h3 className="results-event-panel__title">{entry.title}</h3>
          <p className="results-event-panel__meta">
            <MapPin size={12} aria-hidden />
            {entry.venue} · {entry.location}
          </p>
        </div>
        <button
          type="button"
          className="results-event-panel__close"
          aria-label={t('pages.results.detailClose')}
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="results-podium results-podium--embedded">
        <header className="results-podium__header">
          <span className="results-podium__eyebrow">{t('pages.results.podiumEyebrow')}</span>
          <h4 className="results-podium__title">{t('pages.results.podiumTitle')}</h4>
        </header>
        <Podium results={results.podium} />
      </div>

      <div className="results-event-panel__divisions">
        {results.divisions.map((division) => (
          <section key={division.name} className="results-division">
            <h4 className="results-division__title">{division.name}</h4>
            <div className="results-lifters-table-wrap">
              <table className="results-lifters-table">
                <thead>
                  <tr>
                    <th scope="col">{t('pages.results.tablePlace')}</th>
                    <th scope="col">{t('pages.results.tableAthlete')}</th>
                    <th scope="col">{t('pages.results.tableBw')}</th>
                    <th scope="col">{t('pages.results.tableSquat')}</th>
                    <th scope="col">{t('pages.results.tableBench')}</th>
                    <th scope="col">{t('pages.results.tableDeadlift')}</th>
                    <th scope="col">{t('pages.results.tableTotal')}</th>
                    <th scope="col">{t('pages.results.tableDots')}</th>
                  </tr>
                </thead>
                <tbody>
                  {division.lifters.map((lifter) => (
                    <tr key={`${division.name}-${lifter.name}`}>
                      <td className="results-lifters-table__place">{lifter.place}</td>
                      <th scope="row" className="results-lifters-table__name">
                        {lifter.name}
                      </th>
                      <td>{formatWeight(lifter.bodyweight, locale)}</td>
                      <td>{formatWeight(lifter.squat, locale)}</td>
                      <td>{formatWeight(lifter.bench, locale)}</td>
                      <td>{formatWeight(lifter.deadlift, locale)}</td>
                      <td className="results-lifters-table__total">{formatWeight(lifter.total, locale)}</td>
                      <td>{lifter.dots?.toFixed(1) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
