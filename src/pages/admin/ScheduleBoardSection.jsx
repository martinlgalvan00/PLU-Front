import { useCallback, useEffect, useMemo, useState } from 'react'
import '../../styles/pages/admin-board.css'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CalendarClock, Pencil, Sparkles, UserCheck, Users } from 'lucide-react'
import Button from '../../components/ui/Button.jsx'
import { useEventBoard } from '../../hooks/useEventBoard.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatScheduleTime } from '../../lib/eventSchedule.js'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'

/** Tope por defecto de una tanda de powerlifting. El operador lo ajusta. */
const DEFAULT_FLIGHT_SIZE = 12

/** Ids de drop zones. La bolsa es "sacar del reparto" (día y tanda en null). */
const POOL_DROP_ID = 'pool'
const dropIdForDay = (dayIndex) => `day|${dayIndex}`
const dropIdForSession = (dayIndex, sessionId) => `session|${dayIndex}|${sessionId}`

function parseDropId(id) {
  if (id === POOL_DROP_ID) return { dayIndex: null, sessionId: null }
  const [kind, dayIndex, sessionId] = String(id).split('|')
  if (kind === 'day') return { dayIndex: Number(dayIndex), sessionId: null }
  if (kind === 'session') return { dayIndex: Number(dayIndex), sessionId }
  return null
}

const normalizeDayIndex = (value) => (value === null || value === undefined ? null : Number(value))

function sameLocation(a, b) {
  return (
    normalizeDayIndex(a?.dayIndex) === normalizeDayIndex(b?.dayIndex) &&
    (a?.sessionId ?? null) === (b?.sessionId ?? null)
  )
}

/**
 * Colisión por puntero con prioridad a lo más específico: la tanda gana al
 * día y el día a la bolsa. `rectIntersection` (el default) empata cuando el
 * arrastre está dentro de una tanda anidada en el día.
 */
function boardCollision(args) {
  const rank = (id) => {
    const value = String(id)
    if (value.startsWith('session|')) return 0
    if (value.startsWith('day|')) return 1
    return 2
  }
  return pointerWithin(args).sort((a, b) => rank(a.id) - rank(b.id))
}

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

