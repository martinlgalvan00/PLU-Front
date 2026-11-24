import { useState } from 'react'
import { Eye, LayoutTemplate } from 'lucide-react'
import {
  eventLandingFaqItems,
  eventLandingFromEvent,
  eventLandingSeo,
} from '../../../lib/eventLanding.js'
import EventLandingPreviewDialog from './landing/PreviewDialog.jsx'
import { eventPublicTitle } from '../../../lib/eventPublicSurface.js'

/**
 * Miniatura de composición de la landing (no iframe): plantilla, hero, bloques
 * editoriales, FAQ y snippet SEO. Vive en el rail de Vista pública.
 */
export default function EventLandingCompositionPreview({ event, t }) {
  const landing = eventLandingFromEvent(event)
  const slots = landing.slots
  const seo = eventLandingSeo(event)
  const faqItems = eventLandingFaqItems(slots)
  const heroTitle = slots.heroTitle || eventPublicTitle(event) || event?.title || '—'
  const [previewOpen, setPreviewOpen] = useState(false)
  const isEditorial = landing.templateId === 'editorial'
  const isSubmission = landing.templateId === 'submission'

  const chapters = [
    slots.experienceTitle || slots.experienceBody
      ? { id: 'experience', label: slots.experienceTitle || t('admin.eventEditor.publicSurfaceExperienceTitle') }
      : null,
    slots.categoriesTitle || slots.categoriesBody
      ? { id: 'categories', label: slots.categoriesTitle || t('admin.eventEditor.publicSurfaceCategoriesTitle') }
      : null,
    slots.locationTitle || slots.locationBody
      ? { id: 'location', label: slots.locationTitle || t('admin.eventEditor.publicSurfaceLocationTitle') }
      : null,
  ].filter(Boolean)

  return (
    <div
      className={`admin-landing-compose admin-landing-compose--${landing.templateId}`}
      aria-label={t('admin.eventEditor.landingComposeAria')}
    >
      <header className="admin-landing-compose__hero">
        <span className="admin-landing-compose__template">
          <LayoutTemplate size={12} aria-hidden />
          {isEditorial
            ? t('admin.eventEditor.landingTemplateEditorial')
            : isSubmission
              ? t('admin.eventEditor.landingTemplateSubmission')
              : landing.templateId === 'builder'
                ? t('admin.eventEditor.landingTemplateBuilder')
                : t('admin.eventEditor.landingTemplateMeet')}
        </span>
        <strong className="admin-landing-compose__title">{heroTitle}</strong>
        {slots.heroLead ? <p className="admin-landing-compose__lead">{slots.heroLead}</p> : null}
        {slots.ctaLabel ? (
          <span className="admin-landing-compose__cta">{slots.ctaLabel}</span>
        ) : null}
      </header>

      {isEditorial && chapters.length > 0 ? (
        <ul className="admin-landing-compose__chapters">
          {chapters.map((chapter) => (
            <li key={chapter.id}>{chapter.label}</li>
          ))}
        </ul>
      ) : null}

      {faqItems.length > 0 ? (
        <div className="admin-landing-compose__faq">
          <p className="admin-landing-compose__section-label">{t('admin.eventEditor.landingFaqLegend')}</p>
          <ol>
            {faqItems.map((item) => (
              <li key={item.question}>
                <strong>{item.question}</strong>
                <span>{item.answer}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="admin-landing-compose__seo">
        <p className="admin-landing-compose__section-label">{t('admin.eventEditor.landingSeoPreview')}</p>
        <p className="admin-landing-compose__seo-title">{seo.title || '—'}</p>
        <p className="admin-landing-compose__seo-desc">
          {seo.description || t('admin.eventEditor.landingSeoEmpty')}
        </p>
      </div>

      <button
        type="button"
        className="admin-landing-compose__link"
        onClick={() => setPreviewOpen(true)}
      >
        <Eye size={13} aria-hidden />
        {t('admin.eventEditor.landingPreviewOpen')}
      </button>

      {previewOpen ? (
        <EventLandingPreviewDialog event={event} t={t} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </div>
  )
}
