import { useEffect, useId, useMemo, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import Podium from './Podium.jsx'
import Reveal from './Reveal.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatShortDate } from '../../lib/format.js'
import MotionContentSwap from '../../motion/MotionContentSwap.tsx'
import { getPublicMeetSheet } from '../../services/publicResultsService.js'
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

function formatAwardScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toFixed(1)
}

export default function ResultsEventPanel({ entry, onClose }) {
  const { locale, t } = useI18n()
  const sample = getEventResults(entry.slug)
  const wantsSheet = entry.resultsSource === 'sheet'
  const [sheet, setSheet] = useState(null)
  const [phase, setPhase] = useState(wantsSheet && !sample ? 'loading' : 'ready')
  const baseId = useId()
  const [sexFilter, setSexFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  useEffect(() => {
    if (!wantsSheet) {
      setSheet(null)
      setPhase('ready')
      return undefined
    }

    let cancelled = false
    setSheet(null)
    setPhase(sample ? 'ready' : 'loading')
    getPublicMeetSheet(entry.slug)
      .then((data) => {
        if (cancelled) return
        setSheet(data)
        setPhase('ready')
      })
      .catch(() => {
        if (cancelled) return
        setPhase(sample ? 'ready' : 'error')
      })

    return () => {
      cancelled = true
    }
  }, [entry.slug, sample, wantsSheet])

  const results = sheet ?? sample
  const showStatus = !results && phase !== 'ready'

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
    const stillVisible = filterDivisionNav(navItems, { sex: sexFilter }).some(
      (item) => item.group === groupFilter,
    )
    if (!stillVisible) setGroupFilter('all')
  }, [groupFilter, navItems, sexFilter])

  if (!results && !showStatus) return null

  const showNav = Boolean(sexOptions || groupOptions)
  const filterKey = `${sexFilter}|${groupFilter}`
  const eventDate = entry.dateISO ? formatShortDate(entry.dateISO, locale) : null

  return (
    <div
      className="results-event-panel results-event-panel--editorial"
      role="region"
      aria-label={t('pages.results.detailAria', { event: entry.title })}
    >
      <Reveal as="header" className="results-event-panel__head" delay={90} distance={12}>
        <div className="results-event-panel__intro">
          <p className="results-event-panel__kicker">
            <span className="results-event-panel__eyebrow">{t('pages.results.detailEyebrow')}</span>
            {eventDate ? <span className="results-event-panel__date">{eventDate}</span> : null}
          </p>
          <h3 className="results-event-panel__title">{entry.title}</h3>
          <p className="results-event-panel__meta">
            <MapPin size={12} aria-hidden />
            <span>
              {entry.venue}
              {entry.location ? ` · ${entry.location}` : ''}
            </span>
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
      </Reveal>

      {showStatus ? (
        <p className="results-event-panel__status" role="status">
          {phase === 'error' ? t('pages.results.sheetError') : t('pages.results.sheetLoading')}
        </p>
      ) : (
        <>
      {results.awards?.bestLifter || results.awards?.bestTeam ? (
        <dl className="results-event-panel__awards">
          {results.awards.bestLifter ? (
            <div className="results-event-panel__award">
              <dt>{t('pages.results.awardsBestLifter')}</dt>
              <dd>
                {t('pages.results.awardsValue', {
                  name: results.awards.bestLifter.name,
                  score: formatAwardScore(results.awards.bestLifter.score),
                })}
              </dd>
            </div>
          ) : null}
          {results.awards.bestTeam ? (
            <div className="results-event-panel__award">
              <dt>{t('pages.results.awardsBestTeam')}</dt>
              <dd>
                {t('pages.results.awardsValue', {
                  name: results.awards.bestTeam.name,
                  score: formatAwardScore(results.awards.bestTeam.score),
                })}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <Reveal className="results-podium results-podium--embedded" delay={160} distance={16}>
        <header className="results-podium__header results-podium__header--editorial">
          <span className="results-podium__eyebrow">{t('pages.results.podiumEyebrow')}</span>
          <h4 className="results-podium__title">{t('pages.results.podiumTitle')}</h4>
        </header>
        <Podium results={results.podium} />
      </Reveal>

      {showNav ? (
        <Reveal className="results-event-panel__nav" delay={220} distance={10}>
          <div className="results-event-panel__nav-top">
            <div className="results-event-panel__nav-copy">
              <span className="results-event-panel__nav-label">
                {t('pages.results.divisionsNavLabel')}
              </span>
              <span className="results-event-panel__nav-count">
                {t('pages.results.divisionsCount', {
                  shown: visibleItems.length,
                  total: navItems.length,
                })}
              </span>
            </div>

            {sexOptions ? (
              <div
                className="results-event-panel__sex-shell"
                role="tablist"
                aria-label={t('pages.results.divisionSexAria')}
              >
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
            <div
              className="results-event-panel__groups"
              role="tablist"
              aria-label={t('pages.results.divisionsNavAria')}
            >
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
        </Reveal>
      ) : null}

      <MotionContentSwap swapKey={filterKey} className="results-event-panel__divisions">
        {visibleItems.length === 0 ? (
          <p className="results-event-panel__empty">{t('pages.results.divisionsEmpty')}</p>
        ) : (
          visibleItems.map((item, index) => (
            <Reveal
              key={item.id}
              as="section"
              id={`${baseId}-${item.id}`}
              className="results-division"
              aria-labelledby={`${baseId}-${item.id}-title`}
              delay={Math.min(index, 5) * 45}
              distance={14}
              amount={0.12}
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
                        <td className="results-lifters-table__total">
                          {formatWeight(lifter.total, locale)}
                        </td>
                        <td className="results-lifters-table__dots">
                          {lifter.dots?.toFixed(1) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          ))
        )}
      </MotionContentSwap>
        </>
      )}
    </div>
  )
}
