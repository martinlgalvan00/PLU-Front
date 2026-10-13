import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../../styles/pages/admin-board.css'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  CalendarClock,
  ChevronRight,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import PlanPanel from '../../components/admin/board/PlanPanel.jsx'
import PlatformBar from '../../components/admin/board/PlatformBar.jsx'
import PublishToggle from '../../components/admin/board/PublishToggle.jsx'
import PoolToolbar from '../../components/admin/board/PoolToolbar.jsx'
import Button from '../../components/ui/Button.jsx'
import SegmentedSwitch from '../../components/ui/SegmentedSwitch.jsx'
import { useEventBoard } from '../../hooks/useEventBoard.js'
import { useGridTemplates } from '../../hooks/useGridTemplates.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatScheduleTime } from '../../lib/eventSchedule.js'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import {
  EMPTY_POOL_FILTERS,
  compositionFacets,
  groupAthletes,
  locationIndex,
  matchesPoolFilters,
  sessionStats,
  sessionsPayloadFromBoard,
  suggestFill,
} from '../../services/eventBoardPlanner.js'

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

/** Ubicación de la bolsa: ni día ni tanda. Constante para no recrearla en cada fila. */
const POOL_LOCATION = Object.freeze({ dayIndex: null, sessionId: null })

const DENSITY_STORAGE_KEY = 'plu.board.density'

// Comodidad por viewer (qué densidad prefiere): si el storage no está, se usa la automática.
function readStoredDensity() {
  try {
    const value = window.localStorage.getItem(DENSITY_STORAGE_KEY)
    return value === 'compact' || value === 'detail' ? value : null
  } catch {
    return null
  }
}

function storeDensity(value) {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, value)
  } catch {
    /* sin storage: la preferencia dura lo que dura la pantalla */
  }
}

