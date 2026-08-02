import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
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
  X,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import CapacityBar from '../ui/CapacityBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  mapDraftToPreviewEvent,
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

const EDITOR_SECTION_IDS = [
  'event-section-basics',
  'event-section-pricing',
  'event-section-tickets',
  'event-section-visibility',
  'event-section-security',
]

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
  const [showAdvanced, setShowAdvanced] = useState(Boolean(draft.id))
  const [showTicketConfig, setShowTicketConfig] = useState(
    Boolean(draft.eventDays?.length || draft.ticketTypes?.length),
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [activeSection, setActiveSection] = useState('event-section-basics')
  const dialogTitle = draft.id
    ? t('admin.eventEditor.editTitle')
    : t('admin.eventEditor.createTitle')
  const headingTitle =
    draft.id && draft.title?.trim() ? draft.title.trim() : dialogTitle
  const onCancelRef = useRef(onCancel)
  const requestCloseRef = useRef(null)
  const securitySectionRef = useRef(null)
  const formRef = useRef(null)
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const navLockRef = useRef(false)
  const navLockTimerRef = useRef(0)
  const initialDraftSignatureRef = useRef(draftSignature(draft))
  const dirty = draftSignature(draft) !== initialDraftSignatureRef.current
  onCancelRef.current = onCancel

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(
        ADMIN_EVENT_STATUS_OPTIONS.filter(([value]) => value !== 'all'),
        t,
      ),
    [t],
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
    setActiveSection('event-section-security')
    const frame = requestAnimationFrame(() => {
      securitySectionRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [draft.id, initialFocus])

  useEffect(() => {
    if (initialFocus !== 'tickets') return
    setShowTicketConfig(true)
    setActiveSection('event-section-tickets')
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector('#event-section-tickets')
        ?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [initialFocus])

  useEffect(() => {
    const root = formRef.current
    if (!root) return undefined

    const sectionIds = draft.id
      ? EDITOR_SECTION_IDS
      : EDITOR_SECTION_IDS.filter((id) => id !== 'event-section-security')
    const elements = sectionIds
      .map((id) => root.querySelector(`#${id}`))
      .filter(Boolean)
    if (elements.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (navLockRef.current) return
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const nextId = visible[0]?.target?.id
        if (nextId) setActiveSection(nextId)
      },
      {
        root,
        rootMargin: '-18% 0px -58% 0px',
        threshold: [0, 0.2, 0.45, 0.75],
      },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [draft.id, showAdvanced, showTicketConfig])

  useEffect(
    () => () => {
      window.clearTimeout(navLockTimerRef.current)
    },
    [],
  )

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

  function goToSection(sectionId, { advanced = false, tickets = false } = {}) {
    if (advanced) setShowAdvanced(true)
    if (tickets) setShowTicketConfig(true)
    setActiveSection(sectionId)
    navLockRef.current = true
    window.clearTimeout(navLockTimerRef.current)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector(`#${sectionId}`)
          ?.scrollIntoView({ behavior: 'auto', block: 'start' })
        navLockTimerRef.current = window.setTimeout(() => {
          navLockRef.current = false
        }, 450)
      })
    })
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
      if (
        validation.firstKey?.startsWith('startsAt') ||
        validation.firstKey?.startsWith('endsAt') ||
        validation.firstKey?.startsWith('registration') ||
        validation.firstKey?.startsWith('liveStream')
      ) {
        setShowAdvanced(true)
      }
      if (validation.firstKey?.startsWith('ticketSales')) {
        setShowTicketConfig(true)
      }
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

            <nav
              className="admin-event-form__section-nav"
              aria-label={t('admin.eventEditor.sectionNavAria')}
            >
              <button
                type="button"
                className={
                  activeSection === 'event-section-basics'
                    ? 'admin-event-form__nav-item is-active'
                    : 'admin-event-form__nav-item'
                }
                aria-current={activeSection === 'event-section-basics' ? 'true' : undefined}
                onClick={() => goToSection('event-section-basics')}
              >
                <span aria-hidden>1</span>
                {t('admin.eventEditor.navBasics')}
              </button>
              <button
                type="button"
                className={
                  activeSection === 'event-section-pricing'
                    ? 'admin-event-form__nav-item is-active'
                    : 'admin-event-form__nav-item'
                }
                aria-current={activeSection === 'event-section-pricing' ? 'true' : undefined}
                onClick={() => goToSection('event-section-pricing')}
              >
                <span aria-hidden>2</span>
                {t('admin.eventEditor.navPricing')}
              </button>
              <button
                type="button"
                className={
                  activeSection === 'event-section-tickets'
                    ? 'admin-event-form__nav-item is-active'
                    : 'admin-event-form__nav-item'
                }
                aria-current={activeSection === 'event-section-tickets' ? 'true' : undefined}
                onClick={() => goToSection('event-section-tickets', { tickets: true })}
              >
                <span aria-hidden>3</span>
                {t('admin.eventEditor.navTickets')}
              </button>
              <button
                type="button"
                className={
                  activeSection === 'event-section-visibility'
                    ? 'admin-event-form__nav-item is-active'
                    : 'admin-event-form__nav-item'
                }
                aria-current={activeSection === 'event-section-visibility' ? 'true' : undefined}
                onClick={() => goToSection('event-section-visibility')}
              >
                <span aria-hidden>4</span>
                {t('admin.eventEditor.navVisibility')}
              </button>
              {draft.id ? (
                <button
                  type="button"
                  className={
                    activeSection === 'event-section-security'
                      ? 'admin-event-form__nav-item is-active'
                      : 'admin-event-form__nav-item'
                  }
                  aria-current={activeSection === 'event-section-security' ? 'true' : undefined}
                  onClick={() => goToSection('event-section-security')}
                >
                  <span aria-hidden>5</span>
                  {t('admin.eventEditor.navSecurity')}
                </button>
              ) : null}
            </nav>

            <details className="admin-event-form__mobile-preview">
              <summary>
                <Eye size={14} aria-hidden />
                {t('admin.eventEditor.openPreview')}
              </summary>
              <AdminEventLivePreview embedded draft={draft} sourceEvent={sourceEvent} />
            </details>

            {Object.keys(fieldErrors).length > 0 ? (
              <p className="admin-event-form__alert" role="alert">
                {t('admin.eventEditor.validationSummary')}
              </p>
            ) : null}

            <section className="admin-event-form__section" aria-labelledby="event-section-basics">
              <header className="admin-event-form__section-head">
                <h4 id="event-section-basics">{t('admin.eventEditor.sectionBasics')}</h4>
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
                  htmlFor="event-date"
                  label={t('admin.eventEditor.date')}
                  error={err('dateISO')}
                >
                  <input
                    id="event-date"
                    name="dateISO"
                    data-field="dateISO"
                    required
                    type="date"
                    value={draft.dateISO}
                    aria-invalid={Boolean(err('dateISO'))}
                    onChange={(event) => patchDraft({ ...draft, dateISO: event.target.value })}
                    disabled={!canEdit}
                  />
                </FormField>

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

            <section className="admin-event-form__section" aria-labelledby="event-section-pricing">
              <header className="admin-event-form__section-head">
                <h4 id="event-section-pricing">{t('admin.eventEditor.sectionPricing')}</h4>
                <p>{t('admin.eventEditor.pricingLead')}</p>
              </header>

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
                        patchDraft(updatePricingField(draft, 'membership', event.target.value))
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
                      value={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
                      aria-invalid={Boolean(err('pricing.registration'))}
                      onChange={(event) =>
                        patchDraft(updatePricingField(draft, 'registration', event.target.value))
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
            </section>

            <section
              id="event-section-tickets"
              className="admin-event-form__section admin-event-form__section--tickets"
              aria-labelledby="event-section-tickets-title"
            >
              <header className="admin-event-form__section-head">
                <h4 id="event-section-tickets-title">{t('admin.eventEditor.sectionTickets')}</h4>
                <p>{t('admin.eventEditor.sectionTicketsLead')}</p>
              </header>

              <label className="admin-event-form__toggle">
                <input
                  checked={ticketSalesEnabled}
                  className="admin-event-form__toggle-input"
                  type="checkbox"
                  onChange={(event) =>
                    patchDraft(updatePricingField(draft, 'ticketsEnabled', event.target.checked))
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
                <details
                  className="admin-event-form__ticket-config"
                  open={showTicketConfig}
                  onToggle={(event) => setShowTicketConfig(event.currentTarget.open)}
                >
                  <summary className="admin-event-form__ticket-config-summary">
                    <span>
                      <strong>{t('admin.eventEditor.configureTickets')}</strong>
                      <small>{ticketConfigurationSummary}</small>
                    </span>
                  </summary>

                  <div className="admin-event-form__ticket-config-body">
                    <section className="admin-event-form__block">
                      <header className="admin-event-form__block-head">
                        <h3 className="admin-event-form__block-title">
                          {t('admin.eventEditor.supabase.ticketSalesWindowTitle')}
                        </h3>
                        <p className="admin-event-form__block-lead">
                          {t('admin.eventEditor.supabase.ticketSalesWindowLead')}
                        </p>
                      </header>
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
                    </section>

                    <AdminTicketAddonsEditor
                      addons={draft.pricing?.ticketAddons ?? []}
                      canEdit={canEdit}
                      onChange={(ticketAddons) =>
                        patchDraft(updatePricingField(draft, 'ticketAddons', ticketAddons))
                      }
                    />

                    <AdminTicketTypesEditor
                      addonsCatalog={draft.pricing?.ticketAddons ?? []}
                      canEdit={canEdit}
                      eventDays={draft.eventDays ?? []}
                      onChangeEventDays={(eventDays) => patchDraft({ ...draft, eventDays })}
                      onChangeTicketTypes={(ticketTypes) => patchDraft({ ...draft, ticketTypes })}
                      ticketTypes={draft.ticketTypes ?? []}
                    />
                  </div>
                </details>
              ) : (
                <p className="admin-event-form__section-note">
                  {t('admin.eventEditor.ticketsDisabledNote')}
                </p>
              )}
            </section>

            <section
              className="admin-event-form__section"
              aria-labelledby="event-section-visibility"
            >
              <header className="admin-event-form__section-head">
                <h4 id="event-section-visibility">{t('admin.eventEditor.sectionVisibility')}</h4>
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
                  onChange={(event) => patchDraft({ ...draft, published: event.target.checked })}
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
            </section>

            <details
              id="event-section-advanced"
              className="admin-event-form__advanced"
              open={showAdvanced}
              onToggle={(event) => setShowAdvanced(event.currentTarget.open)}
            >
              <summary className="admin-event-form__advanced-summary">
                <span>
                  <strong>{t('admin.eventEditor.sectionAdvanced')}</strong>
                  <small>{t('admin.eventEditor.sectionAdvancedLead')}</small>
                </span>
              </summary>

              <div className="admin-event-form__advanced-body">
                <fieldset className="admin-event-form__pricing">
                  <legend>{t('admin.eventEditor.supabase.sectionTitle')}</legend>
                  <p className="admin-event-form__pricing-lead">
                    {t('admin.eventEditor.supabase.sectionLead')}
                  </p>

                  <section className="admin-event-form__block">
                    <header className="admin-event-form__block-head">
                      <h3 className="admin-event-form__block-title">
                        {t('admin.eventEditor.supabase.scheduleBlockTitle')}
                      </h3>
                    </header>
                    <div className="admin-event-form__grid">
                      <FormField
                        htmlFor="event-starts-at"
                        label={t('admin.eventEditor.supabase.startsAt')}
                        error={err('startsAt')}
                      >
                        <input
                          id="event-starts-at"
                          name="startsAt"
                          data-field="startsAt"
                          type="datetime-local"
                          value={draft.startsAt ?? ''}
                          aria-invalid={Boolean(err('startsAt'))}
                          onChange={(event) =>
                            patchDraft({ ...draft, startsAt: event.target.value })
                          }
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
                          type="datetime-local"
                          value={draft.endsAt ?? ''}
                          aria-invalid={Boolean(err('endsAt'))}
                          onChange={(event) => patchDraft({ ...draft, endsAt: event.target.value })}
                          disabled={!canEdit}
                        />
                      </FormField>
                    </div>
                  </section>

                  <section className="admin-event-form__block">
                    <header className="admin-event-form__block-head">
                      <h3 className="admin-event-form__block-title">
                        {t('admin.eventEditor.supabase.registrationWindowTitle')}
                      </h3>
                      <p className="admin-event-form__block-lead">
                        {t('admin.eventEditor.supabase.registrationWindowLead')}
                      </p>
                    </header>
                    <div className="admin-event-form__grid">
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
                  </section>

                  <section className="admin-event-form__block">
                    <header className="admin-event-form__block-head">
                      <h3 className="admin-event-form__block-title">
                        <Radio size={13} aria-hidden />
                        {t('admin.eventEditor.supabase.liveTitle')}
                      </h3>
                    </header>
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
                      <label className="admin-event-form__field">
                        <span>{t('admin.eventEditor.supabase.liveStreamProvider')}</span>
                        <select
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
                      <label className="admin-event-form__field">
                        <span>{t('admin.eventEditor.supabase.liveStatus')}</span>
                        <select
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
                  </section>
                </fieldset>
              </div>
            </details>

            {draft.id && (
              <div
                id="event-section-security"
                ref={securitySectionRef}
                className="admin-event-form__security-anchor"
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

            <div className="admin-event-form__actions">
              <div className="admin-event-form__save-state" aria-live="polite">
                <span className={dirty ? 'is-dirty' : 'is-ready'} aria-hidden />
                <div>
                  <strong>
                    {dirty
                      ? t('admin.eventEditor.unsavedChanges')
                      : t('admin.eventEditor.noPendingChanges')}
                  </strong>
                  <small>{t('admin.eventEditor.backendHint')}</small>
                </div>
              </div>
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
