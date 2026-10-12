import { m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import { money } from '../../lib/format.js'

/** Una sola marca por tarjeta, la más importante: agotado > edición limitada > pocas > destacado. */
function pickBadge(product, t) {
  if (!product.inStock) return { tone: 'muted', label: t('pages.shop.catalog.soldOut') }
  if (product.category === 'exclusive') {
    return { tone: 'gold', label: product.editionNote || t('pages.shop.catalog.limited') }
  }
  if (product.lowStock) return { tone: 'gold', label: t('pages.shop.catalog.lowStock') }
  if (product.featured) return { tone: 'ink', label: t('pages.shop.catalog.featured') }
  return null
}

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

/**
 * Tarjeta de producto: foto 4:5 que cambia a la segunda al apuntarla, nombre en
 * peso liviano y precio. Sin cajas ni sombras; toda la tarjeta abre el detalle.
 */
export default function ShopProductCard({ locale, onOpen, product, t }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const [cover, hover] = product.imageUrls ?? []
  const badge = pickBadge(product, t)
  const Item = still ? 'li' : m.li

  return (
    <Item className="shop-card" {...(still ? {} : { variants: cardVariants })}>
      <button
        type="button"
        className="shop-card__hit"
        onClick={() => onOpen(product)}
        aria-label={product.title}
      >
        <span className="shop-card__media" data-soldout={product.inStock ? undefined : 'true'}>
          {cover ? (
            <img className="shop-card__img" src={cover} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="shop-card__placeholder" aria-hidden>
              {t('pages.shop.catalog.noPhoto')}
            </span>
          )}
          {hover ? (
            <img
              className="shop-card__img shop-card__img--alt"
              src={hover}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}
          {badge ? (
            <span className={`shop-card__badge shop-card__badge--${badge.tone}`}>
              {badge.label}
            </span>
          ) : null}
        </span>
        <span className="shop-card__body">
          {product.event ? <span className="shop-card__kicker">{product.event.title}</span> : null}
          <span className="shop-card__title">{product.title}</span>
          <span className="shop-card__price">{money(product.price, locale)}</span>
        </span>
      </button>
    </Item>
  )
}
