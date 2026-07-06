import { useMemo } from 'react'
import { CalendarDays, Eye, Link2, MapPin, Save, Star, Ticket, X } from 'lucide-react'
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
  const fillPercent =
    previewEvent.slots > 0 ? Math.round((previewEvent.registered / previewEvent.slots) * 100) : 0

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

      <div className="admin-event-preview__capacity">
        <CapacityBar
          current={previewEvent.registered}
          total={previewEvent.slots}
          label={t('admin.eventEditor.slotsLabel', {
            registered: previewEvent.registered,
            slots: previewEvent.slots,
            percent: fillPercent,
          })}
        />
      </div>

      <ul className="admin-event-preview__meta">
        <li>
          <CalendarDays size={13} aria-hidden />
          <strong>{previewEvent.date}</strong>
        </li>
        <li>
          <MapPin size={13} aria-hidden />
          <span>
            {previewEvent.venue}, {previewEvent.location}
          </span>
        </li>
        <li>
          <Link2 size={13} aria-hidden />
          <code>{previewEvent.slug}</code>
        </li>
      </ul>
    </div>
  )
}

export default function AdminEventEditor({
  canEdit,
  draft,
  onCancel,
  onChange,
  onSubmit,
  sourceEvent = null,
}) {
  const { t } = useI18n()

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(
        ADMIN_EVENT_STATUS_OPTIONS.filter(([value]) => value !== 'all'),
        t,
      ),
    [t],
  )

  return (
    <div className="admin-event-editor">
      <form className="admin-event-form admin-event-form--editor" onSubmit={onSubmit} noValidate>
        <div className="admin-event-form__head">
          <div>
            <h3>{draft.id ? t('admin.eventEditor.editTitle') : t('admin.eventEditor.createTitle')}</h3>
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

        <fieldset className="admin-event-form__pricing">
          <legend>{t('admin.eventEditor.pricingTitle')}</legend>
          <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.pricingLead')}</p>
          <div className="admin-event-form__grid admin-event-form__grid--pricing">
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.priceMembership')}</span>
              <input
                min={0}
                required
                type="number"
                value={draft.pricing?.membership ?? DEFAULT_EVENT_PRICING.membership}
                onChange={(event) => onChange(updatePricingField(draft, 'membership', event.target.value))}
                disabled={!canEdit}
              />
            </label>
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.priceRegistration')}</span>
              <input
                min={0}
                required
                type="number"
                value={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
                onChange={(event) => onChange(updatePricingField(draft, 'registration', event.target.value))}
                disabled={!canEdit}
              />
            </label>
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.priceCombo')}</span>
              <input
                min={0}
                required
                type="number"
                value={draft.pricing?.combo ?? DEFAULT_EVENT_PRICING.combo}
                onChange={(event) => onChange(updatePricingField(draft, 'combo', event.target.value))}
                disabled={!canEdit}
              />
            </label>
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.priceTicketDay')}</span>
              <input
                min={0}
                required
                type="number"
                value={draft.pricing?.ticketDay ?? DEFAULT_EVENT_PRICING.ticketDay}
                onChange={(event) => onChange(updatePricingField(draft, 'ticketDay', event.target.value))}
                disabled={!canEdit}
              />
            </label>
            <label className="admin-event-form__field">
              <span>{t('admin.eventEditor.priceTicketBoth')}</span>
              <input
                min={0}
                required
                type="number"
                value={draft.pricing?.ticketBothDays ?? DEFAULT_EVENT_PRICING.ticketBothDays}
                onChange={(event) =>
                  onChange(updatePricingField(draft, 'ticketBothDays', event.target.value))
                }
                disabled={!canEdit}
              />
            </label>
          </div>
        </fieldset>

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

        <div className="admin-event-form__actions">
          <Button type="submit" disabled={!canEdit}>
            <Save size={15} aria-hidden />
            {draft.id ? t('admin.eventEditor.saveChanges') : t('admin.eventEditor.publish')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>

      <AdminEventLivePreview draft={draft} live sourceEvent={sourceEvent} />
    </div>
  )
}

export { AdminEventLivePreview }