/** datetime-local trabaja en hora local; el backend guarda ISO con zona. */
function toLocalInputValue(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
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
 * La interacción es híbrida a propósito:
 *
 *   * Drag & drop (mouse/touch, @dnd-kit) para mover un atleta suelto — o la
 *     selección completa si el arrastrado está seleccionado — hacia una
 *     tanda, un día o la bolsa de pendientes. Sin actualización optimista:
 *     el drop dispara `assign()` y el tablero se relee del backend, porque
 *     dos operadores pueden estar repartiendo el mismo torneo a la vez.
 *   * La barra de movimiento sigue siendo el camino de teclado y de lote:
 *     con doscientos inscriptos hay que poder mover treinta de una, y el
 *     arrastre no es operable con lector de pantalla. Es además el mismo
 *     gesto que ya existe en Inscripciones.
 *
 * Las tandas se editan inline (nombre, plataforma, pesaje) sin salir del
 * tablero, via `saveSessions` → RPC staff_save_event_sessions.
 */
export default function ScheduleBoardSection({ adminEvents = [], canEdit = false, onGoToEvents }) {
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
  const [activeDrag, setActiveDrag] = useState(null)
  const [editingSession, setEditingSession] = useState(null)

  const sensors = useSensors(
    // 6px de recorrido antes de activar: el clic sigue siendo selección.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // En touch el delay deja scrollear la lista sin levantar un arrastre.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  useEffect(() => {
    if (!eventSlug && eventOptions.length > 0) setEventSlug(eventOptions[0].slug)
  }, [eventOptions, eventSlug])

  const { assign, autofill, busy, days, error, saveSessions, status, totals, unassigned } =
    useEventBoard(eventSlug, { enabled: Boolean(eventSlug) })

  // Cambiar de evento invalida la selección: son inscripciones de otro torneo.
  useEffect(() => {
    setSelected(new Set())
    setNotice(null)
    setEditingSession(null)
  }, [eventSlug])

  const sessionsMissing = useMemo(
    () => days.length > 0 && days.every((day) => day.sessions.length === 0),
    [days],
  )

  const dndEnabled = canEdit && !busy

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

  async function moveTo({ dayIndex, sessionId }, ids = selectedIds) {
    if (ids.length === 0) return
    const result = await assign({ registrationIds: ids, dayIndex, sessionId })
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

  function handleDragStart(event) {
    setActiveDrag(event.active.data.current ?? null)
  }

  function handleDragCancel() {
    setActiveDrag(null)
  }

  function handleDragEnd(event) {
    const drag = activeDrag
    setActiveDrag(null)
    if (!dndEnabled || !drag || !event.over) return
    const target = parseDropId(event.over.id)
    if (!target || sameLocation(drag.location, target)) return
    // Si el arrastrado está dentro de la selección, se mueve la selección
    // completa; si no, solo él. Es el comportamiento que espera cualquiera
    // que haya tildado treinta filas y arrastra una.
    const ids = selected.has(drag.athlete.registrationId)
      ? selectedIds
      : [drag.athlete.registrationId]
    void moveTo(target, ids)
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

  function startEditSession(day, session) {
    setEditingSession({
      sessionId: session.id,
      dayIndex: day.dayIndex,
      name: session.name,
      platform: session.platform ?? '',
      weighInAt: toLocalInputValue(session.weighInAt),
    })
  }

  async function handleSaveSession(event) {
    event.preventDefault()
    if (!editingSession || busy) return
    const name = editingSession.name.trim()
    if (!name) return
    // El RPC reemplaza el set completo de tandas: hay que mandar todas las de
    // todos los días, con la editada ya pisada, o el resto se borra.
    const payload = days.flatMap((day) =>
      day.sessions.map((session) =>
        session.id === editingSession.sessionId
          ? {
              id: session.id,
              dayIndex: day.dayIndex,
              name,
              platform: editingSession.platform.trim(),
              weighInAt: fromLocalInputValue(editingSession.weighInAt),
              startsAt: session.startsAt ?? '',
              sortOrder: session.sortOrder ?? 0,
            }
          : {
              id: session.id,
              dayIndex: day.dayIndex,
              name: session.name,
              platform: session.platform ?? '',
              weighInAt: session.weighInAt ?? '',
              startsAt: session.startsAt ?? '',
              sortOrder: session.sortOrder ?? 0,
            },
      ),
    )
    const ok = await saveSessions(payload)
    if (!ok) return
    setEditingSession(null)
    setNotice(t('admin.board.sessionSaved'))
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

      {status === 'ready' && days.length === 0 && <SetupEmpty onGoToEvents={onGoToEvents} t={t} />}

      {status === 'ready' && days.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Ledger tipográfico: solo cuando hay grilla que operar. */}
          <dl className="admin-board__totals">
            <div className="admin-board__total admin-board__total--lead">
              <dt>{t('admin.board.unassigned')}</dt>
              <dd>
                <AnimatedNumber value={totals.unassigned} />
              </dd>
            </div>
            <div className="admin-board__total">
              <dt>{t('admin.board.assigned')}</dt>
              <dd>
                <AnimatedNumber value={totals.assigned} />
              </dd>
            </div>
            <div className="admin-board__total">
              <dt>{t('admin.board.registered')}</dt>
              <dd>
                <AnimatedNumber value={totals.registered} />
              </dd>
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

          {canEdit && <p className="admin-board__drag-hint">{t('admin.board.dragHint')}</p>}

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

          <div
            className={`admin-board__layout${activeDrag ? ' admin-board__layout--dragging' : ''}`}
          >
            <AthletePool
              athletes={unassigned}
              canDrag={dndEnabled}
              onToggle={toggle}
              onToggleMany={toggleMany}
              selected={selected}
              t={t}
            />

            <div className="admin-board__days">
              {days.map((day) => (
                <DayColumn
                  busy={busy}
                  canDrag={dndEnabled}
                  canEdit={canEdit}
                  day={day}
                  editingSession={editingSession}
                  flightSize={flightSize}
                  key={day.id}
                  locale={locale}
                  onAutofill={handleAutofill}
                  onCancelEditSession={() => setEditingSession(null)}
                  onEditSession={startEditSession}
                  onFlightSizeChange={setFlightSize}
                  onGoToEvents={onGoToEvents}
                  onSaveSession={handleSaveSession}
                  onSessionDraftChange={(patch) =>
                    setEditingSession((current) => (current ? { ...current, ...patch } : current))
                  }
                  onToggle={toggle}
                  onToggleMany={toggleMany}
                  selected={selected}
                  t={t}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <DragChip
                athlete={activeDrag.athlete}
                count={selected.has(activeDrag.athlete.registrationId) ? selectedIds.length : 1}
                t={t}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  )
}

/** Empty operativo: CTA primero, secuencia de preparación como orientación. */
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
      <div className="admin-board__setup-copy">
        <h2 className="admin-board__setup-title">{t('admin.board.noDaysTitle')}</h2>
        <p className="admin-board__setup-lead">{t('admin.board.noDaysLead')}</p>
        {onGoToEvents ? (
          <Button type="button" onClick={onGoToEvents}>
            {t('admin.board.noDaysCta')}
          </Button>
        ) : null}
      </div>

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
    <div
      className="admin-board__movebar admin-glass--strong"
      role="region"
      aria-label={t('admin.board.moveBarLabel')}
    >
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
function AthletePool({ athletes, canDrag, onToggle, onToggleMany, selected, t }) {
  const { isOver, setNodeRef } = useDroppable({
    id: POOL_DROP_ID,
    disabled: !canDrag,
  })
  const ids = athletes.map((athlete) => athlete.registrationId)

  return (
    <div
      ref={setNodeRef}
      className={`admin-board__pool admin-glass${isOver ? ' is-drop-active' : ''}`}
    >
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
          <button type="button" className="admin-board__text-btn" onClick={() => onToggleMany(ids)}>
            {t('admin.board.toggleAll')}
          </button>
          <AthleteList
            athletes={athletes}
            canDrag={canDrag}
            location={{ dayIndex: null, sessionId: null }}
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
  canDrag,
  canEdit,
  day,
  editingSession,
  flightSize,
  locale,
  onAutofill,
  onCancelEditSession,
  onEditSession,
  onFlightSizeChange,
  onGoToEvents,
  onSaveSession,
  onSessionDraftChange,
  onToggle,
  onToggleMany,
  selected,
  t,
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropIdForDay(day.dayIndex),
    disabled: !canDrag,
  })

  return (
    <section
      ref={setNodeRef}
      className={`admin-board__day admin-glass${isOver ? ' is-drop-active' : ''}`}
      aria-label={day.label}
    >
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
          const isEditing = editingSession?.sessionId === session.id

          return (
            <SessionBlock
              canDrag={canDrag && !isEditing}
              dayIndex={day.dayIndex}
              isEditing={isEditing}
              key={session.id}
              session={session}
            >
              {isEditing ? (
                <form className="admin-board__session-edit" onSubmit={onSaveSession}>
                  <div className="admin-board__session-edit-grid">
                    <label className="admin-board__session-edit-field">
                      <span>{t('admin.board.sessionName')}</span>
                      <input
                        type="text"
                        required
                        maxLength={80}
                        value={editingSession.name}
                        onChange={(event) => onSessionDraftChange({ name: event.target.value })}
                        disabled={busy}
                      />
                    </label>
                    <label className="admin-board__session-edit-field">
                      <span>{t('admin.board.sessionPlatform')}</span>
                      <input
                        type="text"
                        maxLength={80}
                        value={editingSession.platform}
                        onChange={(event) => onSessionDraftChange({ platform: event.target.value })}
                        disabled={busy}
                      />
                    </label>
                    <label className="admin-board__session-edit-field">
                      <span>{t('admin.board.sessionWeighIn')}</span>
                      <input
                        type="datetime-local"
                        value={editingSession.weighInAt}
                        onChange={(event) =>
                          onSessionDraftChange({ weighInAt: event.target.value })
                        }
                        disabled={busy}
                      />
                    </label>
                  </div>
                  <div className="admin-board__session-edit-actions">
                    <Button type="submit" className="btn--small" disabled={busy}>
                      {busy ? t('admin.board.savingSession') : t('admin.board.saveSession')}
                    </Button>
                    <button
                      type="button"
                      className="admin-board__text-btn"
                      onClick={onCancelEditSession}
                      disabled={busy}
                    >
                      {t('admin.board.cancelSessionEdit')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="admin-board__session-head">
                    <h3 className="admin-board__session-name">{session.name}</h3>
                    <span className="admin-board__count">{session.athletes.length}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="admin-board__icon-btn"
                        onClick={() => onEditSession(day, session)}
                        aria-label={t('admin.board.editSession')}
                        title={t('admin.board.editSession')}
                      >
                        <Pencil size={13} aria-hidden />
                      </button>
                    )}
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
                        canDrag={canDrag}
                        location={{ dayIndex: day.dayIndex, sessionId: session.id }}
                        onToggle={onToggle}
                        selected={selected}
                        t={t}
                      />
                    </>
                  )}
                </>
              )}
            </SessionBlock>
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
            canDrag={canDrag}
            location={{ dayIndex: day.dayIndex, sessionId: null }}
            onToggle={onToggle}
            selected={selected}
            t={t}
          />
        </div>
      )}
    </section>
  )
}

