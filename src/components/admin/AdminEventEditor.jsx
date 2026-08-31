import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  Link2,
  MapPin,
  Radio,
  Save,
  ShieldCheck,
  Star,
  Ticket,
  Unlock,
  Users,
  X,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import DetailTabs from './DetailTabs.jsx'
import Button from '../ui/Button.jsx'
import DateTimeLocalInput from '../ui/DateTimeLocalInput.jsx'
import EventCard from '../ui/EventCard.jsx'
import CapacityBar from '../ui/CapacityBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  EVENT_QUICK_STATUS_VALUES,
  getEventConsistencyWarnings,
  getEventRegistrationAvailability,
  mapDraftToPreviewEvent,
  withEventStart,
} from '../../services/eventAdminService.js'
import { DEFAULT_EVENT_PRICING } from '../../lib/eventPricing.js'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import { createPaymentProfile, fetchPaymentProfiles } from '../../services/paymentProfileService.js'
import AdminTicketAddonsEditor from './AdminTicketAddonsEditor.jsx'
import AdminTicketTypesEditor from './AdminTicketTypesEditor.jsx'

function updatePricingField(draft, field, value) {
  return {
    ...draft,
    pricing: {
      ...DEFAULT_EVENT_PRICING,
      ...(draft.pricing ?? {}),
      [field]: value,
    },
  }
}

function draftSignature(draft) {
  return JSON.stringify(draft ?? {})
}

export function getAdminEventDraftSignature(draft) {
  return draftSignature(draft)
}

const SALES_FIELD_KEYS = new Set([
  'slots',
  'registrationOpensAt',
  'registrationClosesAt',
  'ticketSalesOpensAt',
  'ticketSalesClosesAt',
])

const VISIBILITY_FIELD_KEYS = new Set([
  'status',
  'liveStreamUrl',
  'liveStreamProvider',
  'liveStatus',
])

/** A qué tab pertenece cada clave de `validateAdminEventDraft` — determina a
 * dónde saltar cuando falla el guardado y qué tab marcar con el punto de error. */
function resolveTabForField(key) {
  if (!key) return 'basics'
  if (
    key.startsWith('pricing.') ||
    key.startsWith('eventDays.') ||
    key.startsWith('ticketTypes.') ||
    SALES_FIELD_KEYS.has(key)
  )
    return 'sales'
  if (VISIBILITY_FIELD_KEYS.has(key)) return 'visibility'
  return 'basics'
}

