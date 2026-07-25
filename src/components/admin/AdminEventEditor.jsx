import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Eye, Link2, MapPin, Radio, Save, Star, Ticket, X } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import CapacityBar from '../ui/CapacityBar.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  mapDraftToPreviewEvent,
  upsertEventCalendarLiveFields,
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
  const previewEvent = useMemo(() => mapDraftToPreviewEvent(draft, sourceEvent), [draft, sourceEvent])

  return (
    <div className={`admin-event-preview${live ? ' admin-event-preview--live' : ''}${embedded ? ' admin-event-preview--embedded' : ''}`.trim()}>
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

      <div className="admin-event-preview__footer">
        <div className="admin-event-preview__capacity">
          <CapacityBar
            compact
            current={previewEvent.registered}
            total={previewEvent.slots}
            label={t('admin.eventEditor.slotsShortLabel')}
          />
        </div>

        <ul className="admin-event-preview__meta" aria-label={t('admin.eventEditor.previewMetaAria')}>
          <li>
            <span className="admin-event-preview__meta-icon" aria-hidden>
              <CalendarDays size={13} />
            </span>
            <span className="admin-event-preview__meta-copy">
              <span className="admin-event-preview__meta-label">{t('admin.eventEditor.metaDate')}</span>
              <strong>{previewEvent.date}</strong>
            </span>
          </li>
          <li>
            <span className="admin-event-preview__meta-icon" aria-hidden>
              <MapPin size={13} />
            </span>
            <span className="admin-event-preview__meta-copy">
              <span className="admin-event-preview__meta-label">{t('admin.eventEditor.metaVenue')}</span>
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
              <span className="admin-event-preview__meta-label">{t('admin.eventEditor.metaSlug')}</span>
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
  const dialogTitle = draft.id ? t('admin.eventEditor.editTitle') : t('admin.eventEditor.createTitle')
  const onCancelRef = useRef(onCancel)
  const securitySectionRef = useRef(null)
  const formRef = useRef(null)
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
      if (event.key === 'Escape') onCancelRef.current?.()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (initialFocus !== 'security' || !draft.id) return
    const frame = requestAnimationFrame(() => {
      securitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [draft.id, initialFocus])

  function patchDraft(next) {
    onChange(next)
    if (Object.keys(fieldErrors).length) setFieldErrors({})
    if (syncError) setSyncError(null)
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
        validation.firstKey?.startsWith('ticketSales') ||
        validation.firstKey?.startsWith('liveStream')
      ) {
        setShowAdvanced(true)
      }
      requestAnimationFrame(() => focusFirstInvalid(validation.firstKey))
      return
    }

    setFieldErrors({})
    setSyncing(true)
    try {
      const preview = mapDraftToPreviewEvent(draft, sourceEvent)
      await upsertEventCalendarLiveFields({ ...draft, slug: preview.slug })
    } catch (error) {
      setSyncError(error.message)
      setSyncing(false)
      return
    } finally {
      setSyncing(false)
    }
    onSubmit(event)
  }

  const err = (key) => fieldErrors[key]

  return createPortal(
    <div className="admin-event-editor-modal">
      <button
        type="button"
        className="admin-event-editor-modal__backdrop"
        aria-label={t('admin.eventEditor.close')}
        onClick={onCancel}
      />
      <div
        className="admin-event-editor-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
      >
        <div className={`admin-event-editor${draft.id ? ' admin-event-editor--editing' : ' admin-event-editor--creating'}`}>
          <form
            ref={formRef}
            className="admin-event-form admin-event-form--editor"
            onSubmit={handleFormSubmit}
            noValidate
          >
            <div className="admin-event-form__head">
              <div>
                <span className="admin-event-form__mode">
                  {draft.id ? t('admin.eventEditor.editMode') : t('admin.eventEditor.createMode')}
                </span>
                <h3>{dialogTitle}</h3>
                <p className="admin-event-form__lead">{t('admin.eventEditor.lead')}</p>
              </div>
              <button
                type="button"
                className="admin-event-form__close"
                onClick={onCancel}
                aria-label={t('admin.eventEditor.close')}
              >
                <X size={16} />
              </button>
            </div>

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

                <FormField htmlFor="event-date" label={t('admin.eventEditor.date')} error={err('dateISO')}>
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

                <FormField htmlFor="event-slots" label={t('admin.eventEditor.totalSlots')} error={err('slots')}>
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

                <FormField htmlFor="event-venue" label={t('admin.eventEditor.venue')} error={err('venue')}>
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
                <label className={`admin-event-form__rate-card${err('pricing.membership') ? ' is-invalid' : ''}`}>
                  <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceMembership')}</span>
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
                      onChange={(event) => patchDraft(updatePricingField(draft, 'membership', event.target.value))}
                      disabled={!canEdit}
                    />
                  </span>
                  {err('pricing.membership') ? (
                    <span className="admin-event-form__error" role="alert">
                      {err('pricing.membership')}
                    </span>
                  ) : null}
                </label>
                <label className={`admin-event-form__rate-card${err('pricing.registration') ? ' is-invalid' : ''}`}>
                  <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceRegistration')}</span>
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
                      onChange={(event) => patchDraft(updatePricingField(draft, 'registration', event.target.value))}
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
                  <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceCombo')}</span>
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
                      onChange={(event) => patchDraft(updatePricingField(draft, 'combo', event.target.value))}
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

            <section className="admin-event-form__section" aria-labelledby="event-section-visibility">
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
                  checked={draft.pricing?.ticketsEnabled !== false}
                  className="admin-event-form__toggle-input"
                  type="checkbox"
                  onChange={(event) => patchDraft(updatePricingField(draft, 'ticketsEnabled', event.target.checked))}
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
            </section>

            <details
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
                <AdminTicketAddonsEditor
                  addons={draft.pricing?.ticketAddons ?? []}
                  canEdit={canEdit}
                  onChange={(ticketAddons) => patchDraft(updatePricingField(draft, 'ticketAddons', ticketAddons))}
                />

                <fieldset className="admin-event-form__pricing">
                  <legend>{t('admin.eventEditor.supabase.sectionTitle')}</legend>
                  <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.supabase.sectionLead')}</p>

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
                          onChange={(event) => patchDraft({ ...draft, startsAt: event.target.value })}
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

                  <AdminTicketTypesEditor
                    addonsCatalog={draft.pricing?.ticketAddons ?? []}
                    canEdit={canEdit}
                    eventDays={draft.eventDays ?? []}
                    onChangeEventDays={(eventDays) => patchDraft({ ...draft, eventDays })}
                    onChangeTicketTypes={(ticketTypes) => patchDraft({ ...draft, ticketTypes })}
                    ticketTypes={draft.ticketTypes ?? []}
                  />

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
                          onChange={(event) => patchDraft({ ...draft, liveStreamUrl: event.target.value })}
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
                          onChange={(event) => patchDraft({ ...draft, liveStatus: event.target.value })}
                          disabled={!canEdit}
                        >
                          <option value="offline">{t('admin.eventEditor.supabase.liveStatusOffline')}</option>
                          <option value="live">{t('admin.eventEditor.supabase.liveStatusLive')}</option>
                          <option value="ended">{t('admin.eventEditor.supabase.liveStatusEnded')}</option>
                        </select>
                      </label>
                    </div>
                  </section>
                </fieldset>
              </div>
            </details>

            {draft.id && (
              <div ref={securitySectionRef} className="admin-event-form__security-anchor">
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

            <div className="admin-event-form__actions">
              <Button type="submit" disabled={!canEdit || syncing}>
                <Save size={15} aria-hidden />
                {draft.id ? t('admin.eventEditor.saveChanges') : t('admin.eventEditor.createEvent')}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
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
