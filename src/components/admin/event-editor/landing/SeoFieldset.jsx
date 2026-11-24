import { SEO_FIELD_KEYS, SlotFields } from './SlotFields.jsx'

/** Título y descripción para buscadores y redes. Vacío usa los del sitio. */
export default function SeoFieldset({ t, canEdit, err, landing, patchSlot }) {
  return (
    <fieldset className="admin-event-form__landing-seo">
      <legend>{t('admin.eventEditor.landingSeoLegend')}</legend>
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingSeoHint')}</p>
      <SlotFields
        canEdit={canEdit}
        err={err}
        keys={SEO_FIELD_KEYS}
        landing={landing}
        patchSlot={patchSlot}
        t={t}
      />
    </fieldset>
  )
}
