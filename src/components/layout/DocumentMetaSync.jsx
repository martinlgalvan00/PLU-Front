import { useEffect } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { applyDocumentMeta, buildDocumentMeta } from '../../lib/documentMeta.js'

/**
 * Sincroniza title / description / OG con la vista pública activa.
 */
export default function DocumentMetaSync({
  view,
  eventSlug = null,
  eventTitle = null,
  metaTitle = null,
  metaDescription = null,
  metaImage = null,
}) {
  const { t, locale } = useI18n()

  useEffect(() => {
    const meta = buildDocumentMeta(view || 'home', t, {
      eventSlug: eventSlug || undefined,
      eventTitle: eventTitle || undefined,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      metaImage: metaImage || undefined,
    })
    applyDocumentMeta(meta)
  }, [view, eventSlug, eventTitle, metaTitle, metaDescription, metaImage, t, locale])

  return null
}
