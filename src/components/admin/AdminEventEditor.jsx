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
  const dialogTitle = draft.id ? t('admin.eventEditor.editTitle') : t('admin.eventEditor.createTitle')
  const onCancelRef = useRef(onCancel)
  const securitySectionRef = useRef(null)
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

  // Supabase es la fuente de verdad. El cache local se actualiza solamente
  // después de que el upsert atómico del backend fue confirmado.
  async function handleFormSubmit(event) {
    event.preventDefault()
    setSyncError(null)
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
          <form className="admin-event-form admin-event-form--editor" onSubmit={handleFormSubmit} noValidate>
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

        <div className="admin-event-form__grid">
          <label className="admin-event-form__field admin-event-form__field--wide">
            <span>{t('admin.eventEditor.publicTitle')}</span>
            <input
              required
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              placeholder={t('admin.eventEditor.titlePlaceholder')}
              disabled={!canEdit}
            />
          </label>

          <label className="admin-event-form__field">
            <span>{t('admin.eventEditor.date')}</span>
            <input
              required
              type="date"
              value={draft.dateISO}
              onChange={(event) => onChange({ ...draft, dateISO: event.target.value })}
              disabled={!canEdit}
            />
          </label>

          <label className="admin-event-form__field">
            <span>{t('admin.eventEditor.totalSlots')}</span>
            <input
              min={1}
              required
              type="number"
              value={draft.slots}
              onChange={(event) => onChange({ ...draft, slots: event.target.value })}
              disabled={!canEdit}
            />
          </label>

          <label className="admin-event-form__field">
            <span>{t('admin.eventEditor.venue')}</span>
            <input
              required
              value={draft.venue}
              onChange={(event) => onChange({ ...draft, venue: event.target.value })}
              placeholder={t('admin.eventEditor.venuePlaceholder')}
              disabled={!canEdit}
            />
          </label>

          <label className="admin-event-form__field">
            <span>{t('admin.eventEditor.location')}</span>
            <input
              required
              value={draft.location}
              onChange={(event) => onChange({ ...draft, location: event.target.value })}
              placeholder={t('admin.eventEditor.locationPlaceholder')}
              disabled={!canEdit}
            />
          </label>
        </div>

        <fieldset className="admin-event-form__pricing admin-event-form__pricing--rates">
          <legend>{t('admin.eventEditor.pricingTitle')}</legend>
          <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.pricingLead')}</p>
          <div className="admin-event-form__rate-cards">
            <label className="admin-event-form__rate-card">
              <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceMembership')}</span>
              <span className="admin-event-form__rate-card-input">
                <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                <input
                  min={0}
                  required
                  type="number"
                  value={draft.pricing?.membership ?? DEFAULT_EVENT_PRICING.membership}
                  onChange={(event) => onChange(updatePricingField(draft, 'membership', event.target.value))}
                  disabled={!canEdit}
                />
              </span>
            </label>
            <label className="admin-event-form__rate-card">
              <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceRegistration')}</span>
              <span className="admin-event-form__rate-card-input">
                <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                <input
                  min={0}
                  required
                  type="number"
                  value={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
                  onChange={(event) => onChange(updatePricingField(draft, 'registration', event.target.value))}
                  disabled={!canEdit}
                />
              </span>
            </label>
            <label className="admin-event-form__rate-card admin-event-form__rate-card--featured">
              <span className="admin-event-form__rate-card-label">{t('admin.eventEditor.priceCombo')}</span>
              <span className="admin-event-form__rate-card-input">
                <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                <input
                  min={0}
                  required
                  type="number"
                  value={draft.pricing?.combo ?? DEFAULT_EVENT_PRICING.combo}
                  onChange={(event) => onChange(updatePricingField(draft, 'combo', event.target.value))}
                  disabled={!canEdit}
                />
              </span>
            </label>
          </div>
        </fieldset>

        <AdminTicketAddonsEditor
          addons={draft.pricing?.ticketAddons ?? []}
          canEdit={canEdit}
          onChange={(ticketAddons) => onChange(updatePricingField(draft, 'ticketAddons', ticketAddons))}
        />

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

        <AdminFilterChipGroup
          compact
          disabled={!canEdit}
          id="event-status"
          label={t('admin.eventEditor.publicStatus')}
          value={draft.status}
          onChange={(value) => onChange({ ...draft, status: value })}
          options={statusOptions}
        />

        <label className="admin-event-form__toggle">
          <input
            checked={draft.featured}
            className="admin-event-form__toggle-input"
            type="checkbox"
            onChange={(event) => onChange({ ...draft, featured: event.target.checked })}
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
            onChange={(event) => onChange(updatePricingField(draft, 'ticketsEnabled', event.target.checked))}
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

        <fieldset className="admin-event-form__pricing">
          <legend>{t('admin.eventEditor.supabase.sectionTitle')}</legend>
          <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.supabase.sectionLead')}</p>

          <section className="admin-event-form__block">
            <header className="admin-event-form__block-head">
              <h3 className="admin-event-form__block-title">{t('admin.eventEditor.supabase.scheduleBlockTitle')}</h3>
            </header>
            <div className="admin-event-form__grid">
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.startsAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.startsAt ?? ''}
                  onChange={(event) => onChange({ ...draft, startsAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.endsAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.endsAt ?? ''}
                  onChange={(event) => onChange({ ...draft, endsAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </section>

          <section className="admin-event-form__block">
            <header className="admin-event-form__block-head">
              <h3 className="admin-event-form__block-title">{t('admin.eventEditor.supabase.registrationWindowTitle')}</h3>
              <p className="admin-event-form__block-lead">{t('admin.eventEditor.supabase.registrationWindowLead')}</p>
            </header>
            <div className="admin-event-form__grid">
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.registrationOpensAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.registrationOpensAt ?? ''}
                  onChange={(event) => onChange({ ...draft, registrationOpensAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.registrationClosesAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.registrationClosesAt ?? ''}
                  onChange={(event) => onChange({ ...draft, registrationClosesAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </section>

          <section className="admin-event-form__block">
            <header className="admin-event-form__block-head">
              <h3 className="admin-event-form__block-title">{t('admin.eventEditor.supabase.ticketSalesWindowTitle')}</h3>
              <p className="admin-event-form__block-lead">{t('admin.eventEditor.supabase.ticketSalesWindowLead')}</p>
            </header>
            <div className="admin-event-form__grid">
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.ticketSalesOpensAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.ticketSalesOpensAt ?? ''}
                  onChange={(event) => onChange({ ...draft, ticketSalesOpensAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.ticketSalesClosesAt')}</span>
                <input
                  type="datetime-local"
                  value={draft.ticketSalesClosesAt ?? ''}
                  onChange={(event) => onChange({ ...draft, ticketSalesClosesAt: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </section>

          <AdminTicketTypesEditor
            addonsCatalog={draft.pricing?.ticketAddons ?? []}
            canEdit={canEdit}
            eventDays={draft.eventDays ?? []}
            onChangeEventDays={(eventDays) => onChange({ ...draft, eventDays })}
            onChangeTicketTypes={(ticketTypes) => onChange({ ...draft, ticketTypes })}
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
              <label className="admin-event-form__field admin-event-form__field--wide">
                <span>{t('admin.eventEditor.supabase.liveStreamUrl')}</span>
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={draft.liveStreamUrl ?? ''}
                  onChange={(event) => onChange({ ...draft, liveStreamUrl: event.target.value })}
                  disabled={!canEdit}
                />
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.liveStreamProvider')}</span>
                <select
                  value={draft.liveStreamProvider ?? 'youtube'}
                  onChange={(event) => onChange({ ...draft, liveStreamProvider: event.target.value })}
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
                  onChange={(event) => onChange({ ...draft, liveStatus: event.target.value })}
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

        <label className="admin-event-form__toggle">
          <input
            checked={Boolean(draft.published)}
            className="admin-event-form__toggle-input"
            type="checkbox"
            onChange={(event) => onChange({ ...draft, published: event.target.checked })}
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

        {syncError && (
          <p className="admin-event-form__pricing-lead" role="alert">
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
