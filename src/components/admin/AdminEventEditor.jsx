import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Eye,
  Link2,
  MapPin,
  Radio,
  Save,
  ShieldCheck,
  Star,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import AdminEventSessionsEditor from './AdminEventSessionsEditor.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import DetailTabs from './DetailTabs.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import CapacityBar from '../ui/CapacityBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  EVENT_QUICK_STATUS_VALUES,
  getEventConsistencyWarnings,
  mapDraftToPreviewEvent,
  withEventStart,
} from '../../services/eventAdminService.js'
import { DEFAULT_EVENT_PRICING } from '../../lib/eventPricing.js'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import AdminTicketAddonsEditor from './AdminTicketAddonsEditor.jsx'
import AdminTicketTypesEditor from './AdminTicketTypesEditor.jsx'
import AdminEventSecuritySection from './AdminEventSecuritySection.jsx'

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

function AdminEventLivePreview({ draft, embedded = false, live = false, sourceEvent }) {
  const { t } = useI18n()
  const previewEvent = useMemo(
    () => mapDraftToPreviewEvent(draft, sourceEvent),
    [draft, sourceEvent],
  )

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
    </div>
  )
}

export default function AdminEventEditor({
  canEdit,
  canManageUsers,
  draft,
  initialFocus = 'details',
  onCancel,
  onChange,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onSubmit,
  onUpdateSecurityUserStatus,
  sourceEvent = null,
}) {
  const { t } = useI18n()
  const [syncError, setSyncError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [activeTab, setActiveTab] = useState('basics')
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
  const initialDraftSignatureRef = useRef(draftSignature(draft))
  const dirty = draftSignature(draft) !== initialDraftSignatureRef.current
  onCancelRef.current = onCancel

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

  const tabsWithErrors = useMemo(() => {
    const set = new Set()
    for (const key of Object.keys(fieldErrors)) set.add(resolveTabForField(key))
    return set
  }, [fieldErrors])

  const tabs = useMemo(
    () =>
      [
        { id: 'basics', label: t('admin.eventEditor.navBasics') },
        { id: 'sales', label: t('admin.eventEditor.navSales') },
        { id: 'visibility', label: t('admin.eventEditor.navVisibility') },
        // Las tandas cuelgan de los días del evento, que recién existen una vez
        // que está guardado -- igual que la pestaña de seguridad.
        draft.id ? { id: 'grid', label: t('admin.eventEditor.navGrid') } : null,
        draft.id ? { id: 'security', label: t('admin.eventEditor.navSecurity') } : null,
      ]
        .filter(Boolean)
        .map((tab) => ({ ...tab, hasError: tabsWithErrors.has(tab.id) })),
    [draft.id, t, tabsWithErrors],
  )

  const consistencyWarnings = useMemo(
    () => getEventConsistencyWarnings(draft, sourceEvent),
    [draft, sourceEvent],
  )

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestCloseRef.current?.()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return
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
    document.body.style.overflow = 'hidden'
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
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [draft.id, initialFocus])

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
    if (initialFocus !== 'security' || !draft.id) return
    setActiveTab('security')
  }, [draft.id, initialFocus])

  useEffect(() => {
    if (initialFocus !== 'tickets') return
    setActiveTab('sales')
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector('#event-section-tickets')
        ?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [initialFocus])

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
  const ticketSalesEnabled = draft.pricing?.ticketsEnabled !== false
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
  const activeTabHasError = tabsWithErrors.has(activeTab)
  const saveStateLabel = syncing
    ? t('admin.eventEditor.saving')
    : dirty
      ? t('admin.eventEditor.unsavedChanges')
      : t('admin.eventEditor.noPendingChanges')
  const saveStateModifier = syncing ? 'is-syncing' : dirty ? 'is-dirty' : 'is-ready'

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
        <div
          className={`admin-event-editor${draft.id ? ' admin-event-editor--editing' : ' admin-event-editor--creating'}`}
        >
          <form
            ref={formRef}
            className="admin-event-form admin-event-form--editor"
            onSubmit={handleFormSubmit}
            noValidate
          >
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

            {/* Barra fija: tabs + estado de guardado, visibles siempre sin
                importar el scroll ni el tab activo (antes el indicador vivía
                solo al pie del formulario, después de cuatro secciones). */}
            <div className="admin-event-editor__toolbar">
              <DetailTabs
                tabs={tabs}
                activeTab={activeTab}
                onChange={handleTabChange}
                variant="editorial"
              />
              <div
                className={`admin-event-form__save-state admin-event-form__save-state--toolbar ${saveStateModifier}`}
                aria-live="polite"
                title={t('admin.eventEditor.backendHint')}
              >
                <span className={saveStateModifier} aria-hidden />
                <strong>{saveStateLabel}</strong>
              </div>
            </div>

            <div ref={formBodyRef} className="admin-event-form__body">
              <details className="admin-event-form__mobile-preview">
                <summary>
                  <Eye size={14} aria-hidden />
                  {t('admin.eventEditor.openPreview')}
                </summary>
                <AdminEventLivePreview embedded draft={draft} sourceEvent={sourceEvent} />
              </details>

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
                    <p>{t('admin.eventEditor.sectionBasicsLead')}</p>
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

                    <FormField
                      htmlFor="event-starts-at"
                      label={t('admin.eventEditor.supabase.startsAt')}
                      error={err('startsAt')}
                    >
                      <input
                        id="event-starts-at"
                        name="startsAt"
                        data-field="startsAt"
                        required
                        type="datetime-local"
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
                      <input
                        id="event-ends-at"
                        name="endsAt"
                        data-field="endsAt"
                        required
                        type="datetime-local"
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
                  className="admin-event-form__section"
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navSales')}
                  tabIndex={-1}
                >
                  <header className="admin-event-form__section-head">
                    <h4>{t('admin.eventEditor.sectionSales')}</h4>
                    <p>{t('admin.eventEditor.sectionSalesLead')}</p>
                  </header>

                  <div className="admin-event-form__lane">
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

                      <div className="admin-event-form__occupancy">
                        <CapacityBar
                          compact
                          current={registeredCount}
                          total={slotsTotal}
                          label={t('admin.eventEditor.slotsShortLabel')}
                        />
                        <small>
                          {t('admin.eventEditor.slotsRemaining', { count: slotsRemaining })}
                        </small>
                      </div>

                      <FormField
                        htmlFor="event-reg-opens"
                        label={t('admin.eventEditor.supabase.registrationOpensAt')}
                        error={err('registrationOpensAt')}
                      >
                        <input
                          id="event-reg-opens"
                          name="registrationOpensAt"
                          data-field="registrationOpensAt"
                          type="datetime-local"
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
                        <input
                          id="event-reg-closes"
                          name="registrationClosesAt"
                          data-field="registrationClosesAt"
                          type="datetime-local"
                          value={draft.registrationClosesAt ?? ''}
                          aria-invalid={Boolean(err('registrationClosesAt'))}
                          onChange={(event) =>
                            patchDraft({ ...draft, registrationClosesAt: event.target.value })
                          }
                          disabled={!canEdit}
                        />
                      </FormField>
                    </div>

                    <div className="admin-event-form__rate-cards">
                      <label
                        className={`admin-event-form__rate-card${err('pricing.membership') ? ' is-invalid' : ''}`}
                      >
                        <span className="admin-event-form__rate-card-label">
                          {t('admin.eventEditor.priceMembership')}
                        </span>
                        <span className="admin-event-form__rate-card-input">
                          <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                          <input
                            name="pricing.membership"
                            data-field="pricing.membership"
                            min={0}
                            required
                            type="number"
                            value={draft.pricing?.membership ?? DEFAULT_EVENT_PRICING.membership}
                            aria-invalid={Boolean(err('pricing.membership'))}
                            onChange={(event) =>
                              patchDraft(
                                updatePricingField(draft, 'membership', event.target.value),
                              )
                            }
                            disabled={!canEdit}
                          />
                        </span>
                        {err('pricing.membership') ? (
                          <span className="admin-event-form__error" role="alert">
                            {err('pricing.membership')}
                          </span>
                        ) : null}
                      </label>
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
                            min={0}
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
                      <label
                        className={`admin-event-form__rate-card admin-event-form__rate-card--featured${err('pricing.combo') ? ' is-invalid' : ''}`}
                      >
                        <span className="admin-event-form__rate-card-label">
                          {t('admin.eventEditor.priceCombo')}
                        </span>
                        <span className="admin-event-form__rate-card-input">
                          <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                          <input
                            name="pricing.combo"
                            data-field="pricing.combo"
                            min={0}
                            required
                            type="number"
                            value={draft.pricing?.combo ?? DEFAULT_EVENT_PRICING.combo}
                            aria-invalid={Boolean(err('pricing.combo'))}
                            onChange={(event) =>
                              patchDraft(updatePricingField(draft, 'combo', event.target.value))
                            }
                            disabled={!canEdit}
                          />
                        </span>
                        {err('pricing.combo') ? (
                          <span className="admin-event-form__error" role="alert">
                            {err('pricing.combo')}
                          </span>
                        ) : null}
                      </label>
                    </div>
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
                            <input
                              id="event-ticket-opens"
                              name="ticketSalesOpensAt"
                              data-field="ticketSalesOpensAt"
                              type="datetime-local"
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
                            <input
                              id="event-ticket-closes"
                              name="ticketSalesClosesAt"
                              data-field="ticketSalesClosesAt"
                              type="datetime-local"
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
                  </header>

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

                  <label className="admin-event-form__toggle">
                    <input
                      checked={draft.requiresMembership !== false}
                      className="admin-event-form__toggle-input"
                      type="checkbox"
                      onChange={(event) =>
                        patchDraft({ ...draft, requiresMembership: event.target.checked })
                      }
                      disabled={!canEdit}
                    />
                    <span className="admin-event-form__toggle-ui" aria-hidden />
                    <span className="admin-event-form__toggle-copy">
                      <strong>
                        <ShieldCheck size={13} aria-hidden />
                        {t('admin.eventEditor.requiresMembershipTitle')}
                      </strong>
                      <small>{t('admin.eventEditor.requiresMembershipHint')}</small>
                    </span>
                  </label>

                  {/* Antes vivía detrás de un <details> ("Avanzado"): con tabs
                    reales esta pantalla ya está acotada a Publicación, así
                    que la transmisión queda siempre a la vista. */}
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
                </section>
              )}

              {activeTab === 'grid' && draft.id && (
                <section
                  ref={activePanelRef}
                  className="admin-event-form__section"
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navGrid')}
                  tabIndex={-1}
                >
                  <AdminEventSessionsEditor canEdit={canEdit} eventSlug={sourceEvent?.slug} />
                </section>
              )}

              {activeTab === 'security' && draft.id && (
                <div
                  ref={activePanelRef}
                  role="tabpanel"
                  aria-label={t('admin.eventEditor.navSecurity')}
                  tabIndex={-1}
                >
                  <AdminEventSecuritySection
                    canManageUsers={canManageUsers}
                    eventId={draft.id}
                    eventSlug={sourceEvent?.slug}
                    eventEndsAt={draft.endsAt}
                    onCreateSecurityUser={onCreateSecurityUser}
                    onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
                    onCreateSecurityAccessLink={onCreateSecurityAccessLink}
                    onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
                    onListSecurityUsers={onListSecurityUsers}
                    onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
                  />
                </div>
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
                  {t('common.cancel')}
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

          <AdminEventLivePreview draft={draft} live sourceEvent={sourceEvent} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { AdminEventLivePreview }
