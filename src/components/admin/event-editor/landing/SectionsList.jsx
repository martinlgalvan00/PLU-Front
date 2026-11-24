import { ChevronDown } from 'lucide-react'
import {
  isLandingSectionVisible,
  landingSectionContent,
} from '../../../../lib/eventLandingSections.js'
import { normalizeEventPublicSurface } from '../../../../lib/eventPublicSurface.js'
import { patchPublicSurface } from '../draftPatches.js'
import { HERO_SLOT_TO_PUBLIC_COPY, SlotFields } from './SlotFields.jsx'
import ToggleRow from './ToggleRow.jsx'

/** Claves i18n del título de cada sección (portada e inscripción no son módulos públicos). */
const OWN_TITLE_KEY = {
  hero: 'landingSectionHeroTitle',
  inscription: 'landingSectionInscriptionTitle',
}

function sectionTextKeys(section) {
  const titleKey =
    OWN_TITLE_KEY[section.id] ??
    `publicSurface${section.id.charAt(0).toUpperCase()}${section.id.slice(1)}Title`
  return {
    title: `admin.eventEditor.${titleKey}`,
    hint: `admin.eventEditor.${titleKey.replace(/Title$/, 'Hint')}`,
  }
}

/** Claves de error de los campos de una sección (los del hero viven en `publicCopy`). */
function sectionErrorKeys(section) {
  return [
    ...section.fields.map((key) =>
      HERO_SLOT_TO_PUBLIC_COPY[key] != null
        ? `publicCopy.${HERO_SLOT_TO_PUBLIC_COPY[key]}`
        : `landing.slots.${key}`,
    ),
    ...(section.copyFields ?? []).map((key) => `publicCopy.${key}`),
  ]
}

function contentSummary(t, { filled, total }, visible) {
  const base =
    total === 0
      ? t('admin.eventEditor.landingSectionContent')
      : filled > 0
        ? t('admin.eventEditor.landingSectionContentCount', { filled, total })
        : t('admin.eventEditor.landingSectionContentDefault')
  return visible ? base : `${base} · ${t('admin.eventEditor.landingSectionHiddenNote')}`
}

/**
 * Landing con plantilla fija (meet, editorial, submission): cada sección de la
 * página pública con su interruptor y los textos que la alimentan. Ocultar una
 * sección no borra sus textos.
 *
 * `extras` trae los cuerpos que no son solo slots de texto: la imagen de la
 * portada y los textos del cupo.
 */
export default function SectionsList({
  t,
  canEdit,
  err,
  draft,
  patchDraft,
  landing,
  patchSlot,
  sections,
  extras,
  hint,
}) {
  const surface = normalizeEventPublicSurface(draft.publicSurface)

  return (
    <fieldset className="admin-event-form__landing-sections">
      <legend>{t('admin.eventEditor.landingSectionsLegend')}</legend>
      <p className="admin-event-form__section-note">{hint}</p>
      <ul className="admin-event-form__landing-section-list">
        {sections.map((section, index) => {
          const visible = isLandingSectionVisible(section, surface)
          const extra = extras[section.id] ?? null
          const hasBody = section.fields.length > 0 || Boolean(extra)
          const keys = sectionTextKeys(section)
          const title = t(keys.title)
          const sectionHint = t(keys.hint)
          const hasError = sectionErrorKeys(section).some((key) => err(key))

          return (
            <li
              key={section.id}
              className={`admin-event-form__landing-section${visible ? '' : ' is-hidden'}`}
              data-section={section.id}
            >
              {section.surfaceKey ? (
                <ToggleRow
                  checked={visible}
                  disabled={!canEdit}
                  hint={sectionHint}
                  title={title}
                  onChange={(checked) =>
                    patchDraft(patchPublicSurface(draft, section.surfaceKey, checked))
                  }
                />
              ) : (
                <div className="admin-event-form__landing-section-head">
                  <strong>{title}</strong>
                  <small>{sectionHint}</small>
                </div>
              )}

              {hasBody ? (
                <details
                  className="admin-event-form__landing-details"
                  open={hasError || index === 0 ? true : undefined}
                >
                  <summary>
                    <span>
                      {contentSummary(
                        t,
                        landingSectionContent(section, landing, draft.publicCopy),
                        visible,
                      )}
                    </span>
                    <ChevronDown size={14} aria-hidden />
                  </summary>
                  <div className="admin-event-form__landing-details-body">
                    <SlotFields
                      canEdit={canEdit}
                      err={err}
                      keys={section.fields}
                      landing={landing}
                      patchSlot={patchSlot}
                      t={t}
                    />
                    {extra}
                  </div>
                </details>
              ) : null}
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
