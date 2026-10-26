import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  Link2,
  MapPin,
  Save,
  X,
} from 'lucide-react'
import DetailTabs from './DetailTabs.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import CapacityBar from '../ui/CapacityBar.jsx'
import { describePublicCapacity } from '../../lib/eventCapacityPublic.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  getEventConsistencyWarnings,
  getEventRegistrationAvailability,
  mapDraftToPreviewEvent,
  uploadEventHeroRequest,
} from '../../services/eventAdminService.js'
import { normalizeEventLanding } from '../../lib/eventLanding.js'
import EventLandingCompositionPreview from './event-editor/EventLandingCompositionPreview.jsx'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import usePlatformPaymentChannels from '../../hooks/usePlatformPaymentChannels.js'
import { platformCellsFor } from '../../lib/platformPaymentChannels.js'
import { resolveEventPublishChecks } from '../../lib/eventPublishChecks.js'
import { areaOfDraftField, describeDraftChanges } from '../../lib/eventDraftChanges.js'
import {
  effectiveEventChannelsFor,
} from '../../lib/eventPaymentChannels.js'
import { createPaymentProfile, fetchPaymentProfiles } from '../../services/paymentProfileService.js'
import '../../styles/pages/admin-event-sales.css'
import '../../styles/pages/admin-event-editor-modal.css'
import EventBasicsSection from './event-editor/EventBasicsSection.jsx'
import EventSalesSection from './event-editor/EventSalesSection.jsx'
import EventVisibilitySection from './event-editor/EventVisibilitySection.jsx'

function draftSignature(draft) {
  return JSON.stringify(draft ?? {})
}

export function getAdminEventDraftSignature(draft) {
  return draftSignature(draft)
}

const SALES_FIELD_KEYS = new Set([
  'slots',
  'capacityProgressPublic',
  'capacityTotalPublic',
  'registrationOpensAt',
  'registrationClosesAt',
  'ticketSalesOpensAt',
  'ticketSalesClosesAt',
  // Claves de raíz, sin índice: `ticketsNeedType` y `ticketsNeedDays` las
  // emiten como `ticketTypes` y `eventDays` pelados, y `startsWith('x.')` no
  // los agarra. Sin esto el guardado rebotaba a Datos -- otra pestaña, sin
  // ningún campo marcado -- y el motivo real no se mostraba en ningún lado.
  'ticketTypes',
  'eventDays',
])

function resolveSalesChapterForField(key) {
  if (!key) return 'cupo'
  if (
    key === 'ticketTypes' ||
    key === 'eventDays' ||
    key.startsWith('ticketTypes.') ||
    key.startsWith('pricing.ticketAddons') ||
    key === 'ticketSalesOpensAt' ||
    key === 'ticketSalesClosesAt'
  ) {
    // `eventDays` cae acá y no en Estructura a propósito: el error lo dispara
    // haber prendido la venta de entradas, y el capítulo ya ofrece el atajo a
    // Estructura para cargar las jornadas que faltan.
    return 'tickets'
  }
  if (
    key.startsWith('bankTransfer') ||
    key.startsWith('cashPayment') ||
    key.startsWith('paymentChannel') ||
    key === 'mercadoPagoProfileId' ||
    key === 'bankTransferProfileId'
  ) {
    return 'payment'
  }
  if (key.startsWith('pricing.')) return 'prices'
  return 'cupo'
}

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
    key.startsWith('paymentChannelOverrides') ||
    key.startsWith('bankTransfer') ||
    key.startsWith('cashPayment') ||
    key === 'mercadoPagoProfileId' ||
    SALES_FIELD_KEYS.has(key)
  )
    return 'sales'
  if (
    VISIBILITY_FIELD_KEYS.has(key) ||
    key.startsWith('publicCopy.') ||
    key.startsWith('externalForm') ||
    key.startsWith('landing.')
  ) {
    return 'visibility'
  }
  return 'basics'
}

/** Campos de Publicación que viven en el bloque colapsado "Avanzado". */
function isAdvancedVisibilityField(key) {
  return (
    key.startsWith('publicCopy.') ||
    key.startsWith('landing.') ||
    key.startsWith('externalForm') ||
    key.startsWith('liveStream') ||
    key === 'liveStatus'
  )
}

