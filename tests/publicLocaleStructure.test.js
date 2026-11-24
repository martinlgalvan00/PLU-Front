import { describe, expect, it } from 'vitest'
import es from '../src/i18n/locales/es.js'
import en from '../src/i18n/locales/en.js'
import { buildDocumentMeta } from '../src/lib/documentMeta.js'
import { translate } from '../src/i18n/translate.js'

/**
 * En inglés los textos de la landing Constructor y del cartel "en
 * construcción" habían quedado pegados dentro de `seo.views` en vez de
 * `pages`: la página pública en EN mostraba las claves crudas.
 */
describe('locales públicos', () => {
  it.each([
    ['es', es],
    ['en', en],
  ])('%s: eventBuilder y eventUnderConstruction viven en pages', (_, messages) => {
    expect(typeof messages.pages.eventBuilder?.register).toBe('string')
    expect(typeof messages.pages.eventUnderConstruction?.title).toBe('string')
    expect(messages.seo.views.eventBuilder).toBeUndefined()
    expect(messages.seo.views.eventUnderConstruction).toBeUndefined()
  })

  it.each([
    ['es', es],
    ['en', en],
  ])('%s: las vistas sin título propio no caen en el de la portada', (_, messages) => {
    const t = (key, params) => translate(messages, key, params)
    const home = buildDocumentMeta('home', t).title
    for (const view of ['staffApplication', 'competition', 'thanks']) {
      expect(buildDocumentMeta(view, t).title).not.toBe(home)
    }
  })
})
