/**
 * Layout de la landing "Constructor" — PLU ARG
 *
 * Una landing armada por bloques, al estilo de un editor de páginas: el staff
 * ordena, oculta y agrega bloques, y elige los colores del evento. El layout
 * vive en `rules.landing.layout`:
 *
 *   {
 *     blocks:  [{ id, type, visible, props? }],   // orden = orden de lectura
 *     palette: { accent?, action?, background? },  // hex #rrggbb
 *     motion:  'none' | 'soft' | 'bold' | 'depth'  // ver eventLandingMotion.js
 *   }
 *
 * Hay dos familias de bloques:
 *   - integrados (`CORE_BLOCK_TYPES`): leen datos del evento (fecha, grilla,
 *     pesajes, mapa…) o los textos de `landing.slots`. Uno por tipo.
 *   - propios (`CUSTOM_BLOCK_TYPES`): texto, imagen y botón con contenido en
 *     `props`. Se pueden agregar varios.
 *
 * Sin HTML libre: todo contenido es texto plano con tope de largo y los links
 * están acotados a `https://` o rutas internas. Los límites espejan la RPC
 * `staff_merge_event_landing_layout` y los esquemas Zod.
 */

import { normalizeLandingMotion } from './eventLandingMotion.js'
import { normalizeLandingPalette } from './eventLandingPalette.js'

export const LANDING_BLOCK_LIMITS = Object.freeze({
  maxBlocks: 24,
  id: 40,
  eyebrow: 60,
  title: 120,
  body: 1200,
  label: 40,
  href: 300,
  alt: 140,
  caption: 200,
  path: 200,
  video: 300,
  /** Fotos de una galería y logos de sponsors (`path1`…). */
  galleryImages: 6,
  sponsorLogos: 8,
})

/**
 * Bloques integrados, en el orden con el que se arma una landing nueva.
 * `surfaceKey`: módulo de `publicSurface` que además gobierna el dato público
 * (p. ej. la grilla). `locked`: no se puede ocultar ni sacar de la primera
 * posición. `fields`: slots de `landing.slots` que edita el bloque.
 */
export const CORE_BLOCK_TYPES = Object.freeze({
  hero: { surfaceKey: null, locked: true, fields: ['heroTitle', 'heroLead', 'ctaLabel'] },
  facts: { surfaceKey: null, locked: false, fields: [] },
  countdown: { surfaceKey: 'countdown', locked: false, fields: [] },
  experience: {
    surfaceKey: 'experience',
    locked: false,
    fields: ['experienceTitle', 'experienceBody'],
  },
  categories: {
    surfaceKey: 'categories',
    locked: false,
    fields: ['categoriesTitle', 'categoriesBody'],
  },
  schedule: { surfaceKey: 'schedule', locked: false, fields: [] },
  weighIns: { surfaceKey: 'weighIns', locked: false, fields: [] },
  location: {
    surfaceKey: 'location',
    locked: false,
    fields: ['locationTitle', 'locationBody'],
  },
  tickets: { surfaceKey: 'tickets', locked: false, fields: [] },
  livestream: { surfaceKey: 'livestream', locked: false, fields: [] },
  calendar: { surfaceKey: 'calendar', locked: false, fields: [] },
  faq: {
    surfaceKey: 'faq',
    locked: false,
    fields: [
      'faq1Question',
      'faq1Answer',
      'faq2Question',
      'faq2Answer',
      'faq3Question',
      'faq3Answer',
    ],
  },
  materials: { surfaceKey: null, locked: false, fields: [] },
})

/** `path1`…`pathN`: las fotos de una galería o los logos de sponsors. */
function numberedPaths(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`path${index + 1}`, 'path']))
}

/**
 * Props que acepta cada bloque propio, con su tope de largo. Son planas (texto
 * por clave) a propósito: la RPC las valida clave por clave con el mismo tope.
 */
