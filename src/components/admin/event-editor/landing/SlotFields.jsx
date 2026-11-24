import { EVENT_LANDING_SLOT_LIMITS } from '../../../../lib/eventLanding.js'
import { FormField } from '../parts.jsx'

/** Cada campo de slot: etiqueta i18n, tope y si es de varias líneas. */
export const SLOT_FIELDS = {
  heroTitle: { labelKey: 'publicTitleField' },
  heroLead: { labelKey: 'heroLeadField' },
  ctaLabel: { labelKey: 'ctaLabelField' },
  experienceTitle: { labelKey: 'landingExperienceTitleField' },
  experienceBody: { labelKey: 'landingExperienceBodyField', multiline: true },
  categoriesTitle: { labelKey: 'landingCategoriesTitleField' },
  categoriesBody: { labelKey: 'landingCategoriesBodyField', multiline: true },
  locationTitle: { labelKey: 'landingLocationTitleField' },
  locationBody: { labelKey: 'landingLocationBodyField', multiline: true },
  metaTitle: { labelKey: 'landingMetaTitleField' },
  metaDescription: { labelKey: 'landingMetaDescriptionField', multiline: true },
  ...Object.fromEntries(
    [1, 2, 3].flatMap((n) => [
      [
        `faq${n}Question`,
        { labelKey: 'landingFaqQuestionField', labelParams: { n }, limit: 'faq1Question' },
      ],
      [
        `faq${n}Answer`,
        {
          labelKey: 'landingFaqAnswerField',
          labelParams: { n },
          limit: 'faq1Answer',
          multiline: true,
        },
      ],
    ]),
  ),
}

export const SEO_FIELD_KEYS = ['metaTitle', 'metaDescription']

export const HERO_SLOT_TO_PUBLIC_COPY = {
  heroTitle: 'publicTitle',
  heroLead: 'heroLead',
  ctaLabel: 'ctaLabel',
}

export function SlotFields({ keys, landing, canEdit, err, patchSlot, t }) {
  return keys.map((key) => {
    const field = SLOT_FIELDS[key]
    const fieldId = `event-landing-${key}`
    const errorKey =
      HERO_SLOT_TO_PUBLIC_COPY[key] != null
        ? `publicCopy.${HERO_SLOT_TO_PUBLIC_COPY[key]}`
        : `landing.slots.${key}`
    const common = {
      id: fieldId,
      name: `landing.slots.${key}`,
      'data-field': `landing.slots.${key}`,
      maxLength: EVENT_LANDING_SLOT_LIMITS[field.limit ?? key],
      value: landing.slots[key] ?? '',
      disabled: !canEdit,
      onChange: (event) => patchSlot(key, event.target.value),
    }
    return (
      <FormField
        key={key}
        htmlFor={fieldId}
        label={t(`admin.eventEditor.${field.labelKey}`, field.labelParams)}
        error={err(errorKey)}
      >
        {field.multiline ? <textarea {...common} rows={3} /> : <input {...common} type="text" />}
      </FormField>
    )
  })
}
