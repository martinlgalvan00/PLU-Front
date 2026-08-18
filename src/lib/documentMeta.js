/**
 * documentMeta.js — PLU ARG
 *
 * Titles, description y Open Graph por vista pública.
 * Sin React Router: se aplica al cambiar `view` en App.
 */

import { buildPublicViewPath } from './publicViewPaths.js'
import { env } from '../config/env.js'

const DEFAULT_IMAGE = '/brand/plu-argentina-emblem.png'

/**
 * @param {string} view
 * @param {(key: string, params?: Record<string, string>) => string} t
 * @param {{ eventTitle?: string, eventSlug?: string }} [context]
 */
export function buildDocumentMeta(view, t, context = {}) {
  const isEventDetail = view === 'events' && context.eventSlug
  const key = isEventDetail ? 'seo.views.eventDetail' : `seo.views.${view}`
  const fallbackKey = 'seo.views.home'
  const title = t(`${key}.title`, context)
  const description = t(`${key}.description`, context)
  const resolvedTitle =
    title && !title.startsWith('seo.') ? title : t(`${fallbackKey}.title`, context)
  const resolvedDescription =
    description && !description.startsWith('seo.')
      ? description
      : t(`${fallbackKey}.description`, context)

  const path = isEventDetail ? `/evento/${context.eventSlug}` : (buildPublicViewPath(view) ?? '/')
  const origin = env.appUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const url = origin ? `${origin}${path === '/' ? '' : path}` : path

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    url,
    image: DEFAULT_IMAGE,
    path,
  }
}

function ensureMeta(selector, attributes) {
  if (typeof document === 'undefined') return null
  let node = document.head.querySelector(selector)
  if (!node) {
    node = document.createElement('meta')
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value))
    document.head.appendChild(node)
  }
  return node
}

function setMetaByName(name, content) {
  const node = ensureMeta(`meta[name="${name}"]`, { name })
  if (node) node.setAttribute('content', content)
}

function setMetaByProperty(property, content) {
  const node = ensureMeta(`meta[property="${property}"]`, { property })
  if (node) node.setAttribute('content', content)
}

function setCanonical(url) {
  if (typeof document === 'undefined') return
  let link = document.head.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

/**
 * @param {{ title: string, description: string, url: string, image: string }} meta
 */
export function applyDocumentMeta(meta) {
  if (typeof document === 'undefined') return

  document.title = meta.title
  setMetaByName('description', meta.description)
  setMetaByProperty('og:type', 'website')
  setMetaByProperty('og:site_name', 'PLU Argentina')
  setMetaByProperty('og:title', meta.title)
  setMetaByProperty('og:description', meta.description)
  setMetaByProperty('og:url', meta.url)
  setMetaByProperty(
    'og:image',
    meta.image.startsWith('http') ? meta.image : `${env.appUrl || ''}${meta.image}`,
  )
  setMetaByName('twitter:card', 'summary_large_image')
  setMetaByName('twitter:title', meta.title)
  setMetaByName('twitter:description', meta.description)
  setCanonical(meta.url)
}
