import AdminFilterChipGroup from '../AdminFilterChipGroup.jsx'
import { LayoutTemplate } from 'lucide-react'
import {
  EVENT_LANDING_SLOT_LIMITS,
  EVENT_LANDING_THEMES,
  emptyEventLanding,
  normalizeEventLanding,
  syncLandingSlotsFromPublicCopy,
} from '../../../lib/eventLanding.js'
import { FormField } from './parts.jsx'

const HERO_FIELDS = [
  { key: 'heroTitle', labelKey: 'publicTitleField', max: EVENT_LANDING_SLOT_LIMITS.heroTitle },
  { key: 'heroLead', labelKey: 'heroLeadField', max: EVENT_LANDING_SLOT_LIMITS.heroLead },
  { key: 'ctaLabel', labelKey: 'ctaLabelField', max: EVENT_LANDING_SLOT_LIMITS.ctaLabel },
]

const EDITORIAL_FIELDS = [
  {
    key: 'experienceTitle',
    labelKey: 'landingExperienceTitleField',
    max: EVENT_LANDING_SLOT_LIMITS.experienceTitle,
  },
  {
    key: 'experienceBody',
    labelKey: 'landingExperienceBodyField',
    max: EVENT_LANDING_SLOT_LIMITS.experienceBody,
    multiline: true,
  },
  {
    key: 'categoriesTitle',
    labelKey: 'landingCategoriesTitleField',
    max: EVENT_LANDING_SLOT_LIMITS.categoriesTitle,
  },
  {
    key: 'categoriesBody',
    labelKey: 'landingCategoriesBodyField',
    max: EVENT_LANDING_SLOT_LIMITS.categoriesBody,
    multiline: true,
  },
  {
    key: 'locationTitle',
    labelKey: 'landingLocationTitleField',
    max: EVENT_LANDING_SLOT_LIMITS.locationTitle,
  },
  {
    key: 'locationBody',
    labelKey: 'landingLocationBodyField',
    max: EVENT_LANDING_SLOT_LIMITS.locationBody,
    multiline: true,
  },
]

const SEO_FIELDS = [
  { key: 'metaTitle', labelKey: 'landingMetaTitleField', max: EVENT_LANDING_SLOT_LIMITS.metaTitle },
  {
    key: 'metaDescription',
    labelKey: 'landingMetaDescriptionField',
    max: EVENT_LANDING_SLOT_LIMITS.metaDescription,
    multiline: true,
  },
]

const FAQ_FIELDS = [1, 2, 3].flatMap((index) => [
  {
    key: `faq${index}Question`,
    labelKey: 'landingFaqQuestionField',
    labelParams: { n: index },
    max: EVENT_LANDING_SLOT_LIMITS.faq1Question,
  },
  {
    key: `faq${index}Answer`,
    labelKey: 'landingFaqAnswerField',
    labelParams: { n: index },
    max: EVENT_LANDING_SLOT_LIMITS.faq1Answer,
    multiline: true,
  },
])

const HERO_SLOT_TO_PUBLIC_COPY = {
  heroTitle: 'publicTitle',
  heroLead: 'heroLead',
  ctaLabel: 'ctaLabel',
}

function SlotFields({ fields, landing, canEdit, err, patchSlot, t }) {
  return fields.map((field) => {
    const fieldId = `event-landing-${field.key}`
    const errorKey =
      HERO_SLOT_TO_PUBLIC_COPY[field.key] != null
        ? `publicCopy.${HERO_SLOT_TO_PUBLIC_COPY[field.key]}`
        : `landing.slots.${field.key}`
    const label = t(`admin.eventEditor.${field.labelKey}`, field.labelParams)
    const common = {
      id: fieldId,
      name: `landing.slots.${field.key}`,
      'data-field': `landing.slots.${field.key}`,
      maxLength: field.max,
      value: landing.slots[field.key] ?? '',
      disabled: !canEdit,
      onChange: (event) => patchSlot(field.key, event.target.value),
    }
    return (
      <FormField key={field.key} htmlFor={fieldId} label={label} error={err(errorKey)}>
        {field.multiline ? <textarea {...common} rows={3} /> : <input {...common} type="text" />}
      </FormField>
    )
  })
}

/**
 * Plantilla de landing + slots editoriales. El copy del hero también vive en
 * publicCopy por compat; acá se editan juntos.
 */