export const CUSTOM_BLOCK_TYPES = Object.freeze({
  text: { eyebrow: 'eyebrow', title: 'title', body: 'body' },
  image: { path: 'path', alt: 'alt', caption: 'caption' },
  cta: { title: 'title', body: 'body', label: 'label', href: 'href' },
  gallery: { title: 'title', caption: 'caption', ...numberedPaths(6) },
  sponsors: { title: 'title', ...numberedPaths(8) },
  video: { title: 'title', body: 'body', video: 'video' },
  map: { title: 'title', body: 'body', href: 'href' },
})

/** Claves de imagen de un bloque propio (`path`, `path1`…), en orden. */
export function customBlockImageKeys(type) {
  const props = CUSTOM_BLOCK_TYPES[type]
  if (!props) return []
  return Object.entries(props)
    .filter(([, limitKey]) => limitKey === 'path')
    .map(([key]) => key)
}

/** La URL derivada de cada imagen: `path` → `url`, `path3` → `url3`. */
export function imageUrlKey(pathKey) {
  return pathKey.replace(/^path/, 'url')
}

export const CORE_BLOCK_ORDER = Object.freeze(Object.keys(CORE_BLOCK_TYPES))

export const isCoreBlockType = (type) => Object.hasOwn(CORE_BLOCK_TYPES, type)
export const isCustomBlockType = (type) => Object.hasOwn(CUSTOM_BLOCK_TYPES, type)

const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._()+/-]+$/

/** Sin `trim`: ver `clipSlot` en `eventLanding.js`. Se recorta al guardar. */
function clip(value, max) {
  return String(value ?? '').slice(0, max)
}

/** `https://…` o ruta interna (`/calendario`). Nada de `javascript:` ni `//host`. */
export function isSafeLandingHref(href) {
  const value = String(href ?? '').trim()
  if (!value) return true
  if (value.length > LANDING_BLOCK_LIMITS.href) return false
  if (/^https:\/\/[^\s]+$/i.test(value)) return true
  return /^\/(?!\/)[^\s]*$/.test(value)
}

const VIDEO_PATTERNS = [
  [/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{6,20})/i, 'youtube'],
  [/^https:\/\/(?:www\.)?youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,20})/i, 'youtube'],
  [/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{6,20})/i, 'youtube'],
  [/^https:\/\/(?:www\.)?vimeo\.com\/(\d{5,12})/i, 'vimeo'],
]

function parseLandingVideo(url) {
  const value = String(url ?? '').trim()
  for (const [pattern, provider] of VIDEO_PATTERNS) {
    const match = value.match(pattern)
    if (match) return { provider, id: match[1] }
  }
  return null
}

/** Solo YouTube o Vimeo por `https://`: es lo único que se embebe. Vacío vale. */
export function isSafeLandingVideoUrl(url) {
  const value = String(url ?? '').trim()
  if (!value) return true
  return value.length <= LANDING_BLOCK_LIMITS.video && parseLandingVideo(value) !== null
}

/**
 * URL del reproductor embebido. YouTube va por `youtube-nocookie` y Vimeo con
 * `dnt=1`: nadie queda rastreado por abrir la landing.
 */
export function landingVideoEmbedUrl(url) {
  const video = parseLandingVideo(url)
  if (!video) return null
  return video.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${video.id}`
    : `https://player.vimeo.com/video/${video.id}?dnt=1`
}

/** Portada del video para mostrar antes de cargar el reproductor (solo YouTube la expone sin API). */
export function landingVideoPoster(url) {
  const video = parseLandingVideo(url)
  return video?.provider === 'youtube' ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null
}

/**
 * "Cómo llegar": el link cargado o, si no hay, la búsqueda de la dirección en
 * Google Maps. Sin dirección ni link no hay a dónde mandar.
 */
