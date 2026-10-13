import { useMemo, useState } from 'react'
import Button from '../../ui/Button.jsx'
import SegmentedSwitch from '../../ui/SegmentedSwitch.jsx'
import {
  configFromState,
  formatWeightClasses,
  MAX_TEMPLATE_PLATFORMS,
  optionsFromConfig,
  parseWeightClasses,
  platformNamesFromConfig,
} from '../../../lib/gridTemplates.js'
import {
  DEFAULT_PLAN_OPTIONS,
  normalizeSchedule,
  PLAN_GROUP_KEYS,
  planEventBoard,
  rebuildInput,
  suggestPlanOptions,
} from '../../../services/eventBoardPlanner.js'
import PlanPreview from './PlanPreview.jsx'
import PlanTemplates from './PlanTemplates.jsx'

const GROUP_LABEL_KEY = {
  sex: 'admin.board.filterSex',
  category: 'admin.board.filterCategory',
  division: 'admin.board.filterDivision',
}

const DEFAULT_SCHEDULE_FIELDS = Object.freeze({
  on: false,
  firstStart: '09:00',
  durationMode: 'athletes',
  sessionMinutes: '45',
  minutesPerAthlete: '4',
  gapMinutes: '10',
  weighInLeadMinutes: '120',
})

function scheduleFieldsFromConfig(schedule) {
  if (!schedule) return { ...DEFAULT_SCHEDULE_FIELDS, on: false }
  return {
    on: true,
    firstStart: schedule.firstStart,
    durationMode: schedule.minutesPerAthlete ? 'athletes' : 'fixed',
    sessionMinutes: String(schedule.sessionMinutes),
    minutesPerAthlete: String(schedule.minutesPerAthlete ?? DEFAULT_SCHEDULE_FIELDS.minutesPerAthlete),
    gapMinutes: String(schedule.gapMinutes),
    weighInLeadMinutes: String(schedule.weighInLeadMinutes),
  }
}

/**
 * PlanPanel — PLU ARG
 *
 * Asistente de armado: en una sola pantalla se definen los tablados (cuántos y
 * cómo se llaman), cómo se arman las tandas, los horarios y el alcance, y la
 * propuesta para TODOS los inscriptos se recalcula en vivo. Recién "Confirmar"
 * crea los tablados y tandas que falten y mueve a la gente, y queda un
 * "Deshacer" a mano.
 *
 * Una plantilla es esta misma configuración guardada: aplicarla llena el
 * formulario, no salta pasos ni escribe nada.
 *
 * Alcance: por defecto solo la bolsa sin ubicar (respetando los filtros). Con
 * "Rehacer toda la grilla" entran también los ya ubicados; a quien ya registró
 * ingreso no se lo mueve nunca.
 */
