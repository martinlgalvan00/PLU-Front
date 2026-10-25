import { useMemo, useState } from 'react'
import AdminFilterChipGroup from '../AdminFilterChipGroup.jsx'
import { AlertTriangle, Eye, Radio, ShieldCheck, Star, Unlock } from 'lucide-react'
import EventLandingSection from './EventLandingSection.jsx'
import EventExternalFormField from './EventExternalFormField.jsx'
import { AdvancedGroup, FormField } from './parts.jsx'
import EventPublishChecklist from './EventPublishChecklist.jsx'
import { resolveEventPublishReadiness } from '../../../lib/eventPublishReadiness.js'
import {
  EVENT_REGISTRATION_MODES,
  applyRegistrationModeToDraft,
  registrationModeOfDraft,
} from '../../../lib/eventRegistrationMode.js'

export default function EventVisibilitySection({
  activePanelRef,
  t,
  essentials,
  canEdit,
  draft,
  patchDraft,
  // Cuenta por evento (organizador): estado, publicación, afiliación y destacado los decide
  // PLU. El servidor los fuerza al valor actual; acá se muestran bloqueados para no prometer
  // un cambio que no se guarda.
  eventScoped = false,
  consistencyWarnings,
  publishChecks = [],
  accessOptions,
  advancedOpen,
  setAdvancedOpen,
  err,
  sourceEvent,
  publicCapacityPreview,
  onHeroUpload,
  onImageUpload,
  heroUploading = false,
  heroPreviewUrl = null,
  platform = null,
  mpProfiles,
  onGoTo,
  studioSave = null,
  landingSourceEvents = [],
}) {
  // "Abre en una fecha" recién elegido: hasta cargar la fecha el borrador se
  // lee como abierta, y el campo no puede desaparecer en ese intervalo.
  const [schedulingPending, setSchedulingPending] = useState(false)
  // Solo mientras falta la fecha: con una fecha ya pasada la inscripción abre
  // en cuanto se guarda, y el selector lo dice ("Abierta ya") en vez de
  // prometer una apertura programada.
  const registrationMode =
    schedulingPending && !draft.registrationOpensAt && registrationModeOfDraft(draft) === 'open'
      ? 'scheduled'
      : registrationModeOfDraft(draft)

  // Imagen y logo viven en el evento guardado, no en el draft.
  const readiness = useMemo(
    () =>
      resolveEventPublishReadiness(
        {
          logoUrl: sourceEvent?.logoUrl,
          logoPath: sourceEvent?.logoPath,
          heroImageUrl: heroPreviewUrl ?? sourceEvent?.heroImageUrl,
          ...draft,
        },
        { platform, mpProfiles },
      ),
    [draft, sourceEvent, heroPreviewUrl, platform, mpProfiles],
  )

  return (
    <section
      ref={activePanelRef}
      className="admin-event-form__section"
      role="tabpanel"
      aria-label={t('admin.eventEditor.navVisibility')}
      tabIndex={-1}
    >
      {essentials ? null : (
        <header className="admin-event-form__section-head">
          <h4>{t('admin.eventEditor.sectionVisibility')}</h4>
        </header>
      )}

      {essentials ? null : (
        <>
          {/* El estado no se elige a mano: se decide cuándo abre la
              inscripción y el estado y la ventana quedan coherentes. */}
          <AdminFilterChipGroup
            compact
            disabled={!canEdit || eventScoped}
            id="event-registration-mode"
            label={t('admin.eventQuickCreate.regLabel')}
            value={registrationMode}
            onChange={(mode) => {
              setSchedulingPending(mode === 'scheduled')
              patchDraft(applyRegistrationModeToDraft(draft, mode))
            }}
            options={EVENT_REGISTRATION_MODES.map((mode) => [
              mode,
              t(`admin.eventQuickCreate.reg${mode[0].toUpperCase()}${mode.slice(1)}`),
            ])}
          />
          {registrationMode === 'scheduled' ? (
            <FormField
              error={err('registrationOpensAt')}
              htmlFor="event-registration-opens"
              label={t('admin.eventEditor.supabase.registrationOpensAt')}
            >
              <input
                id="event-registration-opens"
                disabled={!canEdit || eventScoped}
                name="registrationOpensAt"
                type="datetime-local"
                value={draft.registrationOpensAt ?? ''}
                aria-invalid={Boolean(err('registrationOpensAt'))}
                onChange={(event) =>
                  patchDraft({ ...draft, registrationOpensAt: event.target.value })
                }
              />
            </FormField>
          ) : null}

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

      {essentials ? null : (
        <>
          <EventPublishChecklist readiness={readiness} onGoTo={onGoTo} />

          <label className="admin-event-form__toggle">
            <input
              checked={Boolean(draft.published)}
              className="admin-event-form__toggle-input"
              type="checkbox"
              onChange={(event) => patchDraft({ ...draft, published: event.target.checked })}
              disabled={!canEdit || eventScoped}
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

          {/* Lo que el público va a encontrar al intentar pagar. Aviso, no
              bloqueo: un evento puede anunciarse antes de abrir las ventas. */}
          {publishChecks.length > 0 ? (
            <div className="admin-event-form__consistency" role="status">
              <p className="admin-event-form__consistency-head">
                <AlertTriangle size={13} aria-hidden />
                {t('admin.eventEditor.publishChecks.title')}
              </p>
              <ul>
                {publishChecks.map((code) => (
                  <li key={code}>{t(`admin.eventEditor.publishChecks.codes.${code}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Acceso al meet: misma decisión que StateControl. En el
                          acordeón de la consola vive solo allá (PATCH parcial). */}
          <div className="admin-event-form__access">
            <AdminFilterChipGroup
              compact
              disabled={!canEdit || eventScoped}
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

      <label className="admin-event-form__toggle">
        <input
          checked={draft.featured}
          className="admin-event-form__toggle-input"
          type="checkbox"
          onChange={(event) => patchDraft({ ...draft, featured: event.target.checked })}
          disabled={!canEdit || eventScoped}
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

      <AdvancedGroup
        enabled={!essentials}
        open={advancedOpen}
        onToggle={setAdvancedOpen}
        summary={t('admin.eventEditor.advancedSummary')}
      >
        <EventLandingSection
          canEdit={canEdit}
          draft={draft}
          err={err}
          heroPreviewUrl={heroPreviewUrl}
          heroUploading={heroUploading}
          landingSourceEvents={landingSourceEvents}
          patchDraft={patchDraft}
          publicCapacityPreview={publicCapacityPreview}
          sourceEvent={sourceEvent}
          studioSave={studioSave}
          t={t}
          onHeroUpload={onHeroUpload}
          onImageUpload={onImageUpload}
        />

        <EventExternalFormField canEdit={canEdit} draft={draft} err={err} patchDraft={patchDraft} />

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
                <FormField
                  htmlFor="event-live-provider"
                  label={t('admin.eventEditor.supabase.liveStreamProvider')}
                  error={err('liveStreamProvider')}
                >
                  <select
                    id="event-live-provider"
                    value={draft.liveStreamProvider ?? 'youtube'}
                    aria-invalid={Boolean(err('liveStreamProvider'))}
                    onChange={(event) =>
                      patchDraft({ ...draft, liveStreamProvider: event.target.value })
                    }
                    disabled={!canEdit}
                  >
                    <option value="youtube">
                      {t('admin.eventEditor.supabase.liveProviderYoutube')}
                    </option>
                    <option value="instagram">
                      {t('admin.eventEditor.supabase.liveProviderInstagram')}
                    </option>
                    <option value="twitch">
                      {t('admin.eventEditor.supabase.liveProviderTwitch')}
                    </option>
                  </select>
                </FormField>
                <FormField
                  htmlFor="event-live-status"
                  label={t('admin.eventEditor.supabase.liveStatus')}
                  error={err('liveStatus')}
                >
                  <select
                    id="event-live-status"
                    value={draft.liveStatus ?? 'offline'}
                    aria-invalid={Boolean(err('liveStatus'))}
                    onChange={(event) => patchDraft({ ...draft, liveStatus: event.target.value })}
                    disabled={!canEdit}
                  >
                    <option value="offline">
                      {t('admin.eventEditor.supabase.liveStatusOffline')}
                    </option>
                    <option value="live">{t('admin.eventEditor.supabase.liveStatusLive')}</option>
                    <option value="ended">{t('admin.eventEditor.supabase.liveStatusEnded')}</option>
                  </select>
                </FormField>
              </div>
            </div>
          </div>
        ) : null}
      </AdvancedGroup>
    </section>
  )
}