function FormField({ children, error, htmlFor, label, wide = false }) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <label
      className={`admin-event-form__field${wide ? ' admin-event-form__field--wide' : ''}${error ? ' is-invalid' : ''}`}
      htmlFor={htmlFor}
    >
      <span>{label}</span>
      {children}
      {error ? (
        <span className="admin-event-form__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  )
}

function AdminEventLivePreview({
  draft,
  embedded = false,
  live = false,
  showReadiness = false,
  sourceEvent,
}) {
  const { t } = useI18n()
  const previewEvent = useMemo(
    () => mapDraftToPreviewEvent(draft, sourceEvent),
    [draft, sourceEvent],
  )
  const registration = useMemo(
    () => getEventRegistrationAvailability({ ...sourceEvent, ...previewEvent }),
    [previewEvent, sourceEvent],
  )
  const activeTicketTypes =
    (draft?.ticketTypes ?? sourceEvent?.ticketTypes)?.filter(
      (ticketType) => ticketType.active !== false,
    ).length ?? 0

  const readinessItems = showReadiness
    ? [
        {
          id: 'published',
          ok: previewEvent.published,
          label: previewEvent.published
            ? t('admin.eventEditor.readinessPublished')
            : t('admin.eventEditor.readinessUnpublished'),
        },
        {
          id: 'registration',
          ok: registration.isLive,
          label: registration.isLive
            ? t('admin.eventEditor.readinessRegistrationLive')
            : t('admin.eventEditor.readinessRegistrationOff'),
        },
        {
          id: 'tickets',
          ok: activeTicketTypes > 0,
          label:
            activeTicketTypes > 0
              ? t('admin.eventEditor.readinessTickets', { count: activeTicketTypes })
              : t('admin.eventEditor.readinessTicketsMissing'),
        },
      ]
    : []

  return (
    <div
      className={`admin-event-preview${live ? ' admin-event-preview--live' : ''}${embedded ? ' admin-event-preview--embedded' : ''}`.trim()}
    >
      {!embedded && (
        <div className="admin-event-preview__head">
          <div className="admin-event-preview__head-copy">
            <span className="admin-event-preview__label">
              {live ? (
                <>
                  <span className="admin-event-preview__live-dot" aria-hidden />
                  {t('admin.eventEditor.livePreview')}
                </>
              ) : (
                t('admin.eventEditor.publicPreview')
              )}
            </span>
            <p>{live ? t('admin.eventEditor.liveHint') : t('admin.eventEditor.calendarHint')}</p>
          </div>
          {live && (
            <span className="admin-event-preview__badge">
              <Eye size={12} aria-hidden />
              {t('admin.eventEditor.previewBadge')}
            </span>
          )}
        </div>
      )}

      {embedded && live ? (
        <p className="admin-event-preview__live-caption" role="status">
          <span className="admin-event-preview__live-dot" aria-hidden />
          {t('admin.eventEditor.liveHint')}
        </p>
      ) : null}

      <div className="admin-event-preview__card">
        <EventCard
          date={previewEvent.date}
          featured={previewEvent.featured}
          location={previewEvent.location}
          status={previewEvent.status}
          title={previewEvent.title}
          venue={previewEvent.venue}
        />
      </div>

      <div
        className={`admin-event-preview__publication${previewEvent.published ? ' is-published' : ''}`}
        role="status"
      >
        {previewEvent.published ? (
          <CheckCircle2 size={13} aria-hidden />
        ) : (
          <Eye size={13} aria-hidden />
        )}
        <span>
          {previewEvent.published
            ? t('admin.eventEditor.previewPublished')
            : t('admin.eventEditor.previewPrivate')}
        </span>
      </div>

      <div className="admin-event-preview__footer">
        <div className="admin-event-preview__capacity">
          <CapacityBar
            compact
            current={previewEvent.registered}
            total={previewEvent.slots}
            label={t('admin.eventEditor.slotsShortLabel')}
          />
        </div>

        <ul
          className="admin-event-preview__meta"
          aria-label={t('admin.eventEditor.previewMetaAria')}
        >
          <li>
            <span className="admin-event-preview__meta-icon" aria-hidden>
              <CalendarDays size={13} />
            </span>
            <span className="admin-event-preview__meta-copy">
              <span className="admin-event-preview__meta-label">
                {t('admin.eventEditor.metaDate')}
              </span>
              <strong>{previewEvent.date}</strong>
            </span>
          </li>
          <li>
            <span className="admin-event-preview__meta-icon" aria-hidden>
              <MapPin size={13} />
            </span>
            <span className="admin-event-preview__meta-copy">
              <span className="admin-event-preview__meta-label">
                {t('admin.eventEditor.metaVenue')}
              </span>
              <strong>
                {previewEvent.venue}
                {previewEvent.location ? ` · ${previewEvent.location}` : ''}
              </strong>
            </span>
          </li>
          <li>
            <span className="admin-event-preview__meta-icon" aria-hidden>
              <Link2 size={13} />
            </span>
            <span className="admin-event-preview__meta-copy">
              <span className="admin-event-preview__meta-label">
                {t('admin.eventEditor.metaSlug')}
              </span>
              <code>{previewEvent.slug}</code>
            </span>
          </li>
        </ul>
      </div>

      {readinessItems.length > 0 ? (
        <ul
          className="admin-event-preview__readiness"
          aria-label={t('admin.eventEditor.readinessLabel')}
        >
          {readinessItems.map((item) => (
            <li
              key={item.id}
              className={`admin-event-preview__readiness-item${item.ok ? ' is-ok' : ' is-pending'}`}
            >
              {item.ok ? (
                <CheckCircle2 size={13} aria-hidden />
              ) : (
                <CircleAlert size={13} aria-hidden />
              )}
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function AdminEventEditor({
  canEdit,
  draft,
  /** Sin portal ni shell propio: el formulario vive dentro de la consola. */
  embedded = false,
  /**
   * Acordeón de la consola: una sola sección visible, sin barra embed ni tabs.
   * El padre fuerza la pestaña con `forcedTab` y mantiene el draft al cambiar.
   */
  accordion = false,
  /** Firma del draft al abrir el acordeón; si viene, define dirty sin remount. */
  baselineSignature = null,
  forcedTab = null,
  initialFocus = 'details',
  onCancel,
  onChange,
  /** La consola registra Escape/backdrop para pedir el mismo cierre con dirty-check. */
  onRegisterClose = null,
  onSubmit,
  sourceEvent = null,
}) {
  const { t } = useI18n()
  // En el acordeón de la consola solo lo elemental de cada sección: el form
  // completo (canales MP/banco, tipos de entrada, live) sigue disponible fuera
  // del fold o al editar en modal. Acá el objetivo es ajustar cupo, fechas,
  // precio y publicación sin scrollear un tab entero en 240px.
  const essentials = accordion
  const [syncError, setSyncError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [activeTab, setActiveTab] = useState('basics')
  const [bankProfiles, setBankProfiles] = useState([])
  const [bankProfilesLoading, setBankProfilesLoading] = useState(false)
  const [mpProfiles, setMpProfiles] = useState([])
  const [mpProfilesLoading, setMpProfilesLoading] = useState(false)
  const [mpSecretsKeyConfigured, setMpSecretsKeyConfigured] = useState(true)
  const [mpCreateOpen, setMpCreateOpen] = useState(false)
  const [mpCreating, setMpCreating] = useState(false)
  const [mpCreateError, setMpCreateError] = useState(null)
  const [mpDraft, setMpDraft] = useState({
    name: '',
    publicKey: '',
    accessToken: '',
    webhookSecret: '',
    collectorId: '',
  })
  const dialogTitle = draft.id
    ? t('admin.eventEditor.editTitle')
    : t('admin.eventEditor.createTitle')
  const headingTitle = draft.id && draft.title?.trim() ? draft.title.trim() : dialogTitle
  const onCancelRef = useRef(onCancel)
  const requestCloseRef = useRef(null)
  const formRef = useRef(null)
  const panelRef = useRef(null)
  const activePanelRef = useRef(null)
  const formBodyRef = useRef(null)
  const previousFocusRef = useRef(null)
  const initialDraftSignatureRef = useRef(baselineSignature ?? draftSignature(draft))
  const dirty = draftSignature(draft) !== initialDraftSignatureRef.current
  onCancelRef.current = onCancel

  useEffect(() => {
    if (baselineSignature != null) {
      initialDraftSignatureRef.current = baselineSignature
    }
  }, [baselineSignature])

  useEffect(() => {
    let active = true
    setBankProfilesLoading(true)
    setMpProfilesLoading(true)
    Promise.all([
      fetchPaymentProfiles({ kind: 'bank_transfer' }),
      fetchPaymentProfiles({ kind: 'mercado_pago' }),
    ])
      .then(([bank, mp]) => {
        if (!active) return
        setBankProfiles(bank.profiles)
        setMpProfiles(mp.profiles)
        setMpSecretsKeyConfigured(mp.secretsKeyConfigured !== false)
      })
      .catch(() => {
        if (!active) return
        setBankProfiles([])
        setMpProfiles([])
      })
      .finally(() => {
        if (!active) return
        setBankProfilesLoading(false)
        setMpProfilesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedBankProfile = useMemo(
    () => bankProfiles.find((profile) => profile.id === draft.bankTransferProfileId) ?? null,
    [bankProfiles, draft.bankTransferProfileId],
  )

  const selectedMpProfile = useMemo(
    () => mpProfiles.find((profile) => profile.id === draft.mercadoPagoProfileId) ?? null,
    [mpProfiles, draft.mercadoPagoProfileId],
  )

  function applyBankProfile(profileId) {
    if (!profileId) {
      patchDraft({
        ...draft,
        bankTransferProfileId: null,
      })
      return
    }
    const profile = bankProfiles.find((item) => item.id === profileId)
    if (!profile) {
      patchDraft({ ...draft, bankTransferProfileId: profileId })
      return
    }
    patchDraft({
      ...draft,
      bankTransferProfileId: profile.id,
      bankTransfer: {
        alias: profile.config?.alias ?? '',
        cbu: profile.config?.cbu ?? '',
        holder: profile.config?.holder ?? '',
      },
    })
  }

  function applyMpProfile(profileId) {
    patchDraft({
      ...draft,
      mercadoPagoProfileId: profileId || null,
    })
  }

  async function handleCreateMpProfile() {
    setMpCreateError(null)
    setMpCreating(true)
    try {
      const profile = await createPaymentProfile({
        name: mpDraft.name.trim() || `Mercado Pago · ${draft.title || draft.slug || 'evento'}`,
        kind: 'mercado_pago',
        config: {
          publicKey: mpDraft.publicKey.trim(),
          collectorId: mpDraft.collectorId.trim(),
        },
        secrets: {
          accessToken: mpDraft.accessToken.trim(),
          webhookSecret: mpDraft.webhookSecret.trim(),
        },
      })
      if (!profile?.id) throw new Error('No se pudo crear el perfil.')
      setMpProfiles((current) => [profile, ...current.filter((item) => item.id !== profile.id)])
      patchDraft({ ...draft, mercadoPagoProfileId: profile.id })
      setMpCreateOpen(false)
      setMpDraft({
        name: '',
        publicKey: '',
        accessToken: '',
        webhookSecret: '',
        collectorId: '',
      })
    } catch (error) {
      setMpCreateError(error?.message ?? t('admin.eventEditor.mercadoPagoSecretsKeyMissing'))
    } finally {
      setMpCreating(false)
    }
  }

  // `agotado` lo pone y lo saca la base según el cupo; solo se ofrece como
  // opción cuando el evento ya está en ese estado (mismo criterio que el
  // control rápido de la lista).
  const statusOptions = useMemo(
    () =>
      translateFilterOptions(
        ADMIN_EVENT_STATUS_OPTIONS.filter(
          ([value]) => EVENT_QUICK_STATUS_VALUES.includes(value) || value === draft.status,
        ),
        t,
      ),
    [t, draft.status],
  )

  // Mismo par de opciones y mismo copy que la consola de operación del panel:
  // el requisito de afiliación se decide en los dos lugares y no puede leerse
  // distinto según por dónde se entre.
  const accessOptions = useMemo(
    () => [
      ['members', t('admin.eventState.accessMembers')],
      ['open', t('admin.eventState.accessOpen')],
    ],
    [t],
  )

  const tabsWithErrors = useMemo(() => {
    const set = new Set()
    for (const key of Object.keys(fieldErrors)) set.add(resolveTabForField(key))
    return set
  }, [fieldErrors])

  /**
   * Grilla y zonas de seguridad ya no son pestañas de acá: viven en la consola
   * del evento, a ancho completo y guardando por su cuenta. Tenerlas en el
   * editor obligaba a pasar por un guardado que reescribe el evento entero --
   * días, tandas y tipos de entrada -- para agregar una tanda o mover a alguien
   * de zona. Lo que queda son las tres secciones que sí se guardan con el
   * evento.
   */
  const tabs = useMemo(
    () =>
      [
        { id: 'basics', label: t('admin.eventEditor.navBasics') },
        { id: 'sales', label: t('admin.eventEditor.navSales') },
        { id: 'visibility', label: t('admin.eventEditor.navVisibility') },
      ].map((tab) => ({ ...tab, hasError: tabsWithErrors.has(tab.id) })),
    [t, tabsWithErrors],
  )

  const consistencyWarnings = useMemo(
    () => getEventConsistencyWarnings(draft, sourceEvent),
    [draft, sourceEvent],
  )

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        requestCloseRef.current?.()
        return
      }

      // El trap de foco lo sostiene la consola cuando el editor está embebido.
      if (embedded || event.key !== 'Tab' || !panelRef.current) return
      const focusable = [
        ...panelRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    if (!embedded) document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusFrame = requestAnimationFrame(() => {
      const preferredTarget =
        !draft.id && initialFocus === 'details'
          ? formRef.current?.querySelector('[name="title"]')
          : panelRef.current?.querySelector('button, input, select, textarea, summary')
      preferredTarget?.focus?.()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      if (!embedded) document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (!embedded) previousFocusRef.current?.focus?.()
    }
  }, [draft.id, embedded, initialFocus])

  useEffect(() => {
    if (!embedded || !onRegisterClose) return undefined
    onRegisterClose(() => requestCloseRef.current?.())
    return () => onRegisterClose(null)
  }, [embedded, onRegisterClose])

  useEffect(() => {
    if (!dirty) return undefined

    function preventAccidentalExit(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventAccidentalExit)
    return () => window.removeEventListener('beforeunload', preventAccidentalExit)
  }, [dirty])

  useEffect(() => {
    if (forcedTab === 'basics' || forcedTab === 'sales' || forcedTab === 'visibility') {
      setActiveTab(forcedTab)
      formBodyRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
      return undefined
    }
    if (initialFocus === 'tickets' || initialFocus === 'sales') {
      setActiveTab('sales')
      const frame = requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector('#event-section-tickets')
          ?.scrollIntoView({ behavior: 'auto', block: 'start' })
      })
      return () => cancelAnimationFrame(frame)
    }
    if (initialFocus === 'basics' || initialFocus === 'details') {
      setActiveTab('basics')
      return undefined
    }
    if (initialFocus === 'visibility') {
      setActiveTab('visibility')
      return undefined
    }
    return undefined
  }, [forcedTab, initialFocus])

  function patchDraft(next) {
    onChange(next)
    setConfirmDiscard(false)
    if (Object.keys(fieldErrors).length) setFieldErrors({})
    if (syncError) setSyncError(null)
  }

  function requestClose() {
    if (syncing) return
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    onCancelRef.current?.()
  }

  requestCloseRef.current = requestClose

  function handleTabChange(nextTab) {
    if (nextTab === activeTab) return
    setActiveTab(nextTab)
    formBodyRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
    requestAnimationFrame(() => activePanelRef.current?.focus?.())
  }

  function focusFirstInvalid(firstKey) {
    if (!firstKey || !formRef.current) return
    const byName = formRef.current.querySelector(`[name="${firstKey}"]`)
    const byData = formRef.current.querySelector(`[data-field="${firstKey}"]`)
    const target = byName ?? byData ?? formRef.current.querySelector('[aria-invalid="true"]')
    target?.focus?.()
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    setSyncError(null)

    const registered = sourceEvent?.registered ?? 0
    if (draft.id && Number(draft.slots) < registered) {
      setFieldErrors({
        slots: t('admin.eventEditor.validation.slotsBelowRegistered', { count: registered }),
      })
      setActiveTab('sales')
      requestAnimationFrame(() => requestAnimationFrame(() => focusFirstInvalid('slots')))
      return
    }

    const validation = validateAdminEventDraft(draft, t)
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      setActiveTab(resolveTabForField(validation.firstKey))
      requestAnimationFrame(() =>
        requestAnimationFrame(() => focusFirstInvalid(validation.firstKey)),
      )
      return
    }

    setFieldErrors({})
    setSyncing(true)
    try {
      const result = await onSubmit?.(draft)
      if (result?.error) throw new Error(result.error)
    } catch (error) {
      setSyncError(
        error?.status === 409
          ? t('admin.eventEditor.conflictError')
          : (error?.message ?? t('admin.eventEditor.saveError')),
      )
      return
    } finally {
      setSyncing(false)
    }
  }

  const err = (key) => fieldErrors[key]
  const ticketSalesEnabled = draft.pricing?.ticketsEnabled === true
  const configuredTicketTypes = (draft.ticketTypes ?? []).filter(
    (ticketType) => ticketType.active !== false,
  ).length
  const ticketConfigurationSummary = t('admin.eventEditor.ticketConfigurationSummary', {
    days: draft.eventDays?.length ?? 0,
    types: configuredTicketTypes,
  })
  const registeredCount = sourceEvent?.registered ?? 0
  const slotsTotal = Math.max(0, Number(draft.slots) || 0)
  const slotsRemaining = Math.max(slotsTotal - registeredCount, 0)
  const fillPercent = slotsTotal > 0 ? Math.round((registeredCount / slotsTotal) * 100) : 0
  const activeTabHasError = tabsWithErrors.has(activeTab)
  const saveStateLabel = syncing
    ? t('admin.eventEditor.saving')
    : dirty
      ? t('admin.eventEditor.unsavedChanges')
      : t('admin.eventEditor.noPendingChanges')
  const saveStateShortLabel = syncing
    ? t('admin.eventEditor.savingShort')
    : dirty
      ? t('admin.eventEditor.unsavedShort')
      : t('admin.eventEditor.readyShort')
  const saveStateModifier = syncing ? 'is-syncing' : dirty ? 'is-dirty' : 'is-ready'

  const editorTree = (
    <div
      ref={embedded ? panelRef : undefined}
      className={`admin-event-editor${draft.id ? ' admin-event-editor--editing' : ' admin-event-editor--creating'}${
        embedded ? ' admin-event-editor--embedded' : ''
      }${accordion ? ' admin-event-editor--accordion' : ''}${essentials ? ' admin-event-editor--essentials' : ''}`}
    >
      <form
        ref={formRef}
        className="admin-event-form admin-event-form--editor"
        onSubmit={handleFormSubmit}
        noValidate
      >
        {embedded && !accordion ? (
          <div className="admin-event-editor__embed-bar">
            <button
              type="button"
              className="admin-event-editor__embed-back"
              onClick={requestClose}
              disabled={syncing}
            >
              <ArrowLeft size={14} aria-hidden />
              {t('admin.eventConsole.backToConsole')}
            </button>
            <span className="admin-event-form__mode">{t('admin.eventEditor.editMode')}</span>
          </div>
        ) : null}
        {!embedded ? (
          <div className="admin-event-form__head">
            <div className="admin-event-form__head-copy">
              <span className="admin-event-form__mode">
                {draft.id ? t('admin.eventEditor.editMode') : t('admin.eventEditor.createMode')}
              </span>
              <h3 id="admin-event-editor-title">{headingTitle}</h3>
              <p id="admin-event-editor-lead" className="admin-event-form__lead">
                {draft.id ? dialogTitle : t('admin.eventEditor.lead')}
              </p>
            </div>
            <button
              type="button"
              className="admin-event-form__close"
              onClick={requestClose}
              aria-label={t('admin.eventEditor.close')}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        {/* Barra fija: tabs + estado de guardado. En acordeón la sección la
            elige la consola; acá solo queda el estado de sync. */}
        {accordion ? (
          <div className="admin-event-editor__toolbar admin-event-editor__toolbar--accordion">
            <div
              className={`admin-event-form__save-state admin-event-form__save-state--toolbar ${saveStateModifier}`}
              aria-live="polite"
              aria-label={saveStateLabel}
              title={t('admin.eventEditor.backendHint')}
            >
              <span className={saveStateModifier} aria-hidden />
              <strong>
                <span className="admin-event-form__save-label admin-event-form__save-label--full">
                  {saveStateLabel}
                </span>
                <span className="admin-event-form__save-label admin-event-form__save-label--short" aria-hidden>
                  {saveStateShortLabel}
                </span>
              </strong>
            </div>
          </div>
        ) : (
          <div className="admin-event-editor__toolbar">
            <DetailTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={handleTabChange}
              variant="glass"
            />
            <div
              className={`admin-event-form__save-state admin-event-form__save-state--toolbar ${saveStateModifier}`}
              aria-live="polite"
              aria-label={saveStateLabel}
              title={t('admin.eventEditor.backendHint')}
            >
              <span className={saveStateModifier} aria-hidden />
              <strong>
                <span className="admin-event-form__save-label admin-event-form__save-label--full">
                  {saveStateLabel}
                </span>
                <span className="admin-event-form__save-label admin-event-form__save-label--short" aria-hidden>
                  {saveStateShortLabel}
                </span>
              </strong>
            </div>
          </div>
        )}

        <div ref={formBodyRef} className="admin-event-form__body">
          {!accordion ? (
            <details className="admin-event-form__mobile-preview">
              <summary>
                <Eye size={14} aria-hidden />
                {t('admin.eventEditor.openPreview')}
              </summary>
              <AdminEventLivePreview embedded draft={draft} sourceEvent={sourceEvent} />
            </details>
          ) : null}

          {activeTabHasError ? (
            <p className="admin-event-form__alert" role="alert">
              {t('admin.eventEditor.validationSummary')}
            </p>
          ) : null}

              {activeTab === 'basics' && (
                <section
                  ref={activePanelRef}
                  className="admin-event-form__section"
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navBasics')}
                  tabIndex={-1}
                >
                  <header className="admin-event-form__section-head">
                    <h4>{t('admin.eventEditor.sectionBasics')}</h4>
                    {!essentials ? <p>{t('admin.eventEditor.sectionBasicsLead')}</p> : null}
                  </header>

                  <div className="admin-event-form__grid">
                    <FormField
                      wide
                      htmlFor="event-title"
                      label={t('admin.eventEditor.publicTitle')}
                      error={err('title')}
                    >
                      <input
                        id="event-title"
                        name="title"
                        data-field="title"
                        required
                        value={draft.title}
                        aria-invalid={Boolean(err('title'))}
                        onChange={(event) => patchDraft({ ...draft, title: event.target.value })}
                        placeholder={t('admin.eventEditor.titlePlaceholder')}
                        disabled={!canEdit}
                      />
                    </FormField>

                    {!essentials ? (
                      <FormField
                        wide
                        htmlFor="event-description"
                        label={t('admin.eventEditor.description')}
                        error={err('description')}
                      >
                        <textarea
                          id="event-description"
                          name="description"
                          data-field="description"
                          rows={4}
                          maxLength={1000}
                          value={draft.description ?? ''}
                          aria-invalid={Boolean(err('description'))}
                          onChange={(event) =>
                            patchDraft({ ...draft, description: event.target.value })
                          }
                          placeholder={t('admin.eventEditor.descriptionPlaceholder')}
                          disabled={!canEdit}
                        />
                      </FormField>
                    ) : null}

                      <FormField
                      htmlFor="event-starts-at"
                      label={t('admin.eventEditor.supabase.startsAt')}
                      error={err('startsAt')}
                    >
                      <DateTimeLocalInput
                        id="event-starts-at"
                        name="startsAt"
                        data-field="startsAt"
                        required
                        value={draft.startsAt ?? ''}
                        aria-invalid={Boolean(err('startsAt'))}
                        onChange={(event) => patchDraft(withEventStart(draft, event.target.value))}
                        disabled={!canEdit}
                      />
                    </FormField>

                    <FormField
                      htmlFor="event-ends-at"
                      label={t('admin.eventEditor.supabase.endsAt')}
                      error={err('endsAt')}
                    >
                      <DateTimeLocalInput
                        id="event-ends-at"
                        name="endsAt"
                        data-field="endsAt"
                        required
                        value={draft.endsAt ?? ''}
                        aria-invalid={Boolean(err('endsAt'))}
                        onChange={(event) => patchDraft({ ...draft, endsAt: event.target.value })}
                        disabled={!canEdit}
                      />
                    </FormField>

                    <FormField
                      htmlFor="event-venue"
                      label={t('admin.eventEditor.venue')}
                      error={err('venue')}
                    >
                      <input
                        id="event-venue"
                        name="venue"
                        data-field="venue"
                        required
                        value={draft.venue}
                        aria-invalid={Boolean(err('venue'))}
                        onChange={(event) => patchDraft({ ...draft, venue: event.target.value })}
                        placeholder={t('admin.eventEditor.venuePlaceholder')}
                        disabled={!canEdit}
                      />
                    </FormField>

                    <FormField
                      htmlFor="event-location"
                      label={t('admin.eventEditor.location')}
                      error={err('location')}
                    >
                      <input
                        id="event-location"
                        name="location"
                        data-field="location"
                        required
                        value={draft.location}
                        aria-invalid={Boolean(err('location'))}
                        onChange={(event) => patchDraft({ ...draft, location: event.target.value })}
                        placeholder={t('admin.eventEditor.locationPlaceholder')}
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>
                </section>
              )}

              {activeTab === 'sales' && (
                <section
                  ref={activePanelRef}
                  id="event-section-sales"
                  className="admin-event-form__section admin-event-form__section--sales"
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navSales')}
                  tabIndex={-1}
                >
                  <header className="admin-event-form__section-head">
                    <h4>{t('admin.eventEditor.sectionSales')}</h4>
                    <p>
                      {essentials
                        ? t('admin.eventEditor.sectionSalesLeadEssentials')
                        : t('admin.eventEditor.sectionSalesLead')}
                    </p>
                  </header>

                  <div className="admin-event-form__lane admin-event-form__lane--athletes">
                    <header className="admin-event-form__lane-head">
                      <h5 className="admin-event-form__lane-title">
                        <Users size={13} aria-hidden />
                        {t('admin.eventEditor.laneAthletes')}
                      </h5>
                      <p>{t('admin.eventEditor.laneAthletesLead')}</p>
                    </header>

                    <div className="admin-event-form__grid">
                      <FormField
                        htmlFor="event-slots"
                        label={t('admin.eventEditor.totalSlots')}
                        error={err('slots')}
                      >
                        <input
                          id="event-slots"
                          name="slots"
                          data-field="slots"
                          min={1}
                          required
                          type="number"
                          value={draft.slots}
                          aria-invalid={Boolean(err('slots'))}
                          onChange={(event) => patchDraft({ ...draft, slots: event.target.value })}
                          disabled={!canEdit}
                        />
                      </FormField>

                      <div
                        className="admin-event-form__occupancy"
                        role="status"
                        aria-label={t('admin.eventEditor.occupancyAria', {
                          registered: registeredCount,
                          total: slotsTotal,
                          percent: fillPercent,
                        })}
                      >
                        <div className="admin-event-form__occupancy-copy">
                          <span className="admin-event-form__occupancy-value">
                            {t('admin.eventEditor.occupancyPulse', {
                              registered: registeredCount,
                              total: slotsTotal,
                            })}
                          </span>
                          <span className="admin-event-form__occupancy-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="admin-event-form__occupancy-pct">
                            {t('admin.eventEditor.occupancyPercent', { percent: fillPercent })}
                          </span>
                          <span className="admin-event-form__occupancy-hint">
                            {t('admin.eventEditor.slotsRemaining', { count: slotsRemaining })}
                          </span>
                        </div>
                        <div className="admin-event-form__occupancy-meter" aria-hidden="true">
                          <span
                            className="admin-event-form__occupancy-meter-fill"
                            style={{ width: `${Math.min(100, Math.max(0, fillPercent))}%` }}
                          />
                        </div>
                      </div>

                      <FormField
                        htmlFor="event-reg-opens"
                        label={t('admin.eventEditor.supabase.registrationOpensAt')}
                        error={err('registrationOpensAt')}
                      >
                        <DateTimeLocalInput
                          id="event-reg-opens"
                          name="registrationOpensAt"
                          data-field="registrationOpensAt"
                          value={draft.registrationOpensAt ?? ''}
                          aria-invalid={Boolean(err('registrationOpensAt'))}
                          onChange={(event) =>
                            patchDraft({ ...draft, registrationOpensAt: event.target.value })
                          }
                          disabled={!canEdit}
                        />
                      </FormField>

                      <FormField
                        htmlFor="event-reg-closes"
                        label={t('admin.eventEditor.supabase.registrationClosesAt')}
                        error={err('registrationClosesAt')}
                      >
                        <DateTimeLocalInput
                          id="event-reg-closes"
                          name="registrationClosesAt"
                          data-field="registrationClosesAt"
                          value={draft.registrationClosesAt ?? ''}
                          aria-invalid={Boolean(err('registrationClosesAt'))}
                          onChange={(event) =>
                            patchDraft({ ...draft, registrationClosesAt: event.target.value })
                          }
                          disabled={!canEdit}
                        />
                      </FormField>
                    </div>

                    {/* La ocupación es información del organizador; exhibirla en
                        el sitio es una decisión. El panel sigue viendo la
                        barra y los números acá y en la lista pase lo que pase. */}
                    {!essentials ? (
                      <label className="admin-event-form__toggle">
                        <input
                          checked={draft.capacityProgressPublic !== false}
                          className="admin-event-form__toggle-input"
                          type="checkbox"
                          onChange={(event) =>
                            patchDraft({
                              ...draft,
                              capacityProgressPublic: event.target.checked,
                            })
                          }
                          disabled={!canEdit}
                        />
                        <span className="admin-event-form__toggle-ui" aria-hidden />
                        <span className="admin-event-form__toggle-copy">
                          <strong>
                            <Eye size={13} aria-hidden />
                            {t('admin.eventEditor.capacityVisibilityTitle')}
                          </strong>
                          <small>{t('admin.eventEditor.capacityVisibilityHint')}</small>
                        </span>
                      </label>
                    ) : null}

                    <div className="admin-event-form__rate-cards">
                      <label
                        className={`admin-event-form__rate-card${err('pricing.registration') ? ' is-invalid' : ''}`}
                      >
                        <span className="admin-event-form__rate-card-label">
                          {t('admin.eventEditor.priceRegistration')}
                        </span>
                        <span className="admin-event-form__rate-card-input">
                          <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                          <input
                            name="pricing.registration"
                            data-field="pricing.registration"
                            min={1}
                            required
                            type="number"
                            value={
                              draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration
                            }
                            aria-invalid={Boolean(err('pricing.registration'))}
                            onChange={(event) =>
                              patchDraft(
                                updatePricingField(draft, 'registration', event.target.value),
                              )
                            }
                            disabled={!canEdit}
                          />
                        </span>
                        {err('pricing.registration') ? (
                          <span className="admin-event-form__error" role="alert">
                            {err('pricing.registration')}
                          </span>
                        ) : null}
                      </label>
                      {!essentials ? (
                        <>
                          <label
                            className={`admin-event-form__rate-card${err('pricing.registrationManual') ? ' is-invalid' : ''}`}
                          >
                            <span className="admin-event-form__rate-card-label">
                              {t('admin.eventEditor.priceRegistrationManual')}
                            </span>
                            <span className="admin-event-form__rate-card-input">
                              <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                              <input
                                name="pricing.registrationManual"
                                data-field="pricing.registrationManual"
                                min={1}
                                type="number"
                                placeholder={t('admin.eventEditor.priceRegistrationManualPlaceholder')}
                                value={draft.pricing?.registrationManual ?? ''}
                                aria-invalid={Boolean(err('pricing.registrationManual'))}
                                onChange={(event) =>
                                  patchDraft(
                                    updatePricingField(
                                      draft,
                                      'registrationManual',
                                      event.target.value,
                                    ),
                                  )
                                }
                                disabled={!canEdit}
                              />
                            </span>
                            {err('pricing.registrationManual') ? (
                              <span className="admin-event-form__error" role="alert">
                                {err('pricing.registrationManual')}
                              </span>
                            ) : null}
                          </label>
                          <p className="admin-event-form__pricing-note">
                            {t('admin.eventEditor.pricingCatalogHint')}
                          </p>
                        </>
                      ) : null}
                    </div>

                    {!essentials ? (
                    <div className="admin-event-form__payment-profile">
                      <header className="admin-event-form__lane-head">
                        <h5 className="admin-event-form__lane-title">
                          {t('admin.eventEditor.paymentProfileTitle')}
                        </h5>
                        <p>{t('admin.eventEditor.paymentProfileHint')}</p>
                      </header>

                      <label className="admin-event-form__toggle">
                        <input
                          checked={draft.paymentChannelOverrides != null}
                          className="admin-event-form__toggle-input"
                          type="checkbox"
                          onChange={(event) =>
                            patchDraft({
                              ...draft,
                              paymentChannelOverrides: event.target.checked
                                ? {
                                    mercado_pago: true,
                                    bank_transfer: true,
                                    cash_pitbull: true,
                                    wise_transfer: true,
                                  }
                                : null,
                            })
                          }
                          disabled={!canEdit}
                        />
                        <span className="admin-event-form__toggle-ui" aria-hidden />
                        <span className="admin-event-form__toggle-copy">
                          <strong>{t('admin.eventEditor.paymentProfileCustomize')}</strong>
                          <small>{t('admin.eventEditor.paymentProfileCustomizeHint')}</small>
                        </span>
                      </label>

                      {draft.paymentChannelOverrides != null ? (
                        <div className="admin-event-form__channel-grid" role="group">
                          {[
                            ['mercado_pago', 'paymentChannelMercadoPago'],
                            ['bank_transfer', 'paymentChannelBankTransfer'],
                            ['cash_pitbull', 'paymentChannelCashPitbull'],
                            ['wise_transfer', 'paymentChannelWise'],
                          ].map(([channel, labelKey]) => (
                            <label className="admin-event-form__toggle" key={channel}>
                              <input
                                checked={draft.paymentChannelOverrides?.[channel] !== false}
                                className="admin-event-form__toggle-input"
                                type="checkbox"
                                onChange={(changeEvent) =>
                                  patchDraft({
                                    ...draft,
                                    paymentChannelOverrides: {
                                      ...draft.paymentChannelOverrides,
                                      [channel]: changeEvent.target.checked,
                                    },
                                  })
                                }
                                disabled={!canEdit}
                              />
                              <span className="admin-event-form__toggle-ui" aria-hidden />
                              <span className="admin-event-form__toggle-copy">
                                <strong>{t(`admin.eventEditor.${labelKey}`)}</strong>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {draft.paymentChannelOverrides == null ||
                      draft.paymentChannelOverrides.mercado_pago !== false ? (
                        <div className="admin-event-form__bank-transfer">
                          <header className="admin-event-form__lane-head">
                            <h5 className="admin-event-form__lane-title">
                              {t('admin.eventEditor.mercadoPagoProfileTitle')}
                            </h5>
                            <p>{t('admin.eventEditor.mercadoPagoProfileHint')}</p>
                          </header>

                          {!mpSecretsKeyConfigured ? (
                            <p className="admin-event-form__pricing-note" role="status">
                              {t('admin.eventEditor.mercadoPagoSecretsKeyMissing')}
                            </p>
                          ) : null}

                          <FormField
                            htmlFor="event-mp-profile"
                            label={t('admin.eventEditor.mercadoPagoProfile')}
                            wide
                          >
                            <select
                              id="event-mp-profile"
                              name="mercadoPagoProfileId"
                              value={draft.mercadoPagoProfileId ?? ''}
                              onChange={(changeEvent) =>
                                applyMpProfile(changeEvent.target.value || null)
                              }
                              disabled={!canEdit || mpProfilesLoading}
                            >
                              <option value="">
                                {t('admin.eventEditor.mercadoPagoProfileNone')}
                              </option>
                              {mpProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name}
                                  {profile.config?.publicKey
                                    ? ` · ${String(profile.config.publicKey).slice(0, 12)}…`
                                    : ''}
                                </option>
                              ))}
                            </select>
                          </FormField>

                          {selectedMpProfile ? (
                            <p className="admin-event-form__pricing-note" role="status">
                              {t('admin.eventEditor.mercadoPagoProfileSelected', {
                                name: selectedMpProfile.name,
                                publicKey: selectedMpProfile.config?.publicKey
                                  ? `${String(selectedMpProfile.config.publicKey).slice(0, 16)}…`
                                  : '—',
                              })}
                            </p>
                          ) : null}

                          {canEdit && mpSecretsKeyConfigured ? (
                            <div className="admin-event-form__grid">
                              <button
                                className="button button--ghost"
                                type="button"
                                onClick={() => setMpCreateOpen((open) => !open)}
                              >
                                {t('admin.eventEditor.mercadoPagoProfileCreate')}
                              </button>
                            </div>
                          ) : null}

                          {mpCreateOpen ? (
                            <div className="admin-event-form__grid">
                              <FormField
                                htmlFor="event-mp-name"
                                label={t('admin.eventEditor.mercadoPagoProfileName')}
                              >
                                <input
                                  id="event-mp-name"
                                  value={mpDraft.name}
                                  onChange={(changeEvent) =>
                                    setMpDraft({ ...mpDraft, name: changeEvent.target.value })
                                  }
                                />
                              </FormField>
                              <FormField
                                htmlFor="event-mp-public-key"
                                label={t('admin.eventEditor.mercadoPagoPublicKey')}
                              >
                                <input
                                  id="event-mp-public-key"
                                  value={mpDraft.publicKey}
                                  onChange={(changeEvent) =>
                                    setMpDraft({ ...mpDraft, publicKey: changeEvent.target.value })
                                  }
                                  autoComplete="off"
                                />
                              </FormField>
                              <FormField
                                htmlFor="event-mp-access-token"
                                label={t('admin.eventEditor.mercadoPagoAccessToken')}
                              >
                                <input
                                  id="event-mp-access-token"
                                  type="password"
                                  value={mpDraft.accessToken}
                                  onChange={(changeEvent) =>
                                    setMpDraft({
                                      ...mpDraft,
                                      accessToken: changeEvent.target.value,
                                    })
                                  }
                                  autoComplete="new-password"
                                />
                              </FormField>
                              <FormField
                                htmlFor="event-mp-webhook-secret"
                                label={t('admin.eventEditor.mercadoPagoWebhookSecret')}
                              >
                                <input
                                  id="event-mp-webhook-secret"
                                  type="password"
                                  value={mpDraft.webhookSecret}
                                  onChange={(changeEvent) =>
                                    setMpDraft({
                                      ...mpDraft,
                                      webhookSecret: changeEvent.target.value,
                                    })
                                  }
                                  autoComplete="new-password"
                                />
                              </FormField>
                              {mpCreateError ? (
                                <p className="admin-event-form__pricing-note" role="alert">
                                  {mpCreateError}
                                </p>
                              ) : null}
                              <button
                                className="button button--primary"
                                type="button"
                                disabled={mpCreating}
                                onClick={() => void handleCreateMpProfile()}
                              >
                                {t('admin.eventEditor.mercadoPagoProfileCreate')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {draft.paymentChannelOverrides == null ||
                      draft.paymentChannelOverrides.bank_transfer !== false ? (
                        <div className="admin-event-form__bank-transfer">
                          <header className="admin-event-form__lane-head">
                            <h5 className="admin-event-form__lane-title">
                              {t('admin.eventEditor.bankTransferTitle')}
                            </h5>
                            <p>{t('admin.eventEditor.bankTransferHint')}</p>
                          </header>

                          <FormField
                            htmlFor="event-bank-profile"
                            label={t('admin.eventEditor.bankTransferProfile')}
                            wide
                          >
                            <select
                              id="event-bank-profile"
                              name="bankTransferProfileId"
                              value={draft.bankTransferProfileId ?? ''}
                              onChange={(changeEvent) =>
                                applyBankProfile(changeEvent.target.value || null)
                              }
                              disabled={!canEdit || bankProfilesLoading}
                            >
                              <option value="">
                                {t('admin.eventEditor.bankTransferProfileNone')}
                              </option>
                              {bankProfiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name}
                                  {profile.config?.alias ? ` · ${profile.config.alias}` : ''}
                                </option>
                              ))}
                            </select>
                            <small className="admin-event-form__field-hint">
                              {t('admin.eventEditor.bankTransferProfileHint')}
                            </small>
                          </FormField>

                          {selectedBankProfile ? (
                            <p className="admin-event-form__pricing-note" role="status">
                              {t('admin.eventEditor.bankTransferProfileSelected', {
                                name: selectedBankProfile.name,
                                alias: selectedBankProfile.config?.alias || '—',
                              })}
                            </p>
                          ) : null}

                          <div className="admin-event-form__grid">
                            <FormField
                              htmlFor="event-bank-alias"
                              label={t('admin.eventEditor.bankTransferAlias')}
                            >
                              <input
                                id="event-bank-alias"
                                name="bankTransfer.alias"
                                type="text"
                                maxLength={120}
                                value={draft.bankTransfer?.alias ?? ''}
                                onChange={(changeEvent) =>
                                  patchDraft({
                                    ...draft,
                                    bankTransferProfileId: null,
                                    bankTransfer: {
                                      ...(draft.bankTransfer ?? {}),
                                      alias: changeEvent.target.value,
                                    },
                                  })
                                }
                                disabled={!canEdit}
                                placeholder={t(
                                  'admin.eventEditor.bankTransferAliasPlaceholder',
                                )}
                              />
                            </FormField>
                            <FormField
                              htmlFor="event-bank-cbu"
                              label={t('admin.eventEditor.bankTransferCbu')}
                            >
                              <input
                                id="event-bank-cbu"
                                name="bankTransfer.cbu"
                                type="text"
                                maxLength={30}
                                value={draft.bankTransfer?.cbu ?? ''}
                                onChange={(changeEvent) =>
                                  patchDraft({
                                    ...draft,
                                    bankTransferProfileId: null,
                                    bankTransfer: {
                                      ...(draft.bankTransfer ?? {}),
                                      cbu: changeEvent.target.value,
                                    },
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </FormField>
                            <FormField
                              htmlFor="event-bank-holder"
                              label={t('admin.eventEditor.bankTransferHolder')}
                              wide
                            >
                              <input
                                id="event-bank-holder"
                                name="bankTransfer.holder"
                                type="text"
                                maxLength={160}
                                value={draft.bankTransfer?.holder ?? ''}
                                onChange={(changeEvent) =>
                                  patchDraft({
                                    ...draft,
                                    bankTransferProfileId: null,
                                    bankTransfer: {
                                      ...(draft.bankTransfer ?? {}),
                                      holder: changeEvent.target.value,
                                    },
                                  })
                                }
                                disabled={!canEdit}
                              />
                            </FormField>
                          </div>
                          <p className="admin-event-form__pricing-note">
                            {t('admin.eventEditor.bankTransferSaveCreatesProfile')}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    ) : null}
                  </div>

                  <div
                    id="event-section-tickets"
                    className="admin-event-form__lane admin-event-form__lane--tickets"
                  >
                    <header className="admin-event-form__lane-head">
                      <h5 className="admin-event-form__lane-title">
                        <Ticket size={13} aria-hidden />
                        {t('admin.eventEditor.laneSpectators')}
                      </h5>
                      <p>{t('admin.eventEditor.laneSpectatorsLead')}</p>
                    </header>

                    <label className="admin-event-form__toggle">
                      <input
                        checked={ticketSalesEnabled}
                        className="admin-event-form__toggle-input"
                        type="checkbox"
                        onChange={(event) =>
                          patchDraft(
                            updatePricingField(draft, 'ticketsEnabled', event.target.checked),
                          )
                        }
                        disabled={!canEdit}
                      />
                      <span className="admin-event-form__toggle-ui" aria-hidden />
                      <span className="admin-event-form__toggle-copy">
                        <strong>
                          <Ticket size={13} aria-hidden />
                          {t('admin.eventEditor.ticketsEnabledTitle')}
                        </strong>
                        <small>{t('admin.eventEditor.ticketsEnabledHint')}</small>
                      </span>
                    </label>

                    {ticketSalesEnabled ? (
                      essentials ? (
                        <p className="admin-event-form__section-note">
                          {t('admin.eventEditor.essentialsTicketsNote', {
                            count:
                              draft.ticketTypes?.filter((ticketType) => ticketType.active !== false)
                                .length ?? 0,
                          })}
                        </p>
                      ) : (
                      <>
                        {/* La ventana de venta queda al mismo nivel que la de
                        inscripción: son las dos palancas de cierre del evento y
                        antes esta vivía dos <details> más adentro. */}
                        <div className="admin-event-form__grid">
                          <FormField
                            htmlFor="event-ticket-opens"
                            label={t('admin.eventEditor.supabase.ticketSalesOpensAt')}
                            error={err('ticketSalesOpensAt')}
                          >
                            <DateTimeLocalInput
                              id="event-ticket-opens"
                              name="ticketSalesOpensAt"
                              data-field="ticketSalesOpensAt"
                              value={draft.ticketSalesOpensAt ?? ''}
                              aria-invalid={Boolean(err('ticketSalesOpensAt'))}
                              onChange={(event) =>
                                patchDraft({ ...draft, ticketSalesOpensAt: event.target.value })
                              }
                              disabled={!canEdit}
                            />
                          </FormField>
                          <FormField
                            htmlFor="event-ticket-closes"
                            label={t('admin.eventEditor.supabase.ticketSalesClosesAt')}
                            error={err('ticketSalesClosesAt')}
                          >
                            <DateTimeLocalInput
                              id="event-ticket-closes"
                              name="ticketSalesClosesAt"
                              data-field="ticketSalesClosesAt"
                              value={draft.ticketSalesClosesAt ?? ''}
                              aria-invalid={Boolean(err('ticketSalesClosesAt'))}
                              onChange={(event) =>
                                patchDraft({ ...draft, ticketSalesClosesAt: event.target.value })
                              }
                              disabled={!canEdit}
                            />
                          </FormField>
                        </div>

                        {/* Antes vivía detrás de un <details>: con tabs reales cada
                        pantalla ya está acotada a un solo tema, así que la
                        config de entradas queda siempre a la vista. */}
                        <div className="admin-event-form__ticket-config">
                          <div className="admin-event-form__ticket-config-summary admin-event-form__ticket-config-summary--static">
                            <span>
                              <strong>{t('admin.eventEditor.configureTickets')}</strong>
                              <small>{ticketConfigurationSummary}</small>
                            </span>
                          </div>

                          <div className="admin-event-form__ticket-config-body">
                            <AdminTicketAddonsEditor
                              addons={draft.pricing?.ticketAddons ?? []}
                              canEdit={canEdit}
                              errors={fieldErrors}
                              onChange={(ticketAddons) =>
                                patchDraft(updatePricingField(draft, 'ticketAddons', ticketAddons))
                              }
                            />

                            <AdminTicketTypesEditor
                              addonsCatalog={draft.pricing?.ticketAddons ?? []}
                              canEdit={canEdit}
                              errors={fieldErrors}
                              eventDays={draft.eventDays ?? []}
                              onChangeEventDays={(eventDays) => patchDraft({ ...draft, eventDays })}
                              onChangeTicketTypes={(ticketTypes) =>
                                patchDraft({ ...draft, ticketTypes })
                              }
                              ticketTypes={draft.ticketTypes ?? []}
                            />
                          </div>
                        </div>
                      </>
                      )
                    ) : (
                      <p className="admin-event-form__section-note">
                        {t('admin.eventEditor.ticketsDisabledNote')}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'visibility' && (
                <section
                  ref={activePanelRef}
                  className="admin-event-form__section"
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navVisibility')}
                  tabIndex={-1}
                >
                  <header className="admin-event-form__section-head">
                    <h4>{t('admin.eventEditor.sectionVisibility')}</h4>
                    {essentials ? (
                      <p>{t('admin.eventEditor.sectionVisibilityLeadEssentials')}</p>
                    ) : null}
                  </header>

                  {essentials ? (
                    <p className="admin-event-form__section-note">
                      {t('admin.eventEditor.visibilityOwnedByConsole')}
                    </p>
                  ) : (
                    <>
                      <AdminFilterChipGroup
                        compact
                        disabled={!canEdit}
                        id="event-status"
                        label={t('admin.eventEditor.publicStatus')}
                        value={draft.status}
                        onChange={(value) => patchDraft({ ...draft, status: value })}
                        options={statusOptions}
                      />

                      {consistencyWarnings.length > 0 ? (
                        <div className="admin-event-form__consistency" role="status">
                          <p className="admin-event-form__consistency-head">
                            <AlertTriangle size={13} aria-hidden />
                            {t('admin.eventEditor.consistency.title')}
                          </p>
                          <ul>
                            {consistencyWarnings.map((code) => (
                              <li key={code}>{t(`admin.eventEditor.consistency.${code}`)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}

                  <label className="admin-event-form__toggle">
                    <input
                      checked={draft.featured}
                      className="admin-event-form__toggle-input"
                      type="checkbox"
                      onChange={(event) => patchDraft({ ...draft, featured: event.target.checked })}
                      disabled={!canEdit}
                    />
                    <span className="admin-event-form__toggle-ui" aria-hidden />
                    <span className="admin-event-form__toggle-copy">
                      <strong>
                        <Star size={13} aria-hidden />
                        {t('admin.eventEditor.featuredTitle')}
                      </strong>
                      <small>{t('admin.eventEditor.featuredHint')}</small>
                    </span>
                  </label>

                  {essentials ? null : (
                    <>
                      <label className="admin-event-form__toggle">
                        <input
                          checked={Boolean(draft.published)}
                          className="admin-event-form__toggle-input"
                          type="checkbox"
                          onChange={(event) =>
                            patchDraft({ ...draft, published: event.target.checked })
                          }
                          disabled={!canEdit}
                        />
                        <span className="admin-event-form__toggle-ui" aria-hidden />
                        <span className="admin-event-form__toggle-copy">
                          <strong>
                            <Eye size={13} aria-hidden />
                            {draft.published
                              ? t('admin.eventEditor.supabase.publishedTitle')
                              : t('admin.eventEditor.supabase.unpublishedTitle')}
                          </strong>
                          <small>{t('admin.eventEditor.supabase.publishedHint')}</small>
                        </span>
                      </label>

                      {/* Acceso al meet: misma decisión que StateControl. En el
                          acordeón de la consola vive solo allá (PATCH parcial). */}
                      <div className="admin-event-form__access">
                        <AdminFilterChipGroup
                          compact
                          disabled={!canEdit}
                          id="event-access"
                          label={t('admin.eventEditor.accessLabel')}
                          value={draft.requiresMembership === false ? 'open' : 'members'}
                          onChange={(value) =>
                            patchDraft({ ...draft, requiresMembership: value === 'members' })
                          }
                          options={accessOptions}
                        />
                        <p className="admin-event-form__access-note">
                          {draft.requiresMembership === false ? (
                            <Unlock size={13} aria-hidden />
                          ) : (
                            <ShieldCheck size={13} aria-hidden />
                          )}
                          {draft.requiresMembership === false
                            ? t('admin.eventState.accessOpenNote')
                            : t('admin.eventState.accessMembersNote')}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Transmisión: fuera del acordeón elemental (solo destacado). */}
                  {!essentials ? (
                  <div className="admin-event-form__ticket-config">
                    <div className="admin-event-form__ticket-config-summary admin-event-form__ticket-config-summary--static">
                      <span>
                        <strong>
                          <Radio size={13} aria-hidden />
                          {t('admin.eventEditor.supabase.liveTitle')}
                        </strong>
                        <small>{t('admin.eventEditor.liveSummary')}</small>
                      </span>
                    </div>

                    <div className="admin-event-form__ticket-config-body">
                      <div className="admin-event-form__grid">
                        <FormField
                          wide
                          htmlFor="event-live-url"
                          label={t('admin.eventEditor.supabase.liveStreamUrl')}
                          error={err('liveStreamUrl')}
                        >
                          <input
                            id="event-live-url"
                            name="liveStreamUrl"
                            data-field="liveStreamUrl"
                            type="url"
                            placeholder="https://youtube.com/watch?v=..."
                            value={draft.liveStreamUrl ?? ''}
                            aria-invalid={Boolean(err('liveStreamUrl'))}
                            onChange={(event) =>
                              patchDraft({ ...draft, liveStreamUrl: event.target.value })
                            }
                            disabled={!canEdit}
                          />
                        </FormField>
                        <label className="admin-event-form__field" htmlFor="event-live-provider">
                          <span>{t('admin.eventEditor.supabase.liveStreamProvider')}</span>
                          <select
                            id="event-live-provider"
                            value={draft.liveStreamProvider ?? 'youtube'}
                            onChange={(event) =>
                              patchDraft({ ...draft, liveStreamProvider: event.target.value })
                            }
                            disabled={!canEdit}
                          >
                            <option value="youtube">YouTube</option>
                            <option value="instagram">Instagram</option>
                            <option value="twitch">Twitch</option>
                          </select>
                        </label>
                        <label className="admin-event-form__field" htmlFor="event-live-status">
                          <span>{t('admin.eventEditor.supabase.liveStatus')}</span>
                          <select
                            id="event-live-status"
                            value={draft.liveStatus ?? 'offline'}
                            onChange={(event) =>
                              patchDraft({ ...draft, liveStatus: event.target.value })
                            }
                            disabled={!canEdit}
                          >
                            <option value="offline">
                              {t('admin.eventEditor.supabase.liveStatusOffline')}
                            </option>
                            <option value="live">
                              {t('admin.eventEditor.supabase.liveStatusLive')}
                            </option>
                            <option value="ended">
                              {t('admin.eventEditor.supabase.liveStatusEnded')}
                            </option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                  ) : null}
                </section>
              )}


              {syncError && (
                <p className="admin-event-form__alert admin-event-form__alert--danger" role="alert">
                  {t('admin.eventEditor.supabase.syncError', { message: syncError })}
                </p>
              )}

              {confirmDiscard ? (
                <div className="admin-event-form__discard-confirmation" role="alert">
                  <div>
                    <strong>{t('admin.eventEditor.discardTitle')}</strong>
                    <p>{t('admin.eventEditor.discardLead')}</p>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      className="btn--small"
                      onClick={() => setConfirmDiscard(false)}
                    >
                      {t('admin.eventEditor.keepEditing')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="btn--small"
                      onClick={onCancel}
                    >
                      {t('admin.eventEditor.discard')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="admin-event-form__actions">
              <div className="admin-event-form__action-buttons">
                <Button type="button" variant="outline" onClick={requestClose} disabled={syncing}>
                  {accordion ? t('admin.eventConsole.closeSection') : t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  disabled={!canEdit || syncing || (Boolean(draft.id) && !dirty)}
                >
                  <Save size={15} aria-hidden />
                  {syncing
                    ? t('admin.eventEditor.saving')
                    : draft.id
                      ? t('admin.eventEditor.saveChanges')
                      : draft.published
                        ? t('admin.eventEditor.createAndPublish')
                        : t('admin.eventEditor.createDraft')}
                </Button>
              </div>
            </div>
          </form>

          {embedded ? null : <AdminEventLivePreview draft={draft} live sourceEvent={sourceEvent} />}
        </div>
  )

  if (embedded) return editorTree

  return createPortal(
    <div className="admin-event-editor-modal">
      <button
        type="button"
        className="admin-event-editor-modal__backdrop"
        aria-label={t('admin.eventEditor.close')}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        className="admin-event-editor-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-event-editor-title"
        aria-describedby="admin-event-editor-lead"
        tabIndex={-1}
      >
        {editorTree}
      </div>
    </div>,
    document.body,
  )
}

export { AdminEventLivePreview }
