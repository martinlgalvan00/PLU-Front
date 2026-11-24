import { useMemo, useRef } from 'react'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { CORE_BLOCK_TYPES, isCoreBlockType } from '../lib/eventLandingLayout.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { normalizeEventPublicSurface } from '../lib/eventPublicSurface.js'
import useRevealOnScroll from '../hooks/useRevealOnScroll.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { LANDING_BLOCK_COMPONENTS } from '../components/events/landing-blocks/index.js'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/event-builder-landing.css'
import '../styles/pages/event-landing-motion.css'

/**
 * ¿Se dibuja el bloque? Su propio interruptor y, en los integrados con módulo
 * público (grilla, pesajes, FAQ…), también el switch de `publicSurface`: así lo
 * que se apaga en el panel no se muestra ni se consulta.
 */
export function isLandingBlockShown(block, surface) {
  if (!block.visible) return false
  if (!isCoreBlockType(block.type)) return true
  const key = CORE_BLOCK_TYPES[block.type].surfaceKey
  return key ? surface[key] !== false : true
}

/**
 * Landing "Constructor": una página armada por bloques en el orden, con los
 * colores y los textos que eligió el staff. Cada bloque es un componente propio
 * (`components/events/landing-blocks`); esta página solo los ordena.
 */
export default function EventBuilderLandingPage({
  eventSlug,
  events = [],
  onNavigate,
  onSelectEvent,
  checkoutAvailability = {},
}) {
  const { locale, t } = useI18n()
  const event = events.find((item) => item.slug === eventSlug) ?? null
  const landing = useMemo(() => eventLandingFromEvent(event), [event])
  const surface = useMemo(() => normalizeEventPublicSurface(event?.publicSurface), [event])
  const paletteStyle = useMemo(() => landingPaletteStyle(landing.layout), [landing.layout])
  const blocks = landing.layout?.blocks ?? []
  const motion = normalizeLandingMotion(landing.layout?.motion)
  const mainRef = useRef(null)
  useRevealOnScroll(mainRef, motion, blocks)
  const registrationEnabled = checkoutAvailability.registrationEnabled !== false
  const ctx = { event, landing, surface, locale, t, onNavigate, onSelectEvent, registrationEnabled }

  return (
    <main
      ref={mainRef}
      className="page event-builder event-landing-theme"
      data-event-theme={landing.themeId}
      data-motion={motion}
      style={paletteStyle}
    >
      {blocks
        .filter((block) => isLandingBlockShown(block, surface))
        .map((block) => {
          const Block = LANDING_BLOCK_COMPONENTS[block.type]
          return Block ? <Block key={block.id} block={block} ctx={ctx} /> : null
        })}
    </main>
  )
}