/** Abre "Avanzado" solo si el evento ya trae algo cargado ahí. */
function hasAdvancedVisibilityContent(draft) {
  const copy = draft.publicCopy ?? {}
  const slots = draft.landing?.slots ?? {}
  return (
    Object.values(copy).some((value) => String(value ?? '').trim() !== '') ||
    Object.values(slots).some((value) => String(value ?? '').trim() !== '') ||
    ['editorial', 'submission', 'builder'].includes(draft.landing?.templateId) ||
    Boolean(draft.liveStreamUrl?.trim?.()) ||
    Boolean(draft.externalForm?.url?.trim?.()) ||
    (draft.liveStatus ?? 'offline') !== 'offline'
  )
}

function AdminEventLivePreview({
  draft,
  embedded = false,
  live = false,
  showReadiness = false,
  /**
   * Solo "Así se ve en el sitio" (landing + Google). En el Resumen, la card,
   * el estado, el cupo, la fecha, la sede y el checklist ya están en el
   * control de venta y en la cabecera del evento: repetirlos era ruido.
   */
  compact = false,
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
  const composeEvent = useMemo(
    () => ({ ...sourceEvent, ...previewEvent, ...draft }),
    [draft, previewEvent, sourceEvent],
  )

  if (compact) {
    return (
      <div className="admin-event-preview admin-event-preview--embedded admin-event-preview--compact">
        <p className="admin-event-preview__site-caption">
          {t('admin.eventEditor.sitePreviewCaption')}
        </p>
        <EventLandingCompositionPreview event={composeEvent} t={t} />
      </div>
    )
  }

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

      {embedded ? (
        <p className="admin-event-preview__site-caption">
          {t('admin.eventEditor.sitePreviewCaption')}
        </p>
      ) : null}

      {embedded && live ? (
        <p className="admin-event-preview__live-caption" role="status">
          <span className="admin-event-preview__live-dot" aria-hidden />
          {t('admin.eventEditor.liveHint')}
        </p>
      ) : null}

      <EventLandingCompositionPreview event={composeEvent} t={t} />

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

const EVENT_EDITOR_FORM_ID = 'admin-event-editor-form'
const WORKSPACE_SAVE_SLOT_ID = 'admin-event-workspace-save'

/** En desktop el dock de Guardar vive al pie del rail, no encima del form. */
function useWorkspaceSaveHost(enabled) {
  const [host, setHost] = useState(null)

  useLayoutEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      setHost(null)
      return undefined
    }

    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 720px)') : null
    const sync = () => {
      const desktop = media ? media.matches : true
      setHost(desktop ? document.getElementById(WORKSPACE_SAVE_SLOT_ID) : null)
    }
    sync()
    media?.addEventListener('change', sync)
    return () => media?.removeEventListener('change', sync)
  }, [enabled])

  return host
}