export default function PlanPanel({
  board,
  busy,
  canSaveTemplates,
  days,
  emptySessions = 0,
  flightSize,
  locale,
  minutesPerAthlete,
  onApply,
  onClose,
  onPrune,
  platforms,
  poolAthletes,
  t,
  templatesApi,
}) {
  // Lo que el tablero ya sabe (tope, criterio, fecha de los días, primera hora)
  // llena el formulario: la persona corrige, no arranca de cero.
  const [suggested] = useState(() => suggestPlanOptions({ athletes: poolAthletes, days, flightSize }))
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_PLAN_OPTIONS,
    maxPerSession: suggested.maxPerSession,
    groupBy: suggested.groupBy,
    useExisting: true,
  }))
  const [dayIndexes, setDayIndexes] = useState(() => days.map((day) => day.dayIndex))
  const [platformNames, setPlatformNames] = useState(() =>
    platforms.length > 0 ? platforms.map((platform) => platform.name) : ['Tablado 1'],
  )
  const [schedule, setSchedule] = useState(() =>
    scheduleFieldsFromConfig(
      suggested.schedule && {
        ...suggested.schedule,
        minutesPerAthlete: minutesPerAthlete ?? suggested.schedule.minutesPerAthlete,
      },
    ),
  )
  const [classesText, setClassesText] = useState({ Femenino: '', Masculino: '' })
  const [rebuild, setRebuild] = useState(false)
  const [notice, setNotice] = useState(null)

  const set = (patch) => setOptions((current) => ({ ...current, ...patch }))
  const toggleGroup = (key) =>
    set({
      groupBy: options.groupBy.includes(key)
        ? options.groupBy.filter((item) => item !== key)
        : [...options.groupBy, key],
    })

  // ── Tablados: los que ya existen conservan su id (renombrar no los recrea).
  const draftPlatforms = platformNames.map((name, index) => ({
    ...(platforms[index] ? { id: platforms[index].id } : {}),
    name: name.trim(),
  }))
  const plannerPlatforms = draftPlatforms.map((entry, index) => ({
    id: entry.id ?? `tmp:${index}`,
    name: entry.name,
  }))
  const lowerNames = draftPlatforms.map((entry) => entry.name.toLowerCase())
  const namesInvalid =
    draftPlatforms.some((entry) => !entry.name) || new Set(lowerNames).size !== lowerNames.length
  const removedPlatforms = platforms.filter((_, index) => index >= platformNames.length)

  function changePlatformCount(key) {
    const count = Number(key)
    setPlatformNames((current) =>
      Array.from(
        { length: count },
        (_, index) =>
          current[index] ?? t('admin.board.platformDefaultName', { n: index + 1 }),
      ),
    )
  }

  // ── Clases de peso y horarios: texto del formulario → opciones del planificador.
  const parsedClasses = {
    Femenino: parseWeightClasses(classesText.Femenino),
    Masculino: parseWeightClasses(classesText.Masculino),
  }
  const classesInvalid = parsedClasses.Femenino.invalid || parsedClasses.Masculino.invalid
  const weightClasses = useMemo(() => {
    const result = {}
    if (parsedClasses.Femenino.values.length > 0) result.Femenino = parsedClasses.Femenino.values
    if (parsedClasses.Masculino.values.length > 0) result.Masculino = parsedClasses.Masculino.values
    return Object.keys(result).length > 0 ? result : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende del texto, no del objeto parseado
  }, [classesText.Femenino, classesText.Masculino])

  const scheduleConfig = schedule.on
    ? {
        firstStart: schedule.firstStart,
        sessionMinutes: Number(schedule.sessionMinutes),
        ...(schedule.durationMode === 'athletes'
          ? { minutesPerAthlete: Number(schedule.minutesPerAthlete) }
          : {}),
        gapMinutes: Number(schedule.gapMinutes),
        weighInLeadMinutes: Number(schedule.weighInLeadMinutes),
      }
    : null
  const scheduleInvalid =
    schedule.on &&
    (normalizeSchedule(scheduleConfig) === null ||
      (schedule.durationMode === 'athletes' && !(Number(schedule.minutesPerAthlete) > 0)))

  // ── Alcance
  const rebuilt = useMemo(() => (rebuild ? rebuildInput(board) : null), [rebuild, board])
  const athletes = rebuilt ? rebuilt.candidates : poolAthletes
  const planDays = rebuilt ? rebuilt.days : days
  const fixedCount = rebuild
    ? (board?.days ?? []).reduce(
        (sum, day) =>
          sum +
          day.sessions.reduce(
            (inner, session) => inner + session.athletes.filter((row) => row.checkedIn).length,
            0,
          ),
        0,
      )
    : 0

  // `plannerPlatforms` y `scheduleConfig` se rearman en cada render: se resumen
  // en claves estables para que el plan se recalcule solo cuando cambian de verdad.
  const platformsKey = JSON.stringify(plannerPlatforms)
  const scheduleKey = JSON.stringify(scheduleConfig)
  const plan = useMemo(
    () =>
      planEventBoard({
        unassigned: athletes,
        days: planDays,
        platforms: JSON.parse(platformsKey),
        ...options,
        dayIndexes,
        weightClasses,
        schedule: JSON.parse(scheduleKey),
      }),
    [athletes, planDays, options, dayIndexes, weightClasses, platformsKey, scheduleKey],
  )

  // ── Plantillas
  function currentConfig() {
    return configFromState({
      options: { ...options, weightClasses, schedule: scheduleConfig },
      platformNames: platformNames.map((name) => name.trim()),
    })
  }

  function applyTemplate(template) {
    const configured = optionsFromConfig(template.config)
    const names = platformNamesFromConfig(template.config)
    setOptions((current) => ({ ...current, ...configured }))
    if (names.length > 0) setPlatformNames(names)
    setSchedule(scheduleFieldsFromConfig(configured.schedule))
    setClassesText({
      Femenino: formatWeightClasses(configured.weightClasses?.Femenino),
      Masculino: formatWeightClasses(configured.weightClasses?.Masculino),
    })
    setNotice(t('admin.board.planTemplateApplied', { name: template.name }))
  }

  async function saveTemplate(name) {
    const ok = await templatesApi.save(name, currentConfig())
    if (ok) setNotice(t('admin.board.planTemplateStored', { name }))
    return ok
  }

  async function deleteTemplate(template) {
    if (await templatesApi.remove(template.id)) {
      setNotice(t('admin.board.planTemplateDeleted', { name: template.name }))
    }
  }

  const toggleDay = (value) =>
    setDayIndexes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  const patchSchedule = (patch) => setSchedule((current) => ({ ...current, ...patch }))
  const blocked = namesInvalid || classesInvalid || scheduleInvalid

  return (
    <section className="admin-board__plan" aria-label={t('admin.board.planTitle')}>
      <header className="admin-board__plan-head">
        <h2 className="admin-board__plan-title">{t('admin.board.planTitle')}</h2>
        <p className="admin-board__plan-lead">
          {rebuild
            ? t('admin.board.planScopeRebuild', { count: athletes.length, fixed: fixedCount })
            : t('admin.board.planScope', { count: athletes.length })}
        </p>
      </header>

      <PlanTemplates
        busy={busy || templatesApi.busy}
        canSave={canSaveTemplates}
        error={templatesApi.error}
        onApply={applyTemplate}
        onDelete={deleteTemplate}
        onSave={saveTemplate}
        status={templatesApi.status}
        t={t}
        templates={templatesApi.templates}
      />
      {notice ? (
        <p className="admin-board__plan-note" role="status">
          {notice}
        </p>
      ) : null}

      <div className="admin-board__plan-form">
        <fieldset className="admin-board__plan-field admin-board__plan-field--wide">
          <legend>{t('admin.board.planPlatforms')}</legend>
          <div className="admin-board__plan-inline">
            <SegmentedSwitch
              active={String(platformNames.length)}
              ariaLabel={t('admin.board.platformsCountAria')}
              className="admin-board__view-switch"
              onChange={changePlatformCount}
              options={Array.from({ length: MAX_TEMPLATE_PLATFORMS }, (_, index) => [
                String(index + 1),
                index === 0 ? t('admin.board.platformsOne') : t('admin.board.platformsTwo'),
              ])}
            />
            {platformNames.map((name, index) => (
              <label className="admin-board__platform-field" key={index}>
                <span className="visually-hidden">
                  {t('admin.board.platformNameLabel', { n: index + 1 })}
                </span>
                <input
                  type="text"
                  maxLength={80}
                  value={name}
                  aria-invalid={!name.trim() || undefined}
                  onChange={(event) =>
                    setPlatformNames((current) =>
                      current.map((item, position) =>
                        position === index ? event.target.value : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          {removedPlatforms.length > 0 ? (
            <p className="admin-board__plan-warn" role="status">
              {t('admin.board.platformsRemoveWarning', {
                names: removedPlatforms.map((item) => item.name).join(', '),
              })}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="admin-board__plan-field">
          <legend>{t('admin.board.planGroupBy')}</legend>
          <div className="admin-board__plan-checks">
            {PLAN_GROUP_KEYS.map((key) => (
              <label key={key} className="admin-board__plan-check">
                <input
                  type="checkbox"
                  checked={options.groupBy.includes(key)}
                  onChange={() => toggleGroup(key)}
                />
                <span>{t(GROUP_LABEL_KEY[key])}</span>
              </label>
            ))}
          </div>
          {!options.groupBy.includes('sex') ? (
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

        {plannerPlatforms.length > 1 ? (
          <div className="admin-board__plan-field">
            <span className="admin-board__plan-label">{t('admin.board.planPlatformMode')}</span>
            <SegmentedSwitch
              active={options.platformMode}
              ariaLabel={t('admin.board.planPlatformMode')}
              className="admin-board__view-switch"
              onChange={(platformMode) => set({ platformMode })}
              options={[
                ['balance', t('admin.board.planPlatformBalance')],
                ['alternate', t('admin.board.planPlatformAlternate')],
                ['sex', t('admin.board.planPlatformSex')],
              ]}
            />
          </div>
        ) : null}

        {days.length > 1 ? (
          <fieldset className="admin-board__plan-field">
            <legend>{t('admin.board.planDays')}</legend>
            <div className="admin-board__plan-checks">
              {days.map((day) => (
                <label key={day.id} className="admin-board__plan-check">
                  <input
                    type="checkbox"
                    checked={dayIndexes.includes(day.dayIndex)}
                    onChange={() => toggleDay(day.dayIndex)}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
          <label className="admin-board__plan-check">
            <input type="checkbox" checked={rebuild} onChange={() => setRebuild(!rebuild)} />
            <span>{t('admin.board.planRebuild')}</span>
          </label>
        </div>

        <details className="admin-board__plan-more" open={schedule.on || undefined}>
          <summary>{t('admin.board.planSchedule')}</summary>
          <label className="admin-board__plan-check">
            <input
              type="checkbox"
              checked={schedule.on}
              onChange={() => patchSchedule({ on: !schedule.on })}
            />
            <span>{t('admin.board.planScheduleOn')}</span>
          </label>
          {schedule.on ? (
            <SegmentedSwitch
              active={schedule.durationMode}
              ariaLabel={t('admin.board.planDurationAria')}
              className="admin-board__view-switch"
              onChange={(durationMode) => patchSchedule({ durationMode })}
              options={[
                ['athletes', t('admin.board.planDurationAthletes')],
                ['fixed', t('admin.board.planDurationFixed')],
              ]}
            />
          ) : null}
          {schedule.on ? (
            <div className="admin-board__plan-grid">
              <label className="admin-board__filter">
                <span>{t('admin.board.planFirstStart')}</span>
                <input
                  type="time"
                  value={schedule.firstStart}
                  onChange={(event) => patchSchedule({ firstStart: event.target.value })}
                />
              </label>
              {[
                schedule.durationMode === 'athletes'
                  ? ['minutesPerAthlete', 'planMinutesPerAthlete', 0.5]
                  : ['sessionMinutes', 'planSessionMinutes', 1],
                ['gapMinutes', 'planGapMinutes', 0],
                ['weighInLeadMinutes', 'planWeighInLead', 0],
              ].map(([field, label, min]) => (
                <label className="admin-board__filter" key={field}>
                  <span>{t(`admin.board.${label}`)}</span>
                  <input
                    type="number"
                    min={min}
                    step={field === 'minutesPerAthlete' ? 0.5 : 1}
                    inputMode={field === 'minutesPerAthlete' ? 'decimal' : 'numeric'}
                    value={schedule[field]}
                    onChange={(event) => patchSchedule({ [field]: event.target.value })}
                  />
                </label>
              ))}
            </div>
          ) : null}
          {schedule.on && schedule.durationMode === 'athletes' ? (
            <p className="admin-board__plan-hint">{t('admin.board.planDurationHint')}</p>
          ) : null}
          {schedule.on ? (
            <p className="admin-board__plan-hint">{t('admin.board.planScheduleNoDate')}</p>
          ) : null}
          {scheduleInvalid ? (
            <p className="admin-board__plan-warn" role="alert">
              {t('admin.board.planScheduleInvalid')}
            </p>
          ) : null}
        </details>

        <details
          className="admin-board__plan-more"
          open={Boolean(classesText.Femenino || classesText.Masculino) || undefined}
        >
          <summary>{t('admin.board.planClasses')}</summary>
          <p className="admin-board__plan-hint">{t('admin.board.planClassesHint')}</p>
          <div className="admin-board__plan-grid">
            {[
              ['Femenino', 'planClassesFemale'],
              ['Masculino', 'planClassesMale'],
            ].map(([sex, label]) => (
              <label className="admin-board__filter" key={sex}>
                <span>{t(`admin.board.${label}`)}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="47, 52, 57…"
                  value={classesText[sex]}
                  aria-invalid={parsedClasses[sex].invalid || undefined}
                  onChange={(event) =>
                    setClassesText((current) => ({ ...current, [sex]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          {classesInvalid ? (
            <p className="admin-board__plan-warn" role="alert">
              {t('admin.board.planClassesInvalid')}
            </p>
          ) : null}
        </details>
      </div>

      <div className="admin-board__plan-preview" aria-live="polite">
        <PlanPreview athletes={athletes.length} locale={locale} plan={plan} t={t} />
      </div>

      <div className="admin-board__plan-actions">
        <Button
          type="button"
          disabled={busy || blocked || plan.placed === 0}
          onClick={() => onApply(plan, { platformDraft: draftPlatforms })}
        >
          {busy
            ? t('admin.board.moving')
            : t('admin.board.planConfirm', {
                count: plan.placed,
                sessions: plan.stats.newSessions,
              })}
        </Button>
        <button type="button" className="admin-board__text-btn" onClick={onClose} disabled={busy}>
          {t('admin.board.previewCancel')}
        </button>
        {emptySessions > 0 ? (
          <button
            type="button"
            className="admin-board__text-btn admin-board__plan-prune"
            onClick={onPrune}
            disabled={busy}
          >
            {t('admin.board.planPrune', { count: emptySessions })}
          </button>
        ) : null}
      </div>
    </section>
  )
}
