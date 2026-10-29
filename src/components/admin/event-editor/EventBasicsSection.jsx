import DateTimeLocalInput from '../../ui/DateTimeLocalInput.jsx'
import { withEventStart } from '../../../services/eventAdminService.js'
import { FormField } from './parts.jsx'
import EventOfferingField from './EventOfferingField.jsx'
import PlaceDirections from '../../ui/PlaceDirections.jsx'

export default function EventBasicsSection({
  activePanelRef,
  t,
  essentials,
  err,
  draft,
  patchDraft,
  canEdit,
}) {
  return (
    <section
      ref={activePanelRef}
      className="admin-event-form__section"
      role="tabpanel"
      aria-label={t('admin.eventEditor.navBasics')}
      tabIndex={-1}
    >
      {essentials ? null : (
        <header className="admin-event-form__section-head">
          <h4>{t('admin.eventEditor.sectionBasics')}</h4>
          <p>{t('admin.eventEditor.sectionBasicsLead')}</p>
        </header>
      )}

      <div className="admin-event-form__grid admin-event-form__grid--basics">
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

        {/* La descripción viaja también en el editor embebido: es
                        el texto que lee el atleta en la página del evento y,
                        mientras estuvo recortada por `essentials`, un evento ya
                        creado no tenía ningún lugar donde editarla. */}
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
            rows={3}
            maxLength={1000}
            value={draft.description ?? ''}
            aria-invalid={Boolean(err('description'))}
            onChange={(event) => patchDraft({ ...draft, description: event.target.value })}
            placeholder={t('admin.eventEditor.descriptionPlaceholder')}
            disabled={!canEdit}
          />
        </FormField>

        <div className="admin-event-form__cluster" role="group" aria-labelledby="event-basics-when">
          <p id="event-basics-when" className="admin-event-form__cluster-label">
            {t('admin.eventEditor.basicsWhen')}
          </p>
          <div className="admin-event-form__cluster-fields">
            <FormField
              htmlFor="event-starts-at"
              label={t('admin.eventEditor.basicsStart')}
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
              label={t('admin.eventEditor.basicsEnd')}
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
          </div>
        </div>

        <div
          className="admin-event-form__cluster"
          role="group"
          aria-labelledby="event-basics-where"
        >
          <p id="event-basics-where" className="admin-event-form__cluster-label">
            {t('admin.eventEditor.basicsWhere')}
          </p>
          <div className="admin-event-form__cluster-fields">
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

            <FormField
              htmlFor="event-venue-address"
              label={t('admin.eventEditor.venueAddress')}
              error={err('venueAddress')}
              wide
            >
              <input
                id="event-venue-address"
                name="venueAddress"
                data-field="venueAddress"
                maxLength={200}
                autoComplete="off"
                value={draft.venueAddress ?? ''}
                aria-describedby="event-venue-address-hint"
                aria-invalid={Boolean(err('venueAddress'))}
                onChange={(event) => patchDraft({ ...draft, venueAddress: event.target.value })}
                placeholder={t('admin.eventEditor.venueAddressPlaceholder')}
                disabled={!canEdit}
              />
              <small className="admin-event-form__field-hint" id="event-venue-address-hint">
                {t('admin.eventEditor.venueAddressHint')}
              </small>
            </FormField>
            {/* Para probar que la dirección lleva al lugar correcto. */}
            {String(draft.venueAddress ?? '').trim() ? (
              <div className="admin-event-form__field admin-event-form__field--wide">
                <PlaceDirections
                  address={draft.venueAddress}
                  city={draft.location}
                  compact
                  name={draft.venue}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {essentials ? null : (
        <EventOfferingField canEdit={canEdit} draft={draft} patchDraft={patchDraft} />
      )}
    </section>
  )
}