export default function AdminEventEditor({
  canEdit,
  /** Otros eventos, para "Copiar de otro evento" en la landing. */
  landingSourceEvents = [],
  // Cuenta por evento (organizador): ver EventSalesSection / EventVisibilitySection.
  eventScoped = false,
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
  forcedChapter = null,
  initialFocus = 'details',
  onCancel,
  onChange,
  /** La consola registra Escape/backdrop para pedir el mismo cierre con dirty-check. */
  onRegisterClose = null,
  /**
   * Acordeón: si la validación falla en otra sección (Datos / Ventas /
   * Publicación), el padre abre ese fold para que el error sea visible.
   */
  onRequestSection = null,
  onSubmit,
  /**
   * Cambios de estado del meet que persisten por PATCH, no por el upsert
   * del formulario. Habilitan “Guardar cambios” aunque el draft esté limpio.
   */
  extraDirty = false,
  onExtraSave = null,
  onExtraDiscard = null,
  /** "Seguir editando" en la confirmación de descarte: el destino pendiente se cancela. */
  onKeepEditing = null,
  onSaved = null,
  /**
   * Precio de inscripción programado: mismo contrato que Tarifas. No viaja
   * en el upsert del evento — pisar `price` cancela la programación.
   */
  onSetEventRegistrationPrice = null,
  onClearEventPriceSchedule = null,
  sourceEvent = null,
}) {
  const { locale, t } = useI18n()
  const workspaceSaveHost = useWorkspaceSaveHost(embedded && accordion)
  const saveFormId = workspaceSaveHost ? EVENT_EDITOR_FORM_ID : undefined
  // En el acordeón de la consola se recortan barra de tabs, live y alta inline
  // de perfil MP. El catálogo de entradas (ventanas, tipos, precios) sí viaja
  // acá: es el único lugar para configurar la venta de un evento ya creado.
  const essentials = accordion
  const platformChannels = usePlatformPaymentChannels()
  const [syncError, setSyncError] = useState(null)
  // Dónde está el problema de un guardado rechazado (campo que marcó el
  // servidor) y qué sí alcanzó a guardarse antes de fallar.
  const [syncErrorField, setSyncErrorField] = useState(null)
  const [syncExtraSaved, setSyncExtraSaved] = useState(false)
  // Avisos de un guardado que salió bien pero quedó incompleto.
  const [saveWarnings, setSaveWarnings] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [activeTab, setActiveTab] = useState('basics')
  const [salesChapter, setSalesChapter] = useState('cupo')
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedVisibilityContent(draft))
  const [bankProfiles, setBankProfiles] = useState([])
  const [bankProfilesLoading, setBankProfilesLoading] = useState(false)
  const [mpProfiles, setMpProfiles] = useState([])
  const [mpProfilesLoading, setMpProfilesLoading] = useState(false)
  const [mpSecretsKeyConfigured, setMpSecretsKeyConfigured] = useState(true)
  const [mpOAuthAvailable, setMpOAuthAvailable] = useState(false)
  const [mpCreateOpen, setMpCreateOpen] = useState(false)
  const [mpCreating, setMpCreating] = useState(false)
  const [mpCreateError, setMpCreateError] = useState(null)
  const [heroUploading, setHeroUploading] = useState(false)
  const [heroPreviewUrl, setHeroPreviewUrl] = useState(null)
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
  const hasUnsavedChanges = dirty || extraDirty
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
        setMpOAuthAvailable(mp.mercadoPagoOAuth?.available === true)
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

  // La vinculación vuelve por otra ventana, después de un rato: se patchea
  // sobre el borrador vigente en ese momento, no sobre el del click.
  const latestDraftRef = useRef(draft)
  latestDraftRef.current = draft

  /** Cuenta recién vinculada (o reconectada) con Mercado Pago: queda elegida. */
  async function handleMpProfileConnected({ profileId }) {
    if (!profileId) return
    try {
      const mp = await fetchPaymentProfiles({ kind: 'mercado_pago' })
      setMpProfiles(mp.profiles)
    } catch {
      // La lista vieja sigue sirviendo; el id igual queda elegido.
    }
    patchDraft({ ...latestDraftRef.current, mercadoPagoProfileId: profileId })
    setMpCreateOpen(false)
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

  const salesChaptersWithErrors = useMemo(() => {
    const set = new Set()
    for (const key of Object.keys(fieldErrors)) {
      if (resolveTabForField(key) === 'sales') {
        set.add(resolveSalesChapterForField(key))
      }
    }
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
  const publishChecks = useMemo(
    () => resolveEventPublishChecks(draft, platformChannels.platform, { mpProfiles }),
    [draft, platformChannels.platform, mpProfiles],
  )

  useEffect(() => {
    function handleKeyDown(event) {
      // Embebido en el workspace el editor es parte de una página, no un
      // diálogo: Escape no lo cierra (ni lo saca de la pestaña). Así tampoco
      // le roba el Escape a los diálogos que se abren encima, como la vista previa.
      if (event.key === 'Escape' && !embedded) {
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
      // Embebido, el foco no debe arrastrar el scroll: la ficha abre desde arriba
      // y el estado del evento, que va antes del formulario, tiene que verse.
      preferredTarget?.focus?.({ preventScroll: embedded })
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
    if (!hasUnsavedChanges) return undefined

    function preventAccidentalExit(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', preventAccidentalExit)
    return () => window.removeEventListener('beforeunload', preventAccidentalExit)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (forcedTab === 'basics' || forcedTab === 'sales' || forcedTab === 'visibility') {
      setActiveTab(forcedTab)
      if (
        forcedTab === 'sales' &&
        ['cupo', 'prices', 'tickets', 'payment'].includes(forcedChapter)
      ) {
        setSalesChapter(forcedChapter)
      }
      formBodyRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
      return undefined
    }
    if (initialFocus === 'tickets' || initialFocus === 'sales') {
      setActiveTab('sales')
      if (initialFocus === 'tickets') setSalesChapter('tickets')
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
  }, [forcedChapter, forcedTab, initialFocus])

  async function handleHeroUpload(file) {
    const slug = draft.slug || sourceEvent?.slug
    if (!slug || !file) return
    setHeroUploading(true)
    try {
      const uploaded = await uploadEventHeroRequest(slug, file)
      const landing = normalizeEventLanding(draft.landing, {
        publicCopy: draft.publicCopy,
        slug,
      })
      patchDraft({
        ...draft,
        heroImageUrl: uploaded.url,
        landing: {
          ...landing,
          slots: { ...landing.slots, heroImagePath: uploaded.path },
        },
      })
      setHeroPreviewUrl(uploaded.url)
    } catch (error) {
      setSyncError(error?.message ?? t('admin.eventEditor.landingHeroUploadFailed'))
    } finally {
      setHeroUploading(false)
    }
  }

  /** Sube una imagen para un bloque propio de la landing; el bloque guarda la ruta. */
  async function handleBlockImageUpload(file) {
    const slug = draft.slug || sourceEvent?.slug
    if (!slug || !file) return null
    setHeroUploading(true)
    try {
      return await uploadEventHeroRequest(slug, file)
    } catch (error) {
      setSyncError(error?.message ?? t('admin.eventEditor.landingHeroUploadFailed'))
      return null
    } finally {
      setHeroUploading(false)
    }
  }

  function patchDraft(next) {
    onChange(next)
    setConfirmDiscard(false)
    if (Object.keys(fieldErrors).length) setFieldErrors({})
    if (syncError) setSyncError(null)
    if (saveWarnings.length) setSaveWarnings([])
  }

  /** Lleva a la pestaña y al capítulo donde vive un campo. */
  function navigateToField(key) {
    if (!key) return
    setSalesChapter(resolveSalesChapterForField(key))
    const targetTab = resolveTabForField(key)
    if (accordion) {
      if (forcedTab && targetTab !== forcedTab) onRequestSection?.(targetTab)
      else setActiveTab(targetTab)
    } else {
      setActiveTab(targetTab)
    }
    requestAnimationFrame(() => requestAnimationFrame(() => focusFirstInvalid(key)))
  }

  function requestClose() {
    if (syncing) return
    if (hasUnsavedChanges) {
      setConfirmDiscard(true)
      // El dock de confirmación reemplaza las acciones: hay que traerlo a la vista.
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector('.admin-event-form__actions')
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
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

  /**
   * «Ir a …» del checklist: lo de la portada vive en el bloque avanzado de
   * Publicación; cupo y ventana, en el capítulo Cupo de Ventas.
   */
  function handleReadinessGoTo(target, key) {
    if (target === 'visibility') setAdvancedOpen(true)
    if (target === 'sales') {
      setSalesChapter(
        resolveSalesChapterForField(key === 'registrationWindow' ? 'registrationOpensAt' : 'slots'),
      )
    }
    if (accordion && target !== forcedTab) {
      onRequestSection?.(target)
      return
    }
    handleTabChange(target)
  }

  function handleSalesChapterChange(nextChapter) {
    if (nextChapter === salesChapter) return
    setSalesChapter(nextChapter)
    formBodyRef.current?.scrollTo?.({ top: 0, behavior: 'auto' })
  }

  function revealFieldChapter(firstKey) {
    if (resolveTabForField(firstKey) !== 'sales') return
    setSalesChapter(resolveSalesChapterForField(firstKey))
  }

  function focusFirstInvalid(firstKey) {
    if (!firstKey || !formRef.current) return
    revealFieldChapter(firstKey)
    requestAnimationFrame(() => {
      if (!formRef.current) return
      const byName = formRef.current.querySelector(`[name="${firstKey}"]`)
      const byData = formRef.current.querySelector(`[data-field="${firstKey}"]`)
      const target = byName ?? byData ?? formRef.current.querySelector('[aria-invalid="true"]')
      target?.focus?.()
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    })
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    setSyncError(null)
    setSyncErrorField(null)
    setSyncExtraSaved(false)
    setSaveWarnings([])

    const registered = sourceEvent?.registered ?? 0
    if (dirty && draft.id && Number(draft.slots) < registered) {
      setFieldErrors({
        slots: t('admin.eventEditor.validation.slotsBelowRegistered', { count: registered }),
      })
      setSalesChapter('cupo')
      if (accordion && forcedTab !== 'sales') {
        onRequestSection?.('sales')
      } else {
        setActiveTab('sales')
      }
      requestAnimationFrame(() => requestAnimationFrame(() => focusFirstInvalid('slots')))
      return
    }

    const validation = dirty ? validateAdminEventDraft(draft, t) : { ok: true, fieldErrors: {} }
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      if (Object.keys(validation.fieldErrors).some(isAdvancedVisibilityField)) setAdvancedOpen(true)
      setSalesChapter(resolveSalesChapterForField(validation.firstKey))
      const targetTab = resolveTabForField(validation.firstKey)
      const firstMessage =
        (validation.firstKey && validation.fieldErrors[validation.firstKey]) ||
        t('admin.eventEditor.saveError')

      // En acordeón `forcedTab` pisa cualquier setActiveTab: si el error vive
      // en otra sección, pedimos al padre abrirla. Si el campo no está en el
      // fold essentials (p. ej. tipos de entrada), al menos el alert se ve.
      if (accordion) {
        setSyncError(firstMessage)
        if (forcedTab && targetTab !== forcedTab) {
          onRequestSection?.(targetTab)
        }
        requestAnimationFrame(() => {
          formRef.current
            ?.querySelector('.admin-event-form__alert, [aria-invalid="true"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          focusFirstInvalid(validation.firstKey)
        })
        return
      }

      setActiveTab(targetTab)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => focusFirstInvalid(validation.firstKey)),
      )
      return
    }

    setFieldErrors({})
    setConfirmDiscard(false)
    setSyncing(true)
    let extraSaved = false
    try {
      let payload = draft
      if (extraDirty) {
        const synced = await onExtraSave?.()
        extraSaved = true
        if (synced && typeof synced === 'object') {
          payload = { ...draft, ...synced }
          onChange(payload)
        }
      }
      let warnings = []
      if (dirty) {
        const result = await onSubmit?.(payload)
        if (result?.error) throw new Error(result.error)
        warnings = Array.isArray(result?.warnings) ? result.warnings : []
      }
      // El padre suele cerrar el fold al guardar; si no, reseteamos baseline
      // para que el dock vuelva a "Al día" sin remount.
      initialDraftSignatureRef.current = draftSignature(payload)
      setSaveWarnings(warnings)
      onSaved?.()
    } catch (error) {
      // El servidor marca el campo que falta: el mensaje lleva ahí en un clic
      // en vez de dejar al operador buscándolo entre cinco pestañas.
      const fields = error?.body?.fields
      setSyncErrorField(
        fields && typeof fields === 'object' ? (Object.keys(fields)[0] ?? null) : null,
      )
      // El estado y el acceso van por un guardado aparte, antes del evento: si
      // el segundo falla, el primero ya quedó. Decirlo evita reintentar a ciegas.
      setSyncExtraSaved(extraSaved)
      // El servidor ya dice qué pasó (título repetido, día con inscriptos,
      // versión desactualizada): pisarlo con un único texto de "otra persona
      // modificó" escondía el motivo real de casi todos los 409.
      const serverMessage = String(error?.message ?? '').trim()
      setSyncError(
        error?.status === 409
          ? serverMessage || t('admin.eventEditor.conflictError')
          : serverMessage || t('admin.eventEditor.saveError'),
      )
      return
    } finally {
      setSyncing(false)
    }
  }

  const err = (key) => fieldErrors[key]
  const ticketSalesEnabled = draft.pricing?.ticketsEnabled === true
  // Al crear no hay jornadas ni tipos de entrada que vender todavía (se cargan
  // en la consola, ver AdminEventQuickCreate): el capítulo aparece recién al
  // existir el evento, o antes si el draft ya trae la venta prendida o un error.
  const showTicketsChapter =
    Boolean(draft.id) || ticketSalesEnabled || salesChaptersWithErrors.has('tickets')
  const registeredCount = sourceEvent?.registered ?? 0
  const slotsTotal = Math.max(0, Number(draft.slots) || 0)
  const slotsRemaining = Math.max(slotsTotal - registeredCount, 0)
  // Cada capítulo lleva su dato al lado del nombre. Cuatro pestañas mudas
  // obligaban a entrar en las cuatro para saber cuánto cupo hay, a qué precio
  // se inscribe, cuántas entradas existen y con qué se cobran.
  const ticketTypeCount = (draft.ticketTypes ?? []).length
  const ticketChannelCount = effectiveEventChannelsFor(
    draft.paymentChannelOverrides,
    'ticket',
    platformCellsFor(platformChannels.platform, 'ticket'),
  ).length
  const fillPercent = slotsTotal > 0 ? Math.round((registeredCount / slotsTotal) * 100) : 0
  const publicCapacity = describePublicCapacity({
    progressPublic: draft.capacityProgressPublic !== false,
    totalPublic: draft.capacityTotalPublic !== false,
    registered: registeredCount,
    slots: slotsTotal,
    remaining: slotsRemaining,
  })
  const publicCapacityPreview =
    publicCapacity.mode === 'hidden'
      ? t('admin.eventEditor.capacityPublicPreviewHidden')
      : publicCapacity.showTotal
        ? t('admin.eventEditor.capacityPublicPreviewFull', {
            registered: publicCapacity.registered,
            total: publicCapacity.slots,
            remaining: publicCapacity.remaining,
          })
        : t('admin.eventEditor.capacityPublicPreviewNoTotal', {
            registered: publicCapacity.registered,
            remaining: publicCapacity.remaining,
          })
  const activeTabHasError = tabsWithErrors.has(activeTab)
  // Con el borrador sucio se dice *dónde* están los cambios: "sin guardar" a
  // secas no deja saber si lo pendiente es el título, un precio o el cobro.
  const changedAreas = useMemo(
    () => (dirty ? describeDraftChanges(draft, initialDraftSignatureRef.current) : []),
    [dirty, draft],
  )
  const changedAreasLabel = changedAreas
    .map((area) => t(`admin.eventEditor.changeAreas.${area}`))
    .join(', ')
  const saveStateLabel = syncing
    ? t('admin.eventEditor.saving')
    : hasUnsavedChanges
      ? changedAreasLabel
        ? t('admin.eventEditor.unsavedChangesIn', { areas: changedAreasLabel })
        : t('admin.eventEditor.unsavedChanges')
      : t('admin.eventEditor.noPendingChanges')
  const saveStateShortLabel = syncing
    ? t('admin.eventEditor.savingShort')
    : hasUnsavedChanges
      ? t('admin.eventEditor.unsavedShort')
      : t('admin.eventEditor.readyShort')
  const saveStateModifier = syncing ? 'is-syncing' : hasUnsavedChanges ? 'is-dirty' : 'is-ready'

  const editorTree = (
    <div
      ref={embedded ? panelRef : undefined}
      className={`admin-event-editor${draft.id ? ' admin-event-editor--editing' : ' admin-event-editor--creating'}${
        embedded ? ' admin-event-editor--embedded' : ''
      }${accordion ? ' admin-event-editor--accordion' : ''}${essentials ? ' admin-event-editor--essentials' : ''}`}
    >
      <form
        ref={formRef}
        id={EVENT_EDITOR_FORM_ID}
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

        {/* Tabs + estado de guardado. En acordeón la sección la elige la
            consola; el save-state vive en el dock de acciones (sin toolbar huérfana). */}
        {accordion ? null : (
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
                <span
                  className="admin-event-form__save-label admin-event-form__save-label--short"
                  aria-hidden
                >
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
            <EventBasicsSection
              activePanelRef={activePanelRef}
              t={t}
              essentials={essentials}
              err={err}
              draft={draft}
              patchDraft={patchDraft}
              canEdit={canEdit}
            />
          )}

          {activeTab === 'sales' && (
            <EventSalesSection
              eventScoped={eventScoped}
              activePanelRef={activePanelRef}
              t={t}
              essentials={essentials}
              slotsTotal={slotsTotal}
              draft={draft}
              locale={locale}
              ticketSalesEnabled={ticketSalesEnabled}
              ticketTypeCount={ticketTypeCount}
              ticketChannelCount={ticketChannelCount}
              showTicketsChapter={showTicketsChapter}
              salesChapter={salesChapter}
              salesChaptersWithErrors={salesChaptersWithErrors}
              handleSalesChapterChange={handleSalesChapterChange}
              registeredCount={registeredCount}
              fillPercent={fillPercent}
              slotsRemaining={slotsRemaining}
              err={err}
              patchDraft={patchDraft}
              canEdit={canEdit}
              publicCapacityPreview={publicCapacityPreview}
              onSetEventRegistrationPrice={onSetEventRegistrationPrice}
              sourceEvent={sourceEvent}
              onClearEventPriceSchedule={onClearEventPriceSchedule}
              platformChannels={platformChannels}
              mpSecretsKeyConfigured={mpSecretsKeyConfigured}
              applyMpProfile={applyMpProfile}
              mpProfilesLoading={mpProfilesLoading}
              mpProfiles={mpProfiles}
              selectedMpProfile={selectedMpProfile}
              setMpCreateOpen={setMpCreateOpen}
              mpCreateOpen={mpCreateOpen}
              mpDraft={mpDraft}
              setMpDraft={setMpDraft}
              mpCreateError={mpCreateError}
              mpCreating={mpCreating}
              handleCreateMpProfile={handleCreateMpProfile}
              applyBankProfile={applyBankProfile}
              bankProfilesLoading={bankProfilesLoading}
              bankProfiles={bankProfiles}
              selectedBankProfile={selectedBankProfile}
              fieldErrors={fieldErrors}
              accordion={accordion}
              onRequestSection={onRequestSection}
              mpOAuthAvailable={mpOAuthAvailable}
              onMpProfileConnected={handleMpProfileConnected}
            />
          )}

          {activeTab === 'visibility' && (
            <EventVisibilitySection
              eventScoped={eventScoped}
              activePanelRef={activePanelRef}
              t={t}
              essentials={essentials}
              canEdit={canEdit}
              draft={draft}
              patchDraft={patchDraft}
              consistencyWarnings={consistencyWarnings}
              publishChecks={publishChecks}
              accessOptions={accessOptions}
              advancedOpen={advancedOpen}
              setAdvancedOpen={setAdvancedOpen}
              err={err}
              sourceEvent={sourceEvent}
              publicCapacityPreview={publicCapacityPreview}
              heroPreviewUrl={heroPreviewUrl || draft.heroImageUrl || sourceEvent?.heroImageUrl}
              heroUploading={heroUploading}
              onHeroUpload={handleHeroUpload}
              onImageUpload={handleBlockImageUpload}
              platform={platformChannels.platform}
              mpProfiles={mpProfiles}
              onGoTo={handleReadinessGoTo}
              landingSourceEvents={landingSourceEvents}
              studioSave={{
                // El editor visual guarda con el mismo formulario (y las mismas
                // validaciones) que el botón Guardar del evento.
                onSave: () => formRef.current?.requestSubmit(),
                dirty: hasUnsavedChanges,
                syncing,
                error: syncError,
              }}
            />
          )}
        </div>

        {syncError ? (
          <div className="admin-event-form__alert admin-event-form__alert--danger" role="alert">
            <p>{t('admin.eventEditor.supabase.syncError', { message: syncError })}</p>
            {syncExtraSaved ? <p>{t('admin.eventEditor.savePartial')}</p> : null}
            {syncErrorField ? (
              <button
                type="button"
                className="button button--ghost admin-event-form__alert-action"
                onClick={() => navigateToField(syncErrorField)}
              >
                {t('admin.eventEditor.goToArea', {
                  area: t(`admin.eventEditor.changeAreas.${areaOfDraftField(syncErrorField)}`),
                })}
              </button>
            ) : null}
          </div>
        ) : null}

        {saveWarnings.length > 0 ? (
          <div className="admin-event-form__notice" role="status">
            <p>{t('admin.eventEditor.saveWarningTitle')}</p>
            <ul>
              {saveWarnings.map((warning) => (
                <li key={warning.code}>
                  {warning.message}{' '}
                  {warning.field ? (
                    <button
                      type="button"
                      className="button button--ghost admin-event-form__alert-action"
                      onClick={() => navigateToField(warning.field)}
                    >
                      {t('admin.eventEditor.goToArea', {
                        area: t(`admin.eventEditor.changeAreas.${areaOfDraftField(warning.field)}`),
                      })}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {(() => {
          const dock = confirmDiscard ? (
            <div
              className="admin-event-form__actions admin-event-form__actions--discard"
              role="alert"
            >
              <div className="admin-event-form__discard-copy">
                <strong>{t('admin.eventEditor.discardTitle')}</strong>
                <p>{t('admin.eventEditor.discardLead')}</p>
              </div>
              <div className="admin-event-form__action-buttons">
                <Button
                  type="button"
                  variant="outline"
                  className="btn--small"
                  onClick={() => {
                    setConfirmDiscard(false)
                    onKeepEditing?.()
                  }}
                >
                  {t('admin.eventEditor.keepEditing')}
                </Button>
                <Button
                  type="submit"
                  form={saveFormId}
                  variant="gold"
                  className="btn--small"
                  disabled={!canEdit || syncing}
                >
                  <Save size={14} aria-hidden />
                  {syncing ? t('admin.eventEditor.saving') : t('admin.eventEditor.saveChanges')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="btn--small"
                  disabled={syncing}
                  onClick={() => {
                    onExtraDiscard?.()
                    onCancel()
                  }}
                >
                  {t('admin.eventEditor.discard')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="admin-event-form__actions">
              {accordion ? (
                <div
                  className={`admin-event-form__save-state admin-event-form__save-state--actions ${saveStateModifier}`}
                  aria-live="polite"
                  aria-label={saveStateLabel}
                  title={t('admin.eventEditor.backendHint')}
                >
                  <span className={saveStateModifier} aria-hidden />
                  <strong>
                    <span className="admin-event-form__save-label admin-event-form__save-label--full">
                      {saveStateLabel}
                    </span>
                    <span
                      className="admin-event-form__save-label admin-event-form__save-label--short"
                      aria-hidden
                    >
                      {saveStateShortLabel}
                    </span>
                  </strong>
                </div>
              ) : null}
              <div className="admin-event-form__action-buttons">
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestClose}
                  disabled={syncing}
                  aria-label={accordion ? t('admin.eventConsole.closeSection') : t('common.cancel')}
                >
                  <span className="admin-event-form__action-label admin-event-form__action-label--full">
                    {accordion ? t('admin.eventConsole.closeSection') : t('common.cancel')}
                  </span>
                  <span
                    className="admin-event-form__action-label admin-event-form__action-label--short"
                    aria-hidden
                  >
                    {accordion ? t('admin.eventConsole.closeSectionShort') : t('common.cancel')}
                  </span>
                </Button>
                <Button
                  type="submit"
                  form={saveFormId}
                  variant="gold"
                  disabled={!canEdit || syncing || (Boolean(draft.id) && !hasUnsavedChanges)}
                  aria-label={
                    syncing
                      ? t('admin.eventEditor.saving')
                      : draft.id
                        ? t('admin.eventEditor.saveChanges')
                        : draft.published
                          ? t('admin.eventEditor.createAndPublish')
                          : t('admin.eventEditor.createDraft')
                  }
                >
                  <Save size={14} aria-hidden />
                  <span className="admin-event-form__action-label admin-event-form__action-label--full">
                    {syncing
                      ? t('admin.eventEditor.saving')
                      : draft.id
                        ? t('admin.eventEditor.saveChanges')
                        : draft.published
                          ? t('admin.eventEditor.createAndPublish')
                          : t('admin.eventEditor.createDraft')}
                  </span>
                  <span
                    className="admin-event-form__action-label admin-event-form__action-label--short"
                    aria-hidden
                  >
                    {syncing
                      ? t('admin.eventEditor.savingShort')
                      : draft.id
                        ? t('admin.eventEditor.saveChangesShort')
                        : t('admin.eventEditor.createDraft')}
                  </span>
                </Button>
              </div>
            </div>
          )
          return workspaceSaveHost ? createPortal(dock, workspaceSaveHost) : dock
        })()}
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
