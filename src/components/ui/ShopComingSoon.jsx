import { m } from 'motion/react'
import LaunchInterestForm from './LaunchInterestForm.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const ITEMS = ['one', 'two', 'three']

const stage = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const rise = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
  },
}

const rule = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
  },
}

/**
 * "Próximamente" de una sección sin productos publicados. Panel editorial
 * temático (light/dark) con una sola secuencia de entrada: línea dorada,
 * titular, lo que viene y el aviso por correo. Sin fechas, precios ni cupos
 * inventados: lo único que promete es el aviso. Si el catálogo no pudo
 * actualizarse, se dice sin tapar la invitación.
 */
export default function ShopComingSoon({ tab, stale, onRetry, t }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const key = `pages.shop.catalog.soon.${tab}`
  const Root = still ? 'div' : m.div
  const Item = still ? 'div' : m.div
  const ListItem = still ? 'li' : m.li
  const Rule = still ? 'span' : m.span
  const motionProps = (variants) => (still ? {} : { variants })

  return (
    <Root
      className="shop-soon"
      {...(still ? {} : { variants: stage, initial: 'hidden', animate: 'visible' })}
    >
      <Rule className="shop-soon__rule" aria-hidden {...motionProps(rule)} />

      <div className="shop-soon__copy">
        <Item {...motionProps(rise)}>
          <p className="shop-soon__badge">
            <span aria-hidden />
            {t('pages.shop.catalog.soon.badge')}
          </p>
        </Item>
        <Item {...motionProps(rise)}>
          <h3 className="shop-soon__title">{t(`${key}.title`)}</h3>
        </Item>
        <Item {...motionProps(rise)}>
          <p className="shop-soon__text">{t(`${key}.text`)}</p>
        </Item>
        {stale ? (
          <p className="shop-soon__stale" role="status">
            {t('pages.shop.catalog.soon.staleNote')}{' '}
            <button type="button" className="shop-link" onClick={onRetry}>
              {t('pages.shop.catalog.retry')}
            </button>
          </p>
        ) : null}
      </div>

      <div className="shop-soon__aside">
        <ul className="shop-soon__list" aria-label={t('pages.shop.catalog.soon.listLabel')}>
          {ITEMS.map((item) => (
            <ListItem key={item} {...motionProps(rise)}>
              {t(`${key}.${item}`)}
            </ListItem>
          ))}
        </ul>
        <Item {...motionProps(rise)}>
          <LaunchInterestForm source={`shop_${tab}`} />
        </Item>
      </div>
    </Root>
  )
}