export function landingMapHref({ href, body } = {}) {
  const link = String(href ?? '').trim()
  if (link && isSafeLandingHref(link)) return link
  const address = String(body ?? '').trim()
  if (!address) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function isSafeLandingImagePath(path) {
  const value = String(path ?? '').trim()
  if (!value) return true
  return (
    value.length <= LANDING_BLOCK_LIMITS.path &&
    !value.includes('..') &&
    SAFE_PATH_PATTERN.test(value)
  )
}

function normalizeCustomProps(type, raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const props = {}
  for (const [key, limitKey] of Object.entries(CUSTOM_BLOCK_TYPES[type])) {
    props[key] = clip(source[key], LANDING_BLOCK_LIMITS[limitKey])
  }
  // El link se conserva tal cual se escribe (si no, no se podría tipear `https://`
  // letra por letra); el panel marca el inválido y `layoutPayloadForMerge` lo
  // descarta al guardar. Las rutas de imagen no se tipean: se sanean de entrada.
  // La URL de cada imagen la resuelve el servidor desde su ruta (bucket
  // público): se conserva para renderizar, pero nunca se guarda.
  for (const pathKey of customBlockImageKeys(type)) {
    if (!isSafeLandingImagePath(props[pathKey])) props[pathKey] = ''
    const urlKey = imageUrlKey(pathKey)
    const url = source[urlKey]
    if (props[pathKey] && typeof url === 'string' && /^https:\/\//i.test(url)) props[urlKey] = url
  }
  return props
}

/** @returns {{ id: string, type: string, visible: boolean, props?: object } | null} */
export function normalizeLandingBlock(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = String(raw.type ?? '')
  if (!isCoreBlockType(type) && !isCustomBlockType(type)) return null
  const id = isCoreBlockType(type)
    ? type
    : String(raw.id ?? '')
        .trim()
        .toLowerCase()
  // Los integrados usan su tipo como id (`weighIns` incluido): el patrón de
  // minúsculas es para los ids que elige el staff en los bloques propios.
  if (!isCoreBlockType(type) && !BLOCK_ID_PATTERN.test(id)) return null
  const locked = isCoreBlockType(type) && CORE_BLOCK_TYPES[type].locked
  const block = { id, type, visible: locked ? true : raw.visible !== false }
  if (isCustomBlockType(type)) block.props = normalizeCustomProps(type, raw.props)
  return block
}

/** Landing nueva: todos los bloques integrados, en su orden natural. */
export function defaultLandingBlocks() {
  return CORE_BLOCK_ORDER.map((type) => ({ id: type, type, visible: true }))
}

/**
 * Normaliza la lista: descarta lo desconocido o repetido, fuerza la portada
 * primera y visible, y respeta el tope. Sin bloques válidos cae al layout por
 * defecto, así una landing vacía nunca queda en blanco.
 */
export function normalizeLandingBlocks(raw) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const blocks = []
  for (const item of list) {
    const block = normalizeLandingBlock(item)
    if (!block || seen.has(block.id)) continue
    seen.add(block.id)
    blocks.push(block)
    if (blocks.length >= LANDING_BLOCK_LIMITS.maxBlocks) break
  }
  if (blocks.length === 0) return defaultLandingBlocks()
  const heroIndex = blocks.findIndex((block) => block.type === 'hero')
  if (heroIndex === -1) {
    blocks.unshift({ id: 'hero', type: 'hero', visible: true })
    if (blocks.length > LANDING_BLOCK_LIMITS.maxBlocks) blocks.pop()
  } else if (heroIndex > 0) {
    blocks.unshift(...blocks.splice(heroIndex, 1))
  }
  return blocks
}

// ---------------------------------------------------------------- layout

export function normalizeLandingLayout(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    blocks: normalizeLandingBlocks(source.blocks),
    palette: normalizeLandingPalette(source.palette),
    motion: normalizeLandingMotion(source.motion),
  }
}

/**
 * Payload para la RPC: sin `url` (derivada) y sin campos desconocidos. Solo el
 * Constructor guarda bloques; el resto de las plantillas guarda solo la paleta.
 */
