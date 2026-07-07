import * as en from './en.js'
import * as es from './es.js'

const PACKS = { es, en }

export function getContent(locale = 'es') {
  return PACKS[locale] ?? PACKS.es
}

export { es, en }
