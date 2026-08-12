import '../styles/pages/design-phase2.css'
import '../styles/pages/records.css'
import { useMemo, useState } from 'react'
import { ArrowRight, Mail, Search, X } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import ExportButton from '../components/ui/ExportButton.jsx'
import FilterPills from '../components/ui/FilterPills.jsx'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { formatShortDate } from '../lib/format.js'
import {
  buildRecordsCsv,
  buildRecordsRegister,
  downloadRecordsCsv,
  filterRecordsRegister,
  getRecordsEquipmentFilters,
  getRecordsGroupFilters,
  getRecordsLiftFilters,
  getRecordsSexFilters,
  groupRecordsFederated,
  RECORD_LIFTS,
} from '../services/recordsService.js'

const TABLE_COLUMNS = ['lift', 'athlete', 'meet', 'date', 'mark']

function RecordsClassTable({ weightClassBlock, locale, t, visibleLifts }) {
  return (
    <article className="records-class" aria-labelledby={`records-class-${weightClassBlock.id}`}>
      <header className="records-class__head">
        <h4 id={`records-class-${weightClassBlock.id}`} className="records-class__title">
          {t('pages.records.classTitle', {
            weight: weightClassBlock.weightClass,
            equipment: weightClassBlock.equipment,
          })}
        </h4>
      </header>

      <div className="records-class__table-wrap">
        <table className="records-class__table">
          <thead>
            <tr>
              {TABLE_COLUMNS.map((column) => (
                <th key={column} scope="col">
                  {t(`pages.records.sheetColumns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleLifts.map((lift) => {
              const entry = weightClassBlock.lifts[lift]
              return (
                <tr key={lift}>
                  <th scope="row">{t(`pages.records.lifts.${lift}`)}</th>
                  <td>{entry?.athlete ?? '—'}</td>
                  <td>{entry?.meet ?? '—'}</td>
                  <td>
                    {entry?.dateISO
                      ? formatShortDate(entry.dateISO, locale)
                      : '—'}
                  </td>
                  <td className="records-class__mark">
                    {entry?.markLabel ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export default function RecordsPage({ onNavigate }) {
  const { locale, t } = useI18n()
  const [liftFilter, setLiftFilter] = useState('all')
  const [sexFilter, setSexFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [equipmentFilter, setEquipmentFilter] = useState('all')
  const [query, setQuery] = useState('')

  const register = useMemo(() => buildRecordsRegister(), [])
  const liftFilters = useMemo(() => getRecordsLiftFilters(t), [t])
  const sexFilters = useMemo(() => getRecordsSexFilters(t), [t])
  const groupFilters = useMemo(
    () => getRecordsGroupFilters(t, register.entries),
    [register.entries, t],
  )
  const equipmentFilters = useMemo(
    () => getRecordsEquipmentFilters(t, register.entries),
    [register.entries, t],
  )

  const entries = useMemo(
    () => filterRecordsRegister(register.entries, {
      lift: liftFilter,
      sex: sexFilter,
      group: groupFilter,
      equipment: equipmentFilter,
      query,
    }),
    [equipmentFilter, groupFilter, liftFilter, query, register.entries, sexFilter],
  )

  const sections = useMemo(() => groupRecordsFederated(entries), [entries])
  const visibleLifts = liftFilter === 'all' ? RECORD_LIFTS : [liftFilter]
  const hasRecords = register.entries.length > 0
  const filtersActive =
    query.trim() !== ''
    || sexFilter !== 'all'
    || groupFilter !== 'all'
    || equipmentFilter !== 'all'
    || liftFilter !== 'all'
  const showEquipmentRow = equipmentFilters.length > 2
  const stamp = hasRecords
    ? t('pages.records.sheetStampLive', {
      count: register.entries.length,
      meets: register.meetCount,
    })
    : t('pages.records.sheetStamp')

  function handleExport() {
    if (!entries.length) return
    const csv = buildRecordsCsv(entries, t)
    downloadRecordsCsv(csv, `plu-records-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function clearFilters() {
    setQuery('')
    setSexFilter('all')
    setGroupFilter('all')
    setEquipmentFilter('all')
    setLiftFilter('all')
  }

  return (
    <main className="page page--design page--plu-ref records-page records-page--plu-ref records-page--federated">
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
            <div className="records-sheet__head-meta">
              <p className="records-sheet__stamp">{stamp}</p>
              {hasRecords ? (
                <ExportButton
                  iconOnly
                  className="records-sheet__export"
                  label={t('pages.records.exportCta')}
                  onClick={handleExport}
                  disabled={entries.length === 0}
                />
              ) : null}
            </div>
          </header>

          {hasRecords ? (
            <div className="records-sheet__toolbar" role="search" aria-label={t('pages.records.filtersToolbarAria')}>
              <div className="records-sheet__toolbar-search">
                <label className="records-sheet__search">
                  <Search size={15} aria-hidden />
                  <span className="visually-hidden">{t('pages.records.searchLabel')}</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('pages.records.searchPlaceholder')}
                    autoComplete="off"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="records-sheet__search-clear"
                      onClick={() => setQuery('')}
                      aria-label={t('pages.records.clearSearch')}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  ) : null}
                </label>

                <div className="records-sheet__toolbar-meta">
                  <p className="records-sheet__count" aria-live="polite">
                    {t('pages.records.visibleCount', { count: entries.length })}
                  </p>
                  {filtersActive ? (
                    <button
                      type="button"
                      className="records-sheet__clear"
                      onClick={clearFilters}
                    >
                      {t('pages.records.clearFilters')}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="records-sheet__filter-row records-sheet__filter-row--sex">
                <p className="records-sheet__filter-label" id="records-filter-sex-label">
                  {t('pages.records.filterSexLabel')}
                </p>
                <FilterPills
                  active={sexFilter}
                  ariaLabel={t('pages.records.sexFiltersAria')}
                  className="records-sheet__pills records-sheet__pills--sex filter-pills--refined"
                  onChange={setSexFilter}
                  options={sexFilters}
                />
              </div>

              <div className="records-sheet__filter-row">
                <p className="records-sheet__filter-label" id="records-filter-group-label">
                  {t('pages.records.filterGroupLabel')}
                </p>
                <FilterPills
                  active={groupFilter}
                  ariaLabel={t('pages.records.groupFiltersAria')}
                  className="records-sheet__pills filter-pills--refined"
                  onChange={setGroupFilter}
                  options={groupFilters}
                />
              </div>

              {showEquipmentRow ? (
                <div className="records-sheet__filter-row">
                  <p className="records-sheet__filter-label" id="records-filter-equipment-label">
                    {t('pages.records.filterEquipmentLabel')}
                  </p>
                  <FilterPills
                    active={equipmentFilter}
                    ariaLabel={t('pages.records.equipmentFiltersAria')}
                    className="records-sheet__pills filter-pills--refined"
                    onChange={setEquipmentFilter}
                    options={equipmentFilters}
                  />
                </div>
              ) : null}

              <div className="records-sheet__filter-row">
                <p className="records-sheet__filter-label" id="records-filter-lift-label">
                  {t('pages.records.filterLiftLabel')}
                </p>
                <FilterPills
                  active={liftFilter}
                  ariaLabel={t('pages.records.liftsAria')}
                  className="records-sheet__pills filter-pills--refined"
                  onChange={setLiftFilter}
                  options={liftFilters}
                />
              </div>
            </div>
          ) : (
            <div className="records-sheet__lifts" role="toolbar" aria-label={t('pages.records.liftsAria')}>
              {liftFilters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={[
                    'records-sheet__lift',
                    liftFilter === key ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  aria-pressed={liftFilter === key}
                  onClick={() => setLiftFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {hasRecords && sections.length > 0 ? (
            <div className="records-federated">
              {sections.map((section) => (
                <section
                  key={section.id}
                  className="records-section"
                  aria-labelledby={`records-section-${section.id}`}
                >
                  <h3 id={`records-section-${section.id}`} className="records-section__title">
                    {t('pages.records.sectionTitle', {
                      sex: section.sex === 'women'
                        ? t('pages.records.filters.sexWomen')
                        : section.sex === 'men'
                          ? t('pages.records.filters.sexMen')
                          : t('pages.records.filters.sexAll'),
                      group: t(`pages.results.divisionGroups.${section.group}`),
                    })}
                  </h3>

                  <div className="records-section__classes">
                    {section.classes.map((weightClassBlock) => (
                      <RecordsClassTable
                        key={weightClassBlock.id}
                        weightClassBlock={weightClassBlock}
                        locale={locale}
                        t={t}
                        visibleLifts={visibleLifts}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {hasRecords && entries.length === 0 ? (
            <p className="records-sheet__empty">{t('pages.records.filterEmpty')}</p>
          ) : null}

          {!hasRecords ? (
            <div className="records-sheet__table-wrap" role="presentation">
              <table className="records-sheet__table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map((column) => (
                      <th key={column} scope="col">
                        {t(`pages.records.sheetColumns.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }, (_, row) => (
                    <tr key={row}>
                      {TABLE_COLUMNS.map((column) => (
                        <td key={`${row}-${column}`}>—</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <ul className="records-sheet__cards" aria-label={t('pages.records.cardsAria')}>
            {!hasRecords
              ? RECORD_LIFTS.map((lift) => (
                <li key={lift} className="records-sheet__card">
                  <div className="records-sheet__card-top">
                    <span className="records-sheet__card-lift">{t(`pages.records.lifts.${lift}`)}</span>
                    <span className="records-sheet__card-mark">—</span>
                  </div>
                </li>
              ))
              : null}
          </ul>

          <div className="records-sheet__foot">
            <div className="records-sheet__copy">
              {!hasRecords ? (
                <p className="records-sheet__empty">{t('pages.records.sheetEmpty')}</p>
              ) : null}
              <p className="records-sheet__hint">
                {hasRecords
                  ? t('pages.records.sheetHintLive', {
                    meets: register.sourceMeets.join(', '),
                  })
                  : t('pages.records.sheetHint')}
              </p>
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
              {!hasRecords ? (
                <>
                  <Button
                    variant="outline"
                    className="records-sheet__cta records-sheet__cta--outline"
                    onClick={() => onNavigate('events')}
                  >
                    {t('pages.records.ctaCalendar')}
                  </Button>
                  <Button
                    variant="outline"
                    className="records-sheet__cta records-sheet__cta--outline"
                    onClick={() => onNavigate('members')}
                  >
                    {t('pages.records.ctaMembers')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="records-sheet__cta records-sheet__cta--outline"
                  onClick={() => onNavigate('contact')}
                >
                  <Mail size={14} aria-hidden />
                  {t('pages.records.ctaContact')}
                </Button>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