export function layoutPayloadForMerge(layout, { templateId = 'builder' } = {}) {
  const normalized = normalizeLandingLayout(layout)
  if (templateId !== 'builder') {
    return { blocks: [], palette: normalized.palette, motion: normalized.motion }
  }
  return {
    blocks: normalized.blocks.map((block) => {
      if (!block.props) return { id: block.id, type: block.type, visible: block.visible }
      // Solo las claves del tipo: las URL derivadas (`url`, `url3`) no se guardan.
      const props = Object.fromEntries(
        Object.keys(CUSTOM_BLOCK_TYPES[block.type] ?? {}).map((key) => [
          key,
          String(block.props[key] ?? '').trim(),
        ]),
      )
      if ('href' in props && !isSafeLandingHref(props.href)) props.href = ''
      if ('video' in props && !isSafeLandingVideoUrl(props.video)) props.video = ''
      return { id: block.id, type: block.type, visible: block.visible, props }
    }),
    palette: normalized.palette,
    motion: normalized.motion,
  }
}

/**
 * Suma `props.url` a los bloques de imagen a partir de su `path` en el bucket.
 * La URL es derivada (el bucket es público): nunca se guarda, se resuelve al leer.
 * @param {object} rules `rules` del evento
 * @param {(path: string) => string | null} resolveUrl
 */
export function withLandingBlockImageUrls(rules, resolveUrl) {
  const blocks = rules?.landing?.layout?.blocks
  const hasImage = (block) =>
    customBlockImageKeys(block?.type).some((pathKey) => block.props?.[pathKey])
  if (!Array.isArray(blocks) || !blocks.some(hasImage)) return rules
  return {
    ...rules,
    landing: {
      ...rules.landing,
      layout: {
        ...rules.landing.layout,
        blocks: blocks.map((block) => {
          if (!hasImage(block)) return block
          const props = { ...block.props }
          for (const pathKey of customBlockImageKeys(block.type)) {
            if (props[pathKey]) props[imageUrlKey(pathKey)] = resolveUrl(props[pathKey])
          }
          return { ...block, props }
        }),
      },
    },
  }
}

// ------------------------------------------------------- operaciones puras

/** Id nuevo para un bloque propio: `text-2`, `image-3`… sin repetir. */
export function nextCustomBlockId(blocks, type) {
  const taken = new Set(blocks.map((block) => block.id))
  for (let n = 1; n <= LANDING_BLOCK_LIMITS.maxBlocks + 1; n += 1) {
    const id = `${type}-${n}`
    if (!taken.has(id)) return id
  }
  return `${type}-${taken.size + 1}`
}

export function addCustomBlock(blocks, type) {
  if (!isCustomBlockType(type) || blocks.length >= LANDING_BLOCK_LIMITS.maxBlocks) return blocks
  return normalizeLandingBlocks([
    ...blocks,
    {
      id: nextCustomBlockId(blocks, type),
      type,
      visible: true,
      props: normalizeCustomProps(type, {}),
    },
  ])
}

export function removeBlock(blocks, id) {
  const block = blocks.find((item) => item.id === id)
  // Los integrados no se borran (se ocultan): así siempre se pueden recuperar.
  if (!block || !isCustomBlockType(block.type)) return blocks
  return blocks.filter((item) => item.id !== id)
}

/** Mueve un bloque `delta` posiciones (la portada queda siempre primera). */
export function moveBlock(blocks, id, delta) {
  const from = blocks.findIndex((block) => block.id === id)
  if (from === -1 || blocks[from].type === 'hero') return blocks
  const to = Math.min(Math.max(from + delta, 1), blocks.length - 1)
  if (to === from) return blocks
  const next = [...blocks]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export function setBlockVisible(blocks, id, visible) {
  return blocks.map((block) =>
    block.id === id && !(isCoreBlockType(block.type) && CORE_BLOCK_TYPES[block.type].locked)
      ? { ...block, visible: Boolean(visible) }
      : block,
  )
}

export function patchBlockProps(blocks, id, patch) {
  return normalizeLandingBlocks(
    blocks.map((block) =>
      block.id === id && block.props ? { ...block, props: { ...block.props, ...patch } } : block,
    ),
  )
}
