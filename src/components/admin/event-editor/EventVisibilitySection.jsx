import AdminFilterChipGroup from '../AdminFilterChipGroup.jsx'
import { AlertTriangle, Eye, Radio, ShieldCheck, Star, Unlock } from 'lucide-react'
import {
  defaultInscriptionCopy,
  resolveInscriptionCopyVariant,
} from '../../../lib/eventInscriptionCopy.js'
import {
  normalizeEventPublicSurface,
  publicSurfaceModulesForEvent,
} from '../../../lib/eventPublicSurface.js'
import { patchPublicSurface } from './draftPatches.js'
import { AdvancedGroup, CapacityPublicBreakdown, FormField } from './parts.jsx'

export default function EventVisibilitySection({
  activePanelRef,
  t,
  essentials,
  canEdit,
  draft,
  patchDraft,
  statusOptions,
  consistencyWarnings,
  accessOptions,
  advancedOpen,
  setAdvancedOpen,
  err,
  sourceEvent,
  publicCapacityPreview,
}) {
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

      {essentials ? null : (
        <>
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

      <AdvancedGroup
        enabled={!essentials}
        open={advancedOpen}
        onToggle={setAdvancedOpen}
        summary={t('admin.eventEditor.advancedSummary')}
      >
        {/* Cómo se presenta el evento en su página. Son los tres
                      textos que de verdad cambian por evento; los encabezados
                      de cada bloque los sigue fijando el diseño, que es lo que
                      mantiene el sitio coherente entre meets. */}
        <fieldset className="admin-event-form__public-copy">
          <legend>{t('admin.eventEditor.publicCopyLegend')}</legend>
          <p className="admin-event-form__section-note">{t('admin.eventEditor.publicCopyHint')}</p>

          <FormField
            htmlFor="event-public-title"
            label={t('admin.eventEditor.publicTitleField')}
            error={err('publicCopy.publicTitle')}
          >
            <input
              id="event-public-title"
              name="publicCopy.publicTitle"
              data-field="publicCopy.publicTitle"
              type="text"
              maxLength={120}
              value={draft.publicCopy?.publicTitle ?? ''}
              placeholder={draft.title || t('admin.eventEditor.publicTitlePlaceholder')}
              disabled={!canEdit}
              onChange={(event) =>
                patchDraft({
                  ...draft,
                  publicCopy: {
                    ...(draft.publicCopy ?? {}),
                    publicTitle: event.target.value,
                  },
                })
              }
            />
          </FormField>

          <FormField
            htmlFor="event-hero-lead"
            label={t('admin.eventEditor.heroLeadField')}
            error={err('publicCopy.heroLead')}
          >
            <input
              id="event-hero-lead"
              name="publicCopy.heroLead"
              data-field="publicCopy.heroLead"
              type="text"
              maxLength={240}
              value={draft.publicCopy?.heroLead ?? ''}
              placeholder={t('admin.eventEditor.heroLeadPlaceholder')}
              disabled={!canEdit}
              onChange={(event) =>
                patchDraft({
                  ...draft,
                  publicCopy: {
                    ...(draft.publicCopy ?? {}),
                    heroLead: event.target.value,
                  },
                })
              }
            />
          </FormField>

          <FormField
            htmlFor="event-cta-label"
            label={t('admin.eventEditor.ctaLabelField')}
            error={err('publicCopy.ctaLabel')}
          >
            <input
              id="event-cta-label"
              name="publicCopy.ctaLabel"
              data-field="publicCopy.ctaLabel"
              type="text"
              maxLength={40}
              value={draft.publicCopy?.ctaLabel ?? ''}
              placeholder={t('admin.eventEditor.ctaLabelPlaceholder')}
              disabled={!canEdit}
              onChange={(event) =>
                patchDraft({
                  ...draft,
                  publicCopy: {
                    ...(draft.publicCopy ?? {}),
                    ctaLabel: event.target.value,
                  },
                })
              }
            />
          </FormField>

          <p className="admin-event-form__section-note">
            {t('admin.eventEditor.inscriptionCopyHint')}
          </p>

          <FormField
            htmlFor="event-inscription-mark"
            label={t('admin.eventEditor.inscriptionMarkField')}
            error={err('publicCopy.inscriptionMark')}
          >
            <input
              id="event-inscription-mark"
              name="publicCopy.inscriptionMark"
              data-field="publicCopy.inscriptionMark"
              type="text"
              maxLength={40}
              value={draft.publicCopy?.inscriptionMark ?? ''}
              placeholder={
                defaultInscriptionCopy(
                  resolveInscriptionCopyVariant({
                    status: draft.status,
                    progressPublic: draft.capacityProgressPublic !== false,
                  }),
                  t,
                ).mark
              }
              disabled={!canEdit}
              onChange={(event) =>
                patchDraft({
                  ...draft,
                  publicCopy: {
                    ...(draft.publicCopy ?? {}),
                    inscriptionMark: event.target.value,
                  },
                })
              }
            />
          </FormField>

          <FormField
            htmlFor="event-inscription-note"
            label={t('admin.eventEditor.inscriptionNoteField')}
            error={err('publicCopy.inscriptionNote')}
          >
            <textarea
              id="event-inscription-note"
              name="publicCopy.inscriptionNote"
              data-field="publicCopy.inscriptionNote"
              rows={2}
              maxLength={160}
              value={draft.publicCopy?.inscriptionNote ?? ''}
              placeholder={
                defaultInscriptionCopy(
                  resolveInscriptionCopyVariant({
                    status: draft.status,
                    progressPublic: draft.capacityProgressPublic !== false,
                  }),
                  t,
                ).hint
              }
              disabled={!canEdit}
              onChange={(event) =>
                patchDraft({
                  ...draft,
                  publicCopy: {
                    ...(draft.publicCopy ?? {}),
                    inscriptionNote: event.target.value,
                  },
                })
              }
            />
          </FormField>
        </fieldset>

        {essentials ? null : (
          <fieldset className="admin-event-form__surface">
            <legend>{t('admin.eventEditor.publicSurfaceLegend')}</legend>
            {publicSurfaceModulesForEvent(sourceEvent ?? draft).map((module) => (
              <label key={module.key} className="admin-event-form__toggle">
                <input
                  checked={normalizeEventPublicSurface(draft.publicSurface)[module.key]}
                  className="admin-event-form__toggle-input"
                  type="checkbox"
                  onChange={(event) =>
                    patchDraft(patchPublicSurface(draft, module.key, event.target.checked))
                  }
                  disabled={!canEdit}
                />
                <span className="admin-event-form__toggle-ui" aria-hidden />
                <span className="admin-event-form__toggle-copy">
                  <strong>
                    {t(
                      `admin.eventEditor.publicSurface${module.key.charAt(0).toUpperCase()}${module.key.slice(1)}Title`,
                    )}
                  </strong>
                  <small>
                    {t(
                      `admin.eventEditor.publicSurface${module.key.charAt(0).toUpperCase()}${module.key.slice(1)}Hint`,
                    )}
                  </small>
                </span>
              </label>
            ))}
            <CapacityPublicBreakdown
              canEdit={canEdit}
              preview={publicCapacityPreview}
              progressChecked={draft.capacityProgressPublic !== false}
              progressId="event-capacity-progress-public-surface"
              t={t}
              totalChecked={draft.capacityTotalPublic !== false}
              totalId="event-capacity-total-public-surface"
              onProgressChange={(value) =>
                patchDraft({
                  ...draft,
                  capacityProgressPublic: value,
                })
              }
              onTotalChange={(value) =>
                patchDraft({
                  ...draft,
                  capacityTotalPublic: value,
                })
              }
            />
          </fieldset>
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