/** Nombre legible del destino de un arrastre, para la ficha que flota. */
function dropLabel(id, days, t) {
  const target = parseDropId(id)
  if (!target) return ''
  if (target.dayIndex === null) return t('admin.board.moveToUnassigned')
  const day = days.find((item) => item.dayIndex === target.dayIndex)
  if (target.sessionId) {
    return day?.sessions.find((session) => session.id === target.sessionId)?.name ?? ''
  }
  return t('admin.board.dayWithoutSession', { day: day?.label ?? '' })
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

function ageLabel(athlete, t) {
  return athlete.age === null || athlete.age === undefined
    ? null
    : t('admin.board.athleteAge', { age: athlete.age })
}

function athleteMeta(athlete, t) {
  return [
    athlete.category,
    athlete.division,
    athlete.bodyweightKg ? `${athlete.bodyweightKg} kg` : null,
    ageLabel(athlete, t),
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
export default function ScheduleBoardSection({
  adminEvents = [],
  canEdit = false,
  // Tablados, tandas y publicación son estructura del evento (admin.events.write);
  // mover atletas es de inscripciones. Sin el permiso aparte se hereda canEdit.
  canEditStructure,
  onGoToEvents,
}) {
  const canStructure = canEditStructure ?? canEdit
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
  const layoutRef = useRef(null)
  const [densityPref, setDensityPref] = useState(readStoredDensity)
  const [expanded, setExpanded] = useState(() => new Set())
  const [editingSession, setEditingSession] = useState(null)
  const [poolFilters, setPoolFilters] = useState(() => ({ ...EMPTY_POOL_FILTERS }))
  const [poolView, setPoolView] = useState('list')
  const [planOpen, setPlanOpen] = useState(false)
  // Foto para deshacer el último reparto o movimiento; se descarta si cambia la estructura.
  const [undoToken, setUndoToken] = useState(null)

  const sensors = useSensors(
    // 6px de recorrido antes de activar: el clic sigue siendo selección.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // En touch el delay deja scrollear la lista sin levantar un arrastre.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  useEffect(() => {
    if (!eventSlug && eventOptions.length > 0) setEventSlug(eventOptions[0].slug)
  }, [eventOptions, eventSlug])

  const {
    addSession,
    applyPlan,
    assign,
    autofill,
    board,
    busy,
    days,
    error,
    platforms,
    pruneEmptySessions,
    removeSession,
    restore,
    savePlatforms,
    saveSessions,
    schedulePublic,
    setSchedulePublic,
    status,
    totals,
    unassigned,
  } = useEventBoard(eventSlug, { enabled: Boolean(eventSlug) })

  // Cambiar de evento invalida la selección: son inscripciones de otro torneo.
  useEffect(() => {
    setSelected(new Set())
    setNotice(null)
    setEditingSession(null)
    setPoolFilters({ ...EMPTY_POOL_FILTERS })
    setPlanOpen(false)
    setUndoToken(null)
  }, [eventSlug])

  const sessionsMissing = useMemo(
    () => days.length > 0 && days.every((day) => day.sessions.length === 0),
    [days],
  )

  const dndEnabled = canEdit && !busy

  // Con pocas tandas el plantel a la vista ayuda; con 20 es una pared. Hasta 6
  // tandas se muestra todo, después compactas, salvo que el operador elija.
  const sessionTotal = useMemo(
    () => days.reduce((sum, day) => sum + day.sessions.length, 0),
    [days],
  )
  const density = densityPref ?? (sessionTotal > 6 ? 'compact' : 'detail')
  const toggleExpanded = useCallback((sessionId) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  function changeDensity(next) {
    setDensityPref(next)
    storeDensity(next)
    setExpanded(new Set())
  }
  const templatesApi = useGridTemplates(eventSlug, { enabled: planOpen && canStructure })
  const emptySessions = useMemo(
    () => days.reduce((sum, day) => sum + day.sessions.filter((s) => s.athletes.length === 0).length, 0),
    [days],
  )

  // El armado automático trabaja sobre lo que la bolsa muestra: si hay filtros
  // activos, arma solo para esa parte (por ejemplo, todas las Junior).
  const planAthletes = useMemo(
    () => unassigned.filter((athlete) => matchesPoolFilters(athlete, poolFilters)),
    [unassigned, poolFilters],
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

  async function moveTo({ dayIndex, sessionId }, ids = selectedIds) {
    if (ids.length === 0) return
    const index = locationIndex(board)
    const previous = ids.map((id) => [id, index.get(id) ?? { dayIndex: null, sessionId: null }])
    const result = await assign({ registrationIds: ids, dayIndex, sessionId })
    if (!result) return
    setUndoToken({ previous, removeSessionNames: [] })
    setSelected(new Set())
    // `updated` puede ser menor que lo pedido: el backend descarta canceladas y
    // las de otro evento. Decirlo evita dar por completo un reparto que no lo está.
    setNotice(
      result.updated === result.requested
        ? t('admin.board.moved', { count: result.updated })
        : t('admin.board.movedPartial', { count: result.updated, total: result.requested }),
    )
  }

  // El estado del arrastre no vive en esta pantalla: guardarlo acá re-renderizaba
  // las 234 filas al empezar a arrastrar. La ficha que flota y la marca de las
  // zonas de destino lo leen del contexto de dnd-kit, más cerca de donde se usan.
  function handleDragEnd(event) {
    const drag = event.active.data.current
    if (!dndEnabled || !drag || !event.over) return
    const target = parseDropId(event.over.id)
    if (!target || sameLocation(drag.location, target)) return
    // Un grupo viaja entero. Un atleta suelto: si está dentro de la selección se
    // mueve la selección completa; si no, solo él. Es lo que espera cualquiera
    // que haya tildado treinta filas y arrastra una.
    const ids = drag.group
      ? drag.group.ids
      : selected.has(drag.athlete.registrationId)
        ? selectedIds
        : [drag.athlete.registrationId]
    void moveTo(target, ids)
  }

  function handleFill(day, session, ids) {
    void moveTo({ dayIndex: day.dayIndex, sessionId: session.id }, ids)
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
      platformId: session.platformId ?? '',
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
    const chosenPlatform = platforms.find((item) => item.id === editingSession.platformId)
    const hasPlatforms = platforms.length > 0
    const payload = sessionsPayloadFromBoard(days).map((session) =>
      session.id === editingSession.sessionId
        ? {
            ...session,
            name,
            // Con tablados definidos manda el id (null = sin tablado); sin ellos
            // sigue siendo el texto libre de siempre.
            platform: chosenPlatform?.name ?? (hasPlatforms ? '' : editingSession.platform.trim()),
            ...(hasPlatforms ? { platformId: chosenPlatform?.id ?? null } : {}),
            weighInAt: fromLocalInputValue(editingSession.weighInAt),
          }
        : session,
    )
    const ok = await saveSessions(payload)
    if (!ok) return
    setEditingSession(null)
    setNotice(t('admin.board.sessionSaved'))
  }

  async function handleApplyPlan(plan, extras) {
    const result = await applyPlan(plan, extras)
    if (!result) return
    setSelected(new Set())
    setPlanOpen(false)
    setUndoToken(result.undo)
    setNotice(
      result.leftover > 0
        ? t('admin.board.planAppliedPartial', {
            count: result.updated,
            total: result.requested,
            leftover: result.leftover,
          })
        : t('admin.board.planApplied', { count: result.updated }),
    )
  }

  async function handleUndo() {
    const token = undoToken
    if (!token) return
    const result = await restore(token)
    if (!result) return
    setUndoToken(null)
    setSelected(new Set())
    setNotice(t('admin.board.undone', { count: result.restored }))
  }

  async function handlePrune() {
    const removed = await pruneEmptySessions()
    if (removed === null) return
    setUndoToken(null)
    setNotice(t('admin.board.pruned', { count: removed }))
  }

  async function handleAddSession(day, platformId) {
    const name = await addSession({ dayIndex: day.dayIndex, platformId })
    if (name) {
      setUndoToken(null)
      setNotice(t('admin.board.sessionAdded', { name }))
    }
  }

  async function handleRemoveSession(session) {
    if (!(await removeSession(session.id))) return
    setUndoToken(null)
    setNotice(t('admin.board.sessionRemoved'))
  }

  async function handleTogglePublic(next) {
    if (!(await setSchedulePublic(next))) return
    setNotice(t(next ? 'admin.board.publishedOn' : 'admin.board.publishedOff'))
  }

  async function handleSavePlatforms(next) {
    const ok = await savePlatforms(next)
    if (ok) {
      setUndoToken(null)
      setNotice(t('admin.board.platformsSaved'))
    }
    return ok
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
          {undoToken ? (
            <button
              type="button"
              className="admin-board__text-btn admin-board__notice-undo"
              onClick={handleUndo}
              disabled={busy || !canEdit}
            >
              {t('admin.board.undo')}
            </button>
          ) : null}
        </p>
      )}

      {status === 'loading' && <p className="admin-board__empty">{t('admin.board.loading')}</p>}

      {status === 'ready' && days.length === 0 && <SetupEmpty onGoToEvents={onGoToEvents} t={t} />}

      {status === 'ready' && days.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollision}
          autoScroll={{ acceleration: 16 }}
          onDragEnd={handleDragEnd}
        >
          <DragLayoutClass targetRef={layoutRef} />
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

          <PlatformBar
            busy={busy}
            canEdit={canStructure}
            onSave={handleSavePlatforms}
            platforms={platforms}
            t={t}
          />

          <PublishToggle
            busy={busy}
            canEdit={canStructure}
            eventPublished={board?.event?.published}
            onChange={handleTogglePublic}
            t={t}
            value={schedulePublic}
          />

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

          {canEdit && canStructure && days.length > 0 && unassigned.length > 0 ? (
            <div className="admin-board__plan-toggle">
              <Button
                type="button"
                variant={planOpen ? 'outline' : 'primary'}
                className="btn--small"
                aria-expanded={planOpen}
                onClick={() => setPlanOpen((open) => !open)}
                disabled={busy}
              >
                <Sparkles size={15} aria-hidden />
                {t('admin.board.planOpen')}
              </Button>
            </div>
          ) : null}

          {planOpen ? (
            <PlanPanel
              board={board}
              busy={busy}
              canSaveTemplates={canStructure}
              days={days}
              emptySessions={emptySessions}
              flightSize={flightSize}
              key={`${eventSlug}-${platforms.map((item) => item.id).join(',')}`}
              locale={locale}
              onApply={handleApplyPlan}
              onClose={() => setPlanOpen(false)}
              onPrune={handlePrune}
              platforms={platforms}
              poolAthletes={planAthletes}
              t={t}
              templatesApi={templatesApi}
            />
          ) : null}

          {canEdit && <p className="admin-board__drag-hint">{t('admin.board.dragHint')}</p>}

          {sessionTotal > 0 ? (
            <div className="admin-board__density">
              <span className="admin-board__plan-label">{t('admin.board.densityLabel')}</span>
              <SegmentedSwitch
                active={density}
                ariaLabel={t('admin.board.densityAria')}
                className="admin-board__view-switch"
                onChange={changeDensity}
                options={[
                  ['compact', t('admin.board.densityCompact')],
                  ['detail', t('admin.board.densityDetail')],
                ]}
              />
            </div>
          ) : null}

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
            className={`admin-board__layout${unassigned.length === 0 ? ' admin-board__layout--solo' : ''}`}
            ref={layoutRef}
          >
            <AthletePool
              athletes={unassigned}
              canDrag={dndEnabled}
              filters={poolFilters}
              onFilters={setPoolFilters}
              onToggle={toggle}
              onToggleMany={toggleMany}
              onView={setPoolView}
              selected={selected}
              t={t}
              view={poolView}
            />

            <div className="admin-board__days">
              {days.map((day) => (
                <DayColumn
                  busy={busy}
                  canDrag={dndEnabled}
                  canEdit={canEdit}
                  canStructure={canStructure}
                  canMove={canEdit}
                  day={day}
                  density={density}
                  editingSession={editingSession}
                  expanded={expanded}
                  flightSize={flightSize}
                  key={day.id}
                  locale={locale}
                  onAddSession={handleAddSession}
                  onAutofill={handleAutofill}
                  onCancelEditSession={() => setEditingSession(null)}
                  onEditSession={startEditSession}
                  onFill={handleFill}
                  onFlightSizeChange={setFlightSize}
                  onGoToEvents={onGoToEvents}
                  onRemoveSession={handleRemoveSession}
                  onToggleExpanded={toggleExpanded}
                  onSaveSession={handleSaveSession}
                  onSessionDraftChange={(patch) =>
                    setEditingSession((current) => (current ? { ...current, ...patch } : current))
                  }
                  onToggle={toggle}
                  onToggleMany={toggleMany}
                  platforms={platforms}
                  pool={unassigned}
                  selected={selected}
                  t={t}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            <DragOverlayContent days={days} selected={selected} selectedIds={selectedIds} t={t} />
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

/** Nombre legible de un grupo de la bolsa: sexo · categoría · división. */
function groupLabel(group, t) {
  return [group.sex || t('admin.board.unknownSex'), group.category, group.division]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Bolsa de inscriptos sin ubicar. Es el trabajo pendiente del operador: con
 * filtros (sexo, categoría, división, peso, edad) y una vista agrupada para
 * seleccionar un grupo entero y mandarlo a una tanda de un gesto.
 */
function AthletePool({
  athletes,
  canDrag,
  filters,
  onFilters,
  onToggle,
  onToggleMany,
  onView,
  selected,
  t,
  view,
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: POOL_DROP_ID,
    disabled: !canDrag,
  })
  const facets = useMemo(() => compositionFacets(athletes), [athletes])
  const filtered = useMemo(
    () => athletes.filter((athlete) => matchesPoolFilters(athlete, filters)),
    [athletes, filters],
  )
  const groups = useMemo(() => (view === 'groups' ? groupAthletes(filtered) : []), [filtered, view])
  const ids = filtered.map((athlete) => athlete.registrationId)
  const location = { dayIndex: null, sessionId: null }

  return (
    <div
      ref={setNodeRef}
      className={`admin-board__pool admin-glass${isOver ? ' is-drop-active' : ''}`}
    >
      <div className="admin-board__panel-head admin-board__panel-head--pool">
        <div className="admin-board__pool-head-main">
          <span className="admin-board__panel-icon" aria-hidden>
            <Users size={15} strokeWidth={1.8} />
          </span>
          <h2 className="admin-board__panel-title">{t('admin.board.poolTitle')}</h2>
          <span className="admin-board__count" aria-label={String(filtered.length)}>
            {filtered.length}
          </span>
        </div>
        {filtered.length > 0 ? (
          <button
            type="button"
            className="admin-board__text-btn admin-board__pool-toggle-all"
            onClick={() => onToggleMany(ids)}
          >
            {t('admin.board.toggleAll')}
          </button>
        ) : null}
      </div>

      {athletes.length > 0 ? (
        <PoolToolbar
          facets={facets}
          filters={filters}
          onChange={onFilters}
          onView={onView}
          shown={filtered.length}
          t={t}
          total={athletes.length}
          view={view}
        />
      ) : null}

      {athletes.length === 0 ? (
        <p className="admin-board__empty admin-board__empty--inline">
          {t('admin.board.poolEmptyReady')}
        </p>
      ) : filtered.length === 0 ? (
        <p className="admin-board__empty admin-board__empty--inline">
          {t('admin.board.poolEmptyFilter')}
        </p>
      ) : view === 'groups' ? (
        <div className="admin-board__pool-scroll">
          {groups.map((group) => {
            const name = groupLabel(group, t)
            const groupIds = group.athletes.map((athlete) => athlete.registrationId)
            return (
              <section className="admin-board__group" key={group.key} aria-label={name}>
                <PoolGroupHead
                  canDrag={canDrag}
                  group={group}
                  groupIds={groupIds}
                  name={name}
                  onToggleMany={onToggleMany}
                  t={t}
                />
                <AthleteList
                  athletes={group.athletes}
                  canDrag={canDrag}
                  location={location}
                  onToggle={onToggle}
                  selected={selected}
                  splitMeta
                  t={t}
                />
              </section>
            )
          })}
        </div>
      ) : (
        <div className="admin-board__pool-scroll">
          <AthleteList
            athletes={filtered}
            canDrag={canDrag}
            location={location}
            onToggle={onToggle}
            selected={selected}
            splitMeta
            t={t}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Carriles del día: una columna por tablado. Sin tablados definidos hay un solo
 * carril sin cabecera (el comportamiento de siempre). Las tandas cuyo tablado
 * ya no existe, o que nunca tuvieron, caen en un carril "sin tablado" para que
 * no desaparezcan del tablero.
 */
function buildLanes(day, platforms, t) {
  if (platforms.length === 0) {
    return [{ key: 'all', platform: null, sessions: day.sessions }]
  }
  const known = new Set(platforms.map((platform) => platform.id))
  const lanes = platforms.map((platform) => ({
    key: platform.id,
    platform,
    sessions: day.sessions.filter((session) => session.platformId === platform.id),
  }))
  const orphans = day.sessions.filter(
    (session) => !session.platformId || !known.has(session.platformId),
  )
  if (orphans.length > 0) {
    lanes.push({
      key: 'none',
      platform: { id: null, name: t('admin.board.platformNone') },
      sessions: orphans,
    })
  }
  return lanes
}

function DayColumn({
  busy,
  canDrag,
  canEdit,
  canMove,
  canStructure,
  day,
  density,
  editingSession,
  expanded,
  flightSize,
  locale,
  onAddSession,
  onAutofill,
  onCancelEditSession,
  onEditSession,
  onFill,
  onFlightSizeChange,
  onRemoveSession,
  onSaveSession,
  onSessionDraftChange,
  onToggle,
  onToggleExpanded,
  onToggleMany,
  platforms,
  pool,
  selected,
  t,
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropIdForDay(day.dayIndex),
    disabled: !canDrag,
  })
  const lanes = useMemo(() => buildLanes(day, platforms, t), [day, platforms, t])
  const hasPlatforms = platforms.length > 0

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

      {day.sessions.length === 0 && (
        <p className="admin-board__empty admin-board__empty--inline">
          {t('admin.board.noSessions')}
        </p>
      )}

      <div className="admin-board__lanes" data-lanes={lanes.length}>
        {lanes.map((lane) => {
          const laneAthletes = lane.sessions.reduce(
            (total, session) => total + session.athletes.length,
            0,
          )
          const addLabel = lane.platform
            ? t('admin.board.addSessionLane', { platform: lane.platform.name, day: day.label })
            : t('admin.board.addSessionAria', { day: day.label })

          return (
            <div
              className="admin-board__lane"
              key={lane.key}
              role="group"
              aria-label={
                lane.platform
                  ? t('admin.board.platformLaneAria', { name: lane.platform.name })
                  : undefined
              }
            >
              {lane.platform ? (
                <div className="admin-board__lane-head">
                  <h3 className="admin-board__lane-name">{lane.platform.name}</h3>
                  <span className="admin-board__lane-count">
                    {t('admin.board.platformLaneCount', {
                      sessions: lane.sessions.length,
                      athletes: laneAthletes,
                    })}
                  </span>
                </div>
              ) : null}

              {lane.sessions.map((session) => (
                <SessionItem
                  busy={busy}
                  canDrag={canDrag}
                  canMove={canMove}
                  canStructure={canStructure}
                  day={day}
                  density={density}
                  editingSession={editingSession}
                  expanded={expanded.has(session.id)}
                  flightSize={flightSize}
                  hasPlatforms={hasPlatforms}
                  key={session.id}
                  locale={locale}
                  onCancelEditSession={onCancelEditSession}
                  onEditSession={onEditSession}
                  onFill={onFill}
                  onRemoveSession={onRemoveSession}
                  onSaveSession={onSaveSession}
                  onSessionDraftChange={onSessionDraftChange}
                  onToggle={onToggle}
                  onToggleExpanded={onToggleExpanded}
                  onToggleMany={onToggleMany}
                  platforms={platforms}
                  pool={pool}
                  selected={selected}
                  session={session}
                  t={t}
                />
              ))}

              {canStructure && lane.key !== 'none' ? (
                <button
                  type="button"
                  className="admin-board__add-session"
                  onClick={() => onAddSession(day, lane.platform?.id ?? null)}
                  disabled={busy}
                  aria-label={addLabel}
                >
                  <Plus size={14} aria-hidden />
                  {t('admin.board.addSession')}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

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

/** Una tanda: cabecera con ocupación y composición, edición inline y roster. */
function SessionItem({
  busy,
  canDrag,
  canMove,
  canStructure,
  day,
  density,
  editingSession,
  expanded,
  flightSize,
  hasPlatforms,
  locale,
  onCancelEditSession,
  onEditSession,
  onFill,
  onRemoveSession,
  onSaveSession,
  onSessionDraftChange,
  onToggle,
  onToggleExpanded,
  onToggleMany,
  platforms,
  pool,
  selected,
  session,
  t,
}) {
  const ids = session.athletes.map((athlete) => athlete.registrationId)
  const stats = sessionStats(session.athletes, flightSize)
  const compact = density === 'compact'
  // Compacta: la tanda es su cabecera (nombre, ocupación, composición) y el
  // plantel se abre a pedido. Sigue siendo una zona de destino completa.
  const showRoster = !compact || expanded
  const fill = useMemo(
    () => (canMove ? suggestFill({ session, pool, capacity: flightSize }) : []),
    [canMove, session, pool, flightSize],
  )
  // Con carriles el tablado ya es la cabecera de la columna: repetirlo en cada
  // tanda sería ruido. Sin tablados definidos, la plataforma de texto sigue acá.
  const detail = [
    !hasPlatforms && session.platform,
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
              {hasPlatforms ? (
                <select
                  value={editingSession.platformId}
                  onChange={(event) => onSessionDraftChange({ platformId: event.target.value })}
                  disabled={busy}
                >
                  <option value="">{t('admin.board.platformNone')}</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  maxLength={80}
                  value={editingSession.platform}
                  onChange={(event) => onSessionDraftChange({ platform: event.target.value })}
                  disabled={busy}
                />
              )}
            </label>
            <label className="admin-board__session-edit-field">
              <span>{t('admin.board.sessionWeighIn')}</span>
              <input
                type="datetime-local"
                value={editingSession.weighInAt}
                onChange={(event) => onSessionDraftChange({ weighInAt: event.target.value })}
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
            <span
              className={`admin-board__occupancy${stats.over ? ' is-over' : ''}`}
              title={stats.over ? t('admin.board.sessionOver') : undefined}
            >
              {t('admin.board.occupancy', { count: stats.count, max: stats.capacity })}
            </span>
            {compact && session.athletes.length > 0 ? (
              <button
                type="button"
                className="admin-board__icon-btn admin-board__icon-btn--visible"
                aria-expanded={expanded}
                onClick={() => onToggleExpanded(session.id)}
                aria-label={t(expanded ? 'admin.board.collapseSession' : 'admin.board.expandSession', {
                  name: session.name,
                })}
                title={t(expanded ? 'admin.board.collapseSession' : 'admin.board.expandSession', {
                  name: session.name,
                })}
              >
                <ChevronRight className="admin-board__chevron" size={14} aria-hidden />
              </button>
            ) : null}
            {canStructure && (
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
            {canStructure && (
              <button
                type="button"
                className="admin-board__icon-btn"
                onClick={() => onRemoveSession(session)}
                disabled={busy || session.athletes.length > 0}
                aria-label={t('admin.board.removeSessionAria', { name: session.name })}
                title={
                  session.athletes.length > 0
                    ? t('admin.board.removeSessionHasAthletes')
                    : t('admin.board.removeSession')
                }
              >
                <Trash2 size={13} aria-hidden />
              </button>
            )}
          </div>
          <span className="admin-board__meter" aria-hidden>
            <span
              className={stats.over ? 'is-over' : undefined}
              style={{ width: `${Math.min(100, (stats.count / Math.max(1, stats.capacity)) * 100)}%` }}
            />
          </span>
          {detail && <p className="admin-board__session-detail">{detail}</p>}
          {(stats.composition || stats.mixedSex || stats.over) && (
            <p className="admin-board__session-composition">
              {stats.composition ? <span>{stats.composition}</span> : null}
              {stats.mixedSex ? (
                <span className="admin-board__flag">{t('admin.board.sessionMixedSex')}</span>
              ) : null}
              {stats.over ? (
                <span className="admin-board__flag">{t('admin.board.sessionOver')}</span>
              ) : null}
            </p>
          )}

          {fill.length > 0 ? (
            <button
              type="button"
              className="admin-board__text-btn admin-board__fill"
              onClick={() => onFill(day, session, fill)}
              disabled={busy}
              aria-label={t('admin.board.fillSessionAria', { name: session.name, count: fill.length })}
            >
              <Sparkles size={13} aria-hidden />
              {t('admin.board.fillSession', { count: fill.length })}
            </button>
          ) : null}

          {session.athletes.length === 0 ? (
            <p className="admin-board__empty admin-board__empty--inline">
              {t('admin.board.sessionEmpty')}
            </p>
          ) : showRoster ? (
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
          ) : null}
        </>
      )}
    </SessionBlock>
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

function AthleteList({ athletes, canDrag, location, onToggle, selected, splitMeta = false, t }) {
  const dayIndex = location.dayIndex
  const sessionId = location.sessionId
  return (
    <ul className="admin-board__list">
      {athletes.map((athlete) => (
        <AthleteRow
          athlete={athlete}
          canDrag={canDrag}
          checked={selected.has(athlete.registrationId)}
          dayIndex={dayIndex}
          key={athlete.registrationId}
          onToggle={onToggle}
          sessionId={sessionId}
          splitMeta={splitMeta}
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
const AthleteRow = memo(function AthleteRow({
  athlete,
  canDrag,
  checked,
  dayIndex,
  onToggle,
  sessionId,
  splitMeta = false,
  t,
}) {
  // `checked` llega como booleano (y no el Set de la selección) para que tildar
  // una fila no re-renderice las otras 233.
  const data = useMemo(
    () => ({ athlete, location: { dayIndex, sessionId } }),
    [athlete, dayIndex, sessionId],
  )
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `athlete|${athlete.registrationId}`,
    data,
    disabled: !canDrag,
  })

  // En la bolsa el peso va aparte (es el dato por el que se ordena) y el resto
  // en una sola línea: categoría · división · edad · club.
  const poolMeta = [athlete.category, athlete.division, ageLabel(athlete, t), athlete.gym]
    .filter(Boolean)
    .join(' · ')

  return (
    <li ref={setNodeRef} {...(canDrag ? listeners : {})}>
      <label
        className={`admin-board__athlete${canDrag ? ' admin-board__athlete--draggable' : ''}${
          isDragging ? ' is-dragging' : ''
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(athlete.registrationId)}
          aria-label={t('admin.board.selectAthlete', { name: athlete.fullName })}
        />
        <span className="admin-board__athlete-body">
          <span className="admin-board__athlete-name">{athlete.fullName}</span>
          {splitMeta ? (
            <>
              {athlete.bodyweightKg ? (
                <span className="admin-board__athlete-weight">{athlete.bodyweightKg} kg</span>
              ) : null}
              {poolMeta ? (
                <span
                  className="admin-board__athlete-meta admin-board__athlete-meta--specs"
                  title={poolMeta}
                >
                  {poolMeta}
                </span>
              ) : null}
            </>
          ) : (
            <span className="admin-board__athlete-meta">{athleteMeta(athlete, t)}</span>
          )}
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
})

/** Chip flotante durante el arrastre: nombre + cuántos viajan juntos. */
function DragChip({ count, name, target, t }) {
  return (
    <div className="admin-board__drag-chip admin-glass--strong">
      <span className="admin-board__drag-chip-name">{name}</span>
      {count > 1 && (
        <span className="admin-board__drag-chip-count">
          {t('admin.board.selectedCount', { count })}
        </span>
      )}
      {target ? (
        <span className="admin-board__drag-chip-target">
          {t('admin.board.dragTarget', { name: target })}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Contenido de la ficha que flota. Lee el arrastre del contexto de dnd-kit en
 * vez de recibirlo por props: así empezar a arrastrar no re-renderiza el tablero
 * entero. Dice a dónde va (la zona bajo el puntero) antes de soltar.
 */
function DragOverlayContent({ days, selected, selectedIds, t }) {
  const { active, over } = useDndContext()
  const data = active?.data.current
  if (!data) return null
  const count = data.group
    ? data.group.ids.length
    : selected.has(data.athlete.registrationId)
      ? selectedIds.length
      : 1
  return (
    <DragChip
      count={count}
      name={data.group ? data.group.name : data.athlete.fullName}
      t={t}
      target={over ? dropLabel(over.id, days, t) : ''}
    />
  )
}

/** Marca el tablero mientras hay un arrastre (las zonas de destino se insinúan) sin pasar por estado de React. */
function DragLayoutClass({ targetRef }) {
  const mark = (on) => () => targetRef.current?.classList.toggle('admin-board__layout--dragging', on)
  useDndMonitor({ onDragStart: mark(true), onDragEnd: mark(false), onDragCancel: mark(false) })
  return null
}

/** Cabecera de un grupo de la bolsa. Se arrastra entera: el grupo viaja de una a una tanda. */
function PoolGroupHead({ canDrag, group, groupIds, name, onToggleMany, t }) {
  const data = useMemo(
    () => ({ group: { name, ids: groupIds }, location: POOL_LOCATION }),
    [name, groupIds],
  )
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `group|${group.key}`,
    data,
    disabled: !canDrag,
  })
  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? listeners : {})}
      className={`admin-board__group-head${canDrag ? ' admin-board__group-head--draggable' : ''}${
        isDragging ? ' is-dragging' : ''
      }`}
      title={canDrag ? t('admin.board.groupDrag', { name }) : undefined}
    >
      <h3 className="admin-board__group-name">{name}</h3>
      <span className="admin-board__count">{group.athletes.length}</span>
      <button
        type="button"
        className="admin-board__text-btn admin-board__group-select"
        onClick={() => onToggleMany(groupIds)}
        aria-label={t('admin.board.groupSelect', { name })}
      >
        {t('admin.board.selectGroup')}
      </button>
    </div>
  )
}
