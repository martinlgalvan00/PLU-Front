import manifest from '../data/rulebook/manifest.json'
import en from '../data/rulebook/en.json'
import es from '../data/rulebook/es.json'

const CONTENT_BY_LOCALE = { es, en }

const RULEBOOK_LOCALES = ['es', 'en']

/**
 * Devuelve la URL pública del PDF oficial para el locale pedido.
 * Si aún no hay PDF en ese idioma, usa el fallback del manifest.
 */
export function getRulebookPdfUrl(locale = 'es') {
  const direct = manifest.documents[locale]
  if (direct) return direct
  return manifest.documents[manifest.fallbackLocale]
}

/**
 * Lista de documentos PDF publicados (uno por idioma disponible).
 */
export function getRulebookDocuments() {
  return RULEBOOK_LOCALES.filter((locale) => manifest.documents[locale]).map((locale) => ({
    locale,
    url: manifest.documents[locale],
    download: CONTENT_BY_LOCALE[locale]?.download ?? CONTENT_BY_LOCALE.es.download,
  }))
}

/**
 * Contenido estructurado del reglamento para la página web.
 * El PDF sigue siendo la fuente legal; esto es un resumen navegable.
 */
export function getRulebookContent(locale = 'es') {
  const content = CONTENT_BY_LOCALE[locale] ?? CONTENT_BY_LOCALE.es
  const pdfLocale = manifest.documents[locale] ? locale : manifest.fallbackLocale

  return {
    manifest,
    documents: getRulebookDocuments().map((doc) => ({
      ...doc,
      isPreferred: doc.locale === locale,
    })),
    pdfUrl: getRulebookPdfUrl(locale),
    pdfLocale,
    download: content.download,
    summary: content.summary,
    chapters: content.chapters,
    weightClasses: content.weightClasses,
    ageDivisions: content.ageDivisions,
  }
}