export default function EventLandingSection({
  t,
  canEdit,
  draft,
  patchDraft,
  err,
  onHeroUpload,
  heroUploading = false,
  heroPreviewUrl = null,
}) {
  const landing = normalizeEventLanding(draft.landing ?? emptyEventLanding('meet'), {
    publicCopy: draft.publicCopy,
    slug: draft.slug,
  })

  function patchLanding(nextLanding) {
    const normalized = normalizeEventLanding(nextLanding, {
      publicCopy: draft.publicCopy,
      slug: draft.slug,
    })
    const publicCopy = {
      ...(draft.publicCopy ?? {}),
      publicTitle: normalized.slots.heroTitle,
      heroLead: normalized.slots.heroLead,
      ctaLabel: normalized.slots.ctaLabel,
      inscriptionMark: normalized.slots.inscriptionMark,
      inscriptionNote: normalized.slots.inscriptionNote,
    }
    patchDraft({
      ...draft,
      landing: normalized,
      publicCopy,
    })
  }

  function patchTemplate(templateId) {
    patchLanding({
      ...landing,
      templateId,
    })
  }

  function patchTheme(themeId) {
    patchLanding({
      ...landing,
      themeId,
    })
  }

  function patchSlot(key, value) {
    patchLanding({ ...landing, slots: { ...landing.slots, [key]: value } })
  }

  return (
    <fieldset className="admin-event-form__landing">
      <legend>
        <LayoutTemplate size={13} aria-hidden />
        {t('admin.eventEditor.landingLegend')}
      </legend>
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingHint')}</p>

      <AdminFilterChipGroup
        compact
        disabled={!canEdit}
        id="event-landing-template"
        label={t('admin.eventEditor.landingTemplateLabel')}
        value={landing.templateId}
        onChange={patchTemplate}
        options={[
          ['meet', t('admin.eventEditor.landingTemplateMeet')],
          ['editorial', t('admin.eventEditor.landingTemplateEditorial')],
          ['submission', t('admin.eventEditor.landingTemplateSubmission')],
        ]}
      />

      <p className="admin-event-form__section-note">
        {landing.templateId === 'editorial'
          ? t('admin.eventEditor.landingTemplateEditorialHint')
          : landing.templateId === 'submission'
            ? t('admin.eventEditor.landingTemplateSubmissionHint')
            : t('admin.eventEditor.landingTemplateMeetHint')}
      </p>

      {landing.templateId === 'submission' ? (
        <>
          <label className="admin-event-form__toggle">
            <input
              checked={landing.publicVisible}
              className="admin-event-form__toggle-input"
              disabled={!canEdit}
              type="checkbox"
              onChange={(event) =>
                patchLanding({ ...landing, publicVisible: event.target.checked })
              }
            />
            <span className="admin-event-form__toggle-ui" aria-hidden />
            <span className="admin-event-form__toggle-copy">
              <strong>{t('admin.eventEditor.landingPublicVisibleTitle')}</strong>
              <small>{t('admin.eventEditor.landingPublicVisibleHint')}</small>
            </span>
          </label>

          <AdminFilterChipGroup
            compact
            disabled={!canEdit}
            id="event-landing-submission-phase"
            label={t('admin.eventEditor.landingSubmissionPhaseLabel')}
            value={landing.phase}
            onChange={(phase) => patchLanding({ ...landing, phase })}
            options={[
              ['coming_soon', t('admin.eventEditor.landingSubmissionPhaseComingSoon')],
              ['published', t('admin.eventEditor.landingSubmissionPhasePublished')],
            ]}
          />
          <p className="admin-event-form__section-note">
            {landing.phase === 'coming_soon'
              ? t('admin.eventEditor.landingSubmissionComingSoonHint')
              : t('admin.eventEditor.landingSubmissionPublishedHint')}
          </p>
        </>
      ) : null}

      <AdminFilterChipGroup
        compact
        disabled={!canEdit}
        id="event-landing-theme"
        label={t('admin.eventEditor.landingThemeLabel')}
        value={landing.themeId}
        onChange={patchTheme}
        options={EVENT_LANDING_THEMES.map((themeId) => [
          themeId,
          t(`admin.eventEditor.landingTheme_${themeId.replace(/-/g, '_')}`),
        ])}
      />
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingThemeHint')}</p>

      <SlotFields
        canEdit={canEdit}
        err={err}
        fields={HERO_FIELDS}
        landing={landing}
        patchSlot={patchSlot}
        t={t}
      />

      {onHeroUpload ? (
        <div className="admin-event-form__landing-hero">
          <p className="admin-event-form__section-note">{t('admin.eventEditor.landingHeroHint')}</p>
          {heroPreviewUrl || draft.heroImageUrl ? (
            <div className="admin-event-form__landing-hero-preview">
              <img alt="" height={180} src={heroPreviewUrl || draft.heroImageUrl} width={320} />
              <button
                type="button"
                className="admin-event-form__text-btn"
                disabled={!canEdit || heroUploading}
                onClick={() =>
                  patchLanding({
                    ...landing,
                    slots: { ...landing.slots, heroImagePath: '' },
                  })
                }
              >
                {t('admin.eventEditor.landingHeroRemove')}
              </button>
            </div>
          ) : null}
          <label className="admin-event-form__file">
            <span>{t('admin.eventEditor.landingHeroUpload')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit || heroUploading || !draft.slug}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onHeroUpload(file)
              }}
            />
          </label>
          {!draft.slug ? (
            <p className="admin-event-form__section-note">
              {t('admin.eventEditor.landingHeroNeedsSlug')}
            </p>
          ) : null}
        </div>
      ) : null}

      {['editorial', 'submission'].includes(landing.templateId) ? (
        <>
          <p className="admin-event-form__section-note">
            {t('admin.eventEditor.landingEditorialSlotsHint')}
          </p>
          <SlotFields
            canEdit={canEdit}
            err={err}
            fields={EDITORIAL_FIELDS}
            landing={landing}
            patchSlot={patchSlot}
            t={t}
          />
        </>
      ) : null}

      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingSeoHint')}</p>
      <SlotFields
        canEdit={canEdit}
        err={err}
        fields={SEO_FIELDS}
        landing={landing}
        patchSlot={patchSlot}
        t={t}
      />

      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingFaqHint')}</p>
      <SlotFields
        canEdit={canEdit}
        err={err}
        fields={FAQ_FIELDS}
        landing={landing}
        patchSlot={patchSlot}
        t={t}
      />
    </fieldset>
  )
}

/** Asegura que un patch de publicCopy también actualice landing.slots hero. */
export function patchDraftPublicCopy(draft, publicCopyPatch) {
  const publicCopy = { ...(draft.publicCopy ?? {}), ...publicCopyPatch }
  return {
    ...draft,
    publicCopy,
    landing: syncLandingSlotsFromPublicCopy(draft.landing, publicCopy),
  }
}
