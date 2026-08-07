import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/pages/admin-board.css'
import { CalendarClock, Sparkles, UserCheck, Users } from 'lucide-react'
import Button from '../../components/ui/Button.jsx'
import { useEventBoard } from '../../hooks/useEventBoard.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatScheduleTime } from '../../lib/eventSchedule.js'

/** Tope por defecto de una tanda de powerlifting. El operador lo ajusta. */
const DEFAULT_FLIGHT_SIZE = 12

function athleteMeta(athlete) {
  return [
    athlete.category,
    athlete.division,
    athlete.bodyweightKg ? `${athlete.bodyweightKg} kg` : null,
    athlete.gym,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * ScheduleBoardSection — PLU ARG
 *
 * Armado de la grilla del torneo: repartir a los inscriptos en tandas por día,
 * ver quién quedó en cada una y detectar a los que faltan ubicar.
 *
 * Se usa cuando las inscripciones ya cerraron y la organización arma el orden
 * de competencia. Es la pantalla que hace que el QR de cada atleta pueda
 * responder "Día 2 · Tanda G" al escanearse en la puerta.
 *
 * La interacción es seleccionar y asignar, no arrastrar: con doscientos
 * inscriptos hay que poder mover treinta de una, funcionar con teclado y
 * funcionar en una tablet. Es además el mismo gesto que ya existe en
 * Inscripciones.
 */
export default function ScheduleBoardSection({
  adminEvents = [],
  canEdit = false,
  onGoToEvents,
}) {
  const { locale, t } = useI18n()

  const eventOptions = useMemo(
    () =>
      adminEvents
        .filter((event) => event.slug)
        .map((event) => ({ slug: event.slug, title: event.title })),
    [adminEvents],
  )

  const [eventSlug, setEventSlug] = useState(() => eventOptions[0]?.slug ?? '')
  const [selected, setSelected] = useState(() => new Set())
  const [flightSize, setFlightSize] = useState(DEFAULT_FLIGHT_SIZE)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!eventSlug && eventOptions.length > 0) setEventSlug(eventOptions[0].slug)
  }, [eventOptions, eventSlug])

  const { assign, autofill, busy, days, error, status, totals, unassigned } = useEventBoard(
    eventSlug,
    { enabled: Boolean(eventSlug) },
  )

  // Cambiar de evento invalida la selección: son inscripciones de otro torneo.
  useEffect(() => {
    setSelected(new Set())
    setNotice(null)
  }, [eventSlug])

  const sessionsMissing = useMemo(
    () => days.length > 0 && days.every((day) => day.sessions.length === 0),
    [days],
  )

  const toggle = useCallback((registrationId) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(registrationId)) next.delete(registrationId)
      else next.add(registrationId)
      return next
    })
  }, [])

  const toggleMany = useCallback((ids) => {
    setSelected((current) => {
      const next = new Set(current)
      const everySelected = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (everySelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [])

  const selectedIds = useMemo(() => [...selected], [selected])

  async function moveTo({ dayIndex, sessionId }) {
    const result = await assign({ registrationIds: selectedIds, dayIndex, sessionId })
    if (!result) return
    setSelected(new Set())
    // `updated` puede ser menor que lo pedido: el backend descarta canceladas y
    // las de otro evento. Decirlo evita dar por completo un reparto que no lo está.
    setNotice(
      result.updated === result.requested
        ? t('admin.board.moved', { count: result.updated })
        : t('admin.board.movedPartial', { count: result.updated, total: result.requested }),
    )
  }

  async function handleAutofill(dayIndex) {
    const result = await autofill({ dayIndex, maxPerSession: flightSize })
    if (!result) return
    setSelected(new Set())
    setNotice(
      result.remaining > 0
        ? t('admin.board.autofilledPartial', {
            count: result.placed,
            remaining: result.remaining,
          })
        : t('admin.board.autofilled', { count: result.placed }),
    )
  }

  if (eventOptions.length === 0) {
    return (
      <section className="admin-board">
        <p className="admin-board__empty">{t('admin.board.noEvents')}</p>
      </section>
    )
  }

  return (
    <section
      className={`admin-board${days.length === 0 && status === 'ready' ? ' admin-board--setup' : ''}`}
      aria-label={t('admin.board.title')}
    >
      <header className="admin-board__header">
        <div className="admin-board__heading">
          <span className="admin-board__eyebrow">{t('admin.board.eyebrow')}</span>
          <h1 className="admin-board__title">{t('admin.board.title')}</h1>
          <p className="admin-board__lead">{t('admin.board.lead')}</p>
        </div>

        <label className="admin-board__event-picker">
          <span>{t('admin.filters.event')}</span>
          <select value={eventSlug} onChange={(event) => setEventSlug(event.target.value)}>
            {eventOptions.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && (
        <p className="admin-board__alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-board__notice" role="status">
          {notice}
        </p>
      )}

      {status === 'loading' && <p className="admin-board__empty">{t('admin.board.loading')}</p>}

      {status === 'ready' && days.length === 0 && (
        <SetupEmpty onGoToEvents={onGoToEvents} t={t} />
      )}

      {status === 'ready' && days.length > 0 && (
        <>
          {/* Ledger tipográfico: solo cuando hay grilla que operar. */}
          <dl className="admin-board__totals">
            <div className="admin-board__total admin-board__total--lead">
              <dt>{t('admin.board.unassigned')}</dt>
              <dd>{totals.unassigned}</dd>
            </div>
            <div className="admin-board__total">
              <dt>{t('admin.board.assigned')}</dt>
              <dd>{totals.assigned}</dd>
            </div>
            <div className="admin-board__total">
              <dt>{t('admin.board.registered')}</dt>
              <dd>{totals.registered}</dd>
            </div>
          </dl>

          {sessionsMissing && (
            <p className="admin-board__setup-banner" role="status">
              <span className="admin-board__setup-kicker">{t('admin.board.setupHint')}</span>
              <span>{t('admin.board.sessionsMissing')}</span>
              {onGoToEvents ? (
                <button type="button" className="admin-board__text-btn" onClick={onGoToEvents}>
                  {t('admin.board.noDaysCta')}
                </button>
              ) : null}
            </p>
          )}

          {selectedIds.length > 0 && (
            <MoveBar
              busy={busy}
              days={days}
              disabled={!canEdit}
              onClear={() => setSelected(new Set())}
              onMove={moveTo}
              selectedCount={selectedIds.length}
              t={t}
            />
          )}

          <div className="admin-board__layout">
            <AthletePool
              athletes={unassigned}
              onToggle={toggle}
              onToggleMany={toggleMany}
              selected={selected}
              t={t}
            />

            <div className="admin-board__days">
              {days.map((day) => (
                <DayColumn
                  busy={busy}
                  canEdit={canEdit}
                  day={day}
                  flightSize={flightSize}
                  key={day.id}
                  locale={locale}
                  onAutofill={handleAutofill}
                  onFlightSizeChange={setFlightSize}
                  onGoToEvents={onGoToEvents}
                  onToggle={toggle}
                  onToggleMany={toggleMany}
                  selected={selected}
                  t={t}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** Empty operativo: pipeline de preparación, sin métricas en cero. */
function SetupEmpty({ onGoToEvents, t }) {
  const steps = [
    {
      id: 'days',
      label: t('admin.board.stepDays'),
      hint: t('admin.board.stepDaysHint'),
      current: true,
    },
    {
      id: 'sessions',
      label: t('admin.board.stepSessions'),
      hint: t('admin.board.stepSessionsHint'),
      current: false,
    },
    {
      id: 'assign',
      label: t('admin.board.stepAssign'),
      hint: t('admin.board.stepAssignHint'),
      current: false,
    },
  ]

  return (
    <div className="admin-board__setup" role="status">
      <ol className="admin-board__pipeline" aria-label={t('admin.board.setupHint')}>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`admin-board__pipeline-step${step.current ? ' is-current' : ''}`}
            aria-current={step.current ? 'step' : undefined}
          >
            <span className="admin-board__pipeline-index" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="admin-board__pipeline-body">
              <span className="admin-board__pipeline-label">{step.label}</span>
              <span className="admin-board__pipeline-hint">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="admin-board__setup-copy">
        <h2 className="admin-board__setup-title">{t('admin.board.noDaysTitle')}</h2>
        <p className="admin-board__setup-lead">{t('admin.board.noDaysLead')}</p>
        {onGoToEvents ? (
          <Button type="button" onClick={onGoToEvents}>
            {t('admin.board.noDaysCta')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Barra de movimiento: aparece con la selección y ofrece todos los destinos. */
function MoveBar({ busy, days, disabled, onClear, onMove, selectedCount, t }) {
  const [target, setTarget] = useState('')

  function handleMove() {
    if (target === 'unassign') {
      onMove({ dayIndex: null, sessionId: null })
      return
    }
    const [kind, dayIndex, sessionId] = target.split('|')
    if (kind === 'day') onMove({ dayIndex: Number(dayIndex), sessionId: null })
    if (kind === 'session') onMove({ dayIndex: Number(dayIndex), sessionId })
  }

  return (
    <div className="admin-board__movebar" role="region" aria-label={t('admin.board.moveBarLabel')}>
      <p className="admin-board__movebar-count">
        {t('admin.board.selectedCount', { count: selectedCount })}
      </p>

      <label className="admin-board__movebar-field">
        <span>{t('admin.board.moveTo')}</span>
        <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={busy}>
          <option value="">{t('admin.board.movePlaceholder')}</option>
          {days.map((day) => (
            <optgroup key={day.id} label={day.label}>
              <option value={`day|${day.dayIndex}|`}>
                {t('admin.board.dayWithoutSession', { day: day.label })}
              </option>
              {day.sessions.map((session) => (
                <option key={session.id} value={`session|${day.dayIndex}|${session.id}`}>
                  {session.name}
                  {session.athletes.length ? ` (${session.athletes.length})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="unassign">{t('admin.board.moveToUnassigned')}</option>
        </select>
      </label>

      <Button type="button" onClick={handleMove} disabled={disabled || busy || !target}>
        {busy ? t('admin.board.moving') : t('admin.board.move')}
      </Button>

      <button type="button" className="admin-board__text-btn" onClick={onClear}>
        {t('admin.board.clearSelection')}
      </button>
    </div>
  )
}

/** Bolsa de inscriptos sin ubicar. Es el trabajo pendiente del operador. */
function AthletePool({ athletes, onToggle, onToggleMany, selected, t }) {
  const ids = athletes.map((athlete) => athlete.registrationId)

  return (
    <div className="admin-board__pool">
      <div className="admin-board__panel-head">
        <span className="admin-board__panel-icon" aria-hidden>
          <Users size={15} strokeWidth={1.8} />
        </span>
        <h2 className="admin-board__panel-title">{t('admin.board.poolTitle')}</h2>
        <span className="admin-board__count">{athletes.length}</span>
      </div>

      {athletes.length === 0 ? (
        <p className="admin-board__empty admin-board__empty--inline">
          {t('admin.board.poolEmptyReady')}
        </p>
      ) : (
        <>
          <button
            type="button"
            className="admin-board__text-btn"
            onClick={() => onToggleMany(ids)}
          >
            {t('admin.board.toggleAll')}
          </button>
          <AthleteList
            athletes={athletes}
            onToggle={onToggle}
            selected={selected}
            t={t}
          />
        </>
      )}
    </div>
  )
}

function DayColumn({
  busy,
  canEdit,
  day,
  flightSize,
  locale,
  onAutofill,
  onFlightSizeChange,
  onGoToEvents,
  onToggle,
  onToggleMany,
  selected,
  t,
}) {
  return (
    <section className="admin-board__day" aria-label={day.label}>
      <div className="admin-board__panel-head">
        <span className="admin-board__panel-icon" aria-hidden>
          <CalendarClock size={15} strokeWidth={1.8} />
        </span>
        <h2 className="admin-board__panel-title">{day.label}</h2>
        <span className="admin-board__count">{day.assignedCount}</span>
      </div>

      {day.sessions.length > 0 && (
        <div className="admin-board__autofill">
          <label className="admin-board__autofill-field">
            <span>{t('admin.board.flightSize')}</span>
            <input
              type="number"
              min={1}
              max={100}
              value={flightSize}
              onChange={(event) => onFlightSizeChange(Number(event.target.value) || 1)}
              disabled={!canEdit || busy}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="btn--small"
            disabled={!canEdit || busy}
            onClick={() => onAutofill(day.dayIndex)}
            aria-label={t('admin.board.autofill', { day: day.label })}
          >
            <Sparkles size={15} aria-hidden />
            {t('admin.board.autofillShort')}
          </Button>
        </div>
      )}

      {day.sessions.length === 0 ? (
        <div className="admin-board__day-empty">
          <p className="admin-board__empty admin-board__empty--inline">
            {t('admin.board.noSessions')}
          </p>
          {onGoToEvents ? (
            <button type="button" className="admin-board__text-btn" onClick={onGoToEvents}>
              {t('admin.board.noDaysCta')}
            </button>
          ) : null}
        </div>
      ) : (
        day.sessions.map((session) => {
          const ids = session.athletes.map((athlete) => athlete.registrationId)
          const detail = [
            session.platform,
            session.weighInAt &&
              `${t('admin.checkin.weighIn')} ${formatScheduleTime(session.weighInAt, locale)}`,
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <div className="admin-board__session" key={session.id}>
              <div className="admin-board__session-head">
                <h3 className="admin-board__session-name">{session.name}</h3>
                <span className="admin-board__count">{session.athletes.length}</span>
              </div>
              {detail && <p className="admin-board__session-detail">{detail}</p>}

              {session.athletes.length === 0 ? (
                <p className="admin-board__empty admin-board__empty--inline">
                  {t('admin.board.sessionEmpty')}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="admin-board__text-btn"
                    onClick={() => onToggleMany(ids)}
                  >
                    {t('admin.board.toggleAll')}
                  </button>
                  <AthleteList
                    athletes={session.athletes}
                    onToggle={onToggle}
                    selected={selected}
                    t={t}
                  />
                </>
              )}
            </div>
          )
        })
      )}

      {/* Con día pero sin tanda: si no se mostrara, esa gente desaparecería
          del tablero y nadie notaría que le falta ubicación. */}
      {day.withoutSession.length > 0 && (
        <div className="admin-board__session admin-board__session--pending">
          <div className="admin-board__session-head">
            <h3 className="admin-board__session-name">{t('admin.board.withoutSession')}</h3>
            <span className="admin-board__count">{day.withoutSession.length}</span>
          </div>
          <AthleteList
            athletes={day.withoutSession}
            onToggle={onToggle}
            selected={selected}
            t={t}
          />
        </div>
      )}
    </section>
  )
}

function AthleteList({ athletes, onToggle, selected, t }) {
  return (
    <ul className="admin-board__list">
      {athletes.map((athlete) => (
        <li key={athlete.registrationId}>
          <label className="admin-board__athlete">
            <input
              type="checkbox"
              checked={selected.has(athlete.registrationId)}
              onChange={() => onToggle(athlete.registrationId)}
              aria-label={t('admin.board.selectAthlete', { name: athlete.fullName })}
            />
            <span className="admin-board__athlete-body">
              <span className="admin-board__athlete-name">{athlete.fullName}</span>
              <span className="admin-board__athlete-meta">{athleteMeta(athlete)}</span>
            </span>
            {athlete.checkedIn && (
              <span className="admin-board__athlete-flag" title={t('admin.board.checkedIn')}>
                <UserCheck size={14} aria-hidden />
                <span className="visually-hidden">{t('admin.board.checkedIn')}</span>
              </span>
            )}
          </label>
        </li>
      ))}
    </ul>
  )
}