/** Tanda como drop zone: recibe atletas arrastrados además de los del lote. */
function SessionBlock({ canDrag, dayIndex, isEditing, session, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropIdForSession(dayIndex, session.id),
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      className={`admin-board__session${isOver ? ' is-drop-active' : ''}${
        isEditing ? ' admin-board__session--editing' : ''
      }`}
    >
      {children}
    </div>
  )
}

function AthleteList({ athletes, canDrag, location, onToggle, selected, t }) {
  return (
    <ul className="admin-board__list">
      {athletes.map((athlete) => (
        <AthleteRow
          athlete={athlete}
          canDrag={canDrag}
          key={athlete.registrationId}
          location={location}
          onToggle={onToggle}
          selected={selected}
          t={t}
        />
      ))}
    </ul>
  )
}

/**
 * Fila de atleta arrastrable. El checkbox sigue siendo el gesto de selección:
 * el MouseSensor pide 6px de recorrido antes de activar el arrastre, así que
 * clic y drag no se pisan. El camino de teclado es la barra de movimiento.
 */
function AthleteRow({ athlete, canDrag, location, onToggle, selected, t }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `athlete|${athlete.registrationId}`,
    data: { athlete, location },
    disabled: !canDrag,
  })

  return (
    <li ref={setNodeRef} {...(canDrag ? listeners : {})}>
      <label
        className={`admin-board__athlete${canDrag ? ' admin-board__athlete--draggable' : ''}${
          isDragging ? ' is-dragging' : ''
        }`}
      >
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
  )
}

/** Chip flotante durante el arrastre: nombre + cuántos viajan juntos. */
function DragChip({ athlete, count, t }) {
  return (
    <div className="admin-board__drag-chip admin-glass--strong">
      <span className="admin-board__drag-chip-name">{athlete.fullName}</span>
      {count > 1 && (
        <span className="admin-board__drag-chip-count">
          {t('admin.board.selectedCount', { count })}
        </span>
      )}
    </div>
  )
}
