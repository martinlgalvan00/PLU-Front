import { useMemo, useState } from 'react'
import Button from '../../ui/Button.jsx'
import SegmentedSwitch from '../../ui/SegmentedSwitch.jsx'
import {
  DEFAULT_PLAN_OPTIONS,
  PLAN_GROUP_KEYS,
  planEventBoard,
} from '../../../services/eventBoardPlanner.js'

const GROUP_LABEL_KEY = {
  sex: 'admin.board.filterSex',
  category: 'admin.board.filterCategory',
  division: 'admin.board.filterDivision',
}

/**
 * PlanPanel — PLU ARG
 *
 * Armado automático de tandas con propuesta antes de escribir nada. El
 * operador elige qué separa a dos atletas (sexo, categoría, división), cómo se
 * ordena un grupo al partirlo (peso o edad), el tope por tanda, los días y cómo
 * se reparten los tablados; la propuesta se recalcula en vivo y recién
 * "Confirmar" crea las tandas y mueve a la gente.
 *
 * Solo toca a quienes la bolsa muestra sin ubicar (respeta los filtros activos):
 * nunca mueve a alguien que ya tiene día.
 */
export default function PlanPanel({
  athletes,
  busy,
  days,
  flightSize,
  onApply,
  onClose,
  platforms,
  t,
}) {
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_PLAN_OPTIONS,
    maxPerSession: flightSize,
    dayIndexes: days.map((day) => day.dayIndex),
  }))
  const set = (patch) => setOptions((current) => ({ ...current, ...patch }))

  const plan = useMemo(
    () => planEventBoard({ unassigned: athletes, days, platforms, ...options }),
    [athletes, days, platforms, options],
  )

  const toggleIn = (field, value) =>
    set({
      [field]: options[field].includes(value)
        ? options[field].filter((item) => item !== value)
        : [...options[field], value],
    })

  const noSexCriterion = !options.groupBy.includes('sex')
  const byDay = useMemo(() => {
    const map = new Map()
    for (const row of plan.summaries) {
      if (!map.has(row.dayIndex)) map.set(row.dayIndex, { label: row.dayLabel, rows: [] })
      map.get(row.dayIndex).rows.push(row)
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [plan.summaries])

  const newCount = plan.summaries.filter((row) => row.isNew).length

  return (
    <section className="admin-board__plan" aria-label={t('admin.board.planTitle')}>
      <header className="admin-board__plan-head">
        <h2 className="admin-board__plan-title">{t('admin.board.planTitle')}</h2>
        <p className="admin-board__plan-lead">
          {t('admin.board.planScope', { count: athletes.length })}
        </p>
      </header>

      <div className="admin-board__plan-form">
        <fieldset className="admin-board__plan-field">
          <legend>{t('admin.board.planGroupBy')}</legend>
          <div className="admin-board__plan-checks">
            {PLAN_GROUP_KEYS.map((key) => (
              <label key={key} className="admin-board__plan-check">
                <input
                  type="checkbox"
                  checked={options.groupBy.includes(key)}
                  onChange={() => toggleIn('groupBy', key)}
                />
                <span>{t(GROUP_LABEL_KEY[key])}</span>
              </label>
            ))}
          </div>
          {noSexCriterion ? (
            <p className="admin-board__plan-warn" role="status">
              {t('admin.board.planMixedWarning')}
            </p>
          ) : null}
        </fieldset>

        <div className="admin-board__plan-field">
          <span className="admin-board__plan-label">{t('admin.board.planSortBy')}</span>
          <SegmentedSwitch
            active={options.sortBy}
            ariaLabel={t('admin.board.planSortBy')}
            className="admin-board__view-switch"
            onChange={(sortBy) => set({ sortBy })}
            options={[
              ['weight', t('admin.board.planSortWeight')],
              ['age', t('admin.board.planSortAge')],
            ]}
          />
        </div>

        <label className="admin-board__plan-field admin-board__plan-field--narrow">
          <span className="admin-board__plan-label">{t('admin.board.flightSize')}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={options.maxPerSession}
            onChange={(event) => set({ maxPerSession: Number(event.target.value) || 1 })}
          />
        </label>

        {days.length > 1 ? (
          <fieldset className="admin-board__plan-field">
            <legend>{t('admin.board.planDays')}</legend>
            <div className="admin-board__plan-checks">
              {days.map((day) => (
                <label key={day.id} className="admin-board__plan-check">
                  <input
                    type="checkbox"
                    checked={options.dayIndexes.includes(day.dayIndex)}
                    onChange={() => toggleIn('dayIndexes', day.dayIndex)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {platforms.length > 1 ? (
          <div className="admin-board__plan-field">
            <span className="admin-board__plan-label">{t('admin.board.planPlatformMode')}</span>
            <SegmentedSwitch
              active={options.platformMode}
              ariaLabel={t('admin.board.planPlatformMode')}
              className="admin-board__view-switch"
              onChange={(platformMode) => set({ platformMode })}
              options={[
                ['alternate', t('admin.board.planPlatformAlternate')],
                ['sex', t('admin.board.planPlatformSex')],
              ]}
            />
          </div>
        ) : null}

        <div className="admin-board__plan-field">
          <label className="admin-board__plan-check">
            <input
              type="checkbox"
              checked={options.useExisting}
              onChange={() => set({ useExisting: !options.useExisting })}
            />
            <span>{t('admin.board.planUseExisting')}</span>
          </label>
          <label className="admin-board__plan-check">
            <input
              type="checkbox"
              checked={options.mergeSmall}
              onChange={() => set({ mergeSmall: !options.mergeSmall })}
            />
            <span>{t('admin.board.planMergeSmall')}</span>
          </label>
        </div>
      </div>

      <div className="admin-board__plan-preview" aria-live="polite">
        {athletes.length === 0 ? (
          <p className="admin-board__empty admin-board__empty--inline">
            {t('admin.board.previewEmpty')}
          </p>
        ) : plan.summaries.length === 0 ? (
          <p className="admin-board__empty admin-board__empty--inline">
            {t('admin.board.planNothing')}
          </p>
        ) : (
          <>
            <p className="admin-board__plan-summary">
              {t('admin.board.previewLead', { count: plan.placed, sessions: plan.summaries.length })}
            </p>
            {byDay.map(([dayIndex, day]) => (
              <div className="admin-board__plan-day" key={dayIndex}>
                <h3 className="admin-board__plan-day-name">{day.label}</h3>
                <ul className="admin-board__plan-list">
                  {day.rows.map((row) => (
                    <li className="admin-board__plan-row" key={row.key}>
                      <span className="admin-board__plan-row-name">
                        {row.name}
                        {row.isNew ? (
                          <span className="admin-board__plan-new">{t('admin.board.previewNew')}</span>
                        ) : null}
                      </span>
                      {row.platformName ? (
                        <span className="admin-board__plan-row-platform">{row.platformName}</span>
                      ) : null}
                      <span className="admin-board__plan-row-count">
                        {row.isNew
                          ? row.total
                          : t('admin.board.previewAdded', { count: row.added })}
                      </span>
                      <span className="admin-board__plan-row-composition">{row.composition}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
        {plan.leftover.length > 0 ? (
          <p className="admin-board__plan-warn" role="status">
            {t('admin.board.leftover', { count: plan.leftover.length })}
          </p>
        ) : null}
      </div>

      <div className="admin-board__plan-actions">
        <Button
          type="button"
          disabled={busy || plan.placed === 0}
          onClick={() => onApply(plan)}
        >
          {busy
            ? t('admin.board.moving')
            : t('admin.board.planConfirm', { count: plan.placed, sessions: newCount })}
        </Button>
        <button type="button" className="admin-board__text-btn" onClick={onClose} disabled={busy}>
          {t('admin.board.previewCancel')}
        </button>
      </div>
    </section>
  )
}
