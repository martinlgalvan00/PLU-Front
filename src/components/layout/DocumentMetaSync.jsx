import { useEffect } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { applyDocumentMeta, buildDocumentMeta } from '../../lib/documentMeta.js'

/**
 * Sincroniza title / description / OG con la vista pública activa.
 */
export default function DocumentMetaSync({ view, eventSlug = null, eventTitle = null }) {
  const { t, locale } = useI18n()

  useEffect(() => {
    const meta = buildDocumentMeta(view || 'home', t, {
      eventSlug: eventSlug || undefined,
      eventTitle: eventTitle || undefined,
    })
    applyDocumentMeta(meta)
  }, [view, eventSlug, eventTitle, t, locale])

  return null
}
