import { useEffect, useId, useMemo, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import Podium from './Podium.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  buildDivisionNav,
  filterDivisionNav,
  getDivisionGroupOptions,
  getDivisionSexOptions,
  getEventResults,
} from '../../services/resultsService.js'

function formatWeight(value, locale) {
  if (value == null) return '—'
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.0', '')
  return locale === 'en' ? `${formatted} kg` : `${formatted} kg`
}

export default function ResultsEventPanel({ entry, onClose }) {
  const { locale, t } = useI18n()
  const results = getEventResults(entry.slug)
  const baseId = useId()
  const [sexFilter, setSexFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  const navItems = useMemo(() => buildDivisionNav(results?.divisions ?? []), [results])
  const sexOptions = useMemo(() => getDivisionSexOptions(navItems, t), [navItems, t])
  const groupOptions = useMemo(() => getDivisionGroupOptions(navItems, t), [navItems, t])
  const visibleItems = useMemo(
    () => filterDivisionNav(navItems, { sex: sexFilter, group: groupFilter }),
    [navItems, sexFilter, groupFilter],
  )

  useEffect(() => {
    setSexFilter('all')
    setGroupFilter('all')
  }, [entry.slug])

  useEffect(() => {
    if (groupFilter === 'all') return
    const stillVisible = filterDivisionNav(navItems, { sex: sexFilter }).some((item) => item.group === groupFilter)
    if (!stillVisible) setGroupFilter('all')
  }, [groupFilter, navItems, sexFilter])

  if (!results) return null

  const showNav = Boolean(sexOptions || groupOptions)

  return (
    <div className="results-event-panel" role="region" aria-label={t('pages.results.detailAria', { event: entry.title })}>
      <header className="results-event-panel__head">
        <div className="results-event-panel__intro">
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

      {showNav ? (
        <div className="results-event-panel__nav">
          <div className="results-event-panel__nav-top">
            <div className="results-event-panel__nav-copy">
              <span className="results-event-panel__nav-label">{t('pages.results.divisionsNavLabel')}</span>
              <span className="results-event-panel__nav-count">
                {t('pages.results.divisionsCount', {
                  shown: visibleItems.length,
                  total: navItems.length,
                })}
              </span>
            </div>

            {sexOptions ? (
              <div className="results-event-panel__sex-shell" role="tablist" aria-label={t('pages.results.divisionSexAria')}>
                {sexOptions.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={sexFilter === key}
                    className={`results-event-panel__sex-item ${sexFilter === key ? 'is-active' : ''}`}
                    onClick={() => setSexFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {groupOptions ? (
            <div className="results-event-panel__groups" role="tablist" aria-label={t('pages.results.divisionsNavAria')}>
              {groupOptions.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={groupFilter === key}
                  className={`results-event-panel__group ${groupFilter === key ? 'is-active' : ''}`}
                  onClick={() => setGroupFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="results-event-panel__divisions">
        {visibleItems.length === 0 ? (
          <p className="results-event-panel__empty">{t('pages.results.divisionsEmpty')}</p>
        ) : (
          visibleItems.map((item) => (
            <section
              key={item.id}
              id={`${baseId}-${item.id}`}
              className="results-division"
              aria-labelledby={`${baseId}-${item.id}-title`}
            >
              <div className="results-division__head">
                <h4 id={`${baseId}-${item.id}-title`} className="results-division__title">
                  {item.name}
                </h4>
                <span className="results-division__count">
                  {item.lifterCount === 1
                    ? t('pages.results.liftersCount_one', { count: item.lifterCount })
                    : t('pages.results.liftersCount_other', { count: item.lifterCount })}
                </span>
              </div>
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
                    {item.division.lifters.map((lifter) => (
                      <tr key={`${item.name}-${lifter.name}`}>
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
          ))
        )}
      </div>
    </div>
  )
}
