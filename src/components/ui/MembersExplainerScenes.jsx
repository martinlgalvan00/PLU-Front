import {
  BadgeCheck,
  CalendarDays,
  Check,
  CreditCard,
  IdCard,
  Landmark,
  UserRound,
} from 'lucide-react'
import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_EASE } from '../../motion/tokens.ts'
import '../../styles/components/members-explainer.css'

const ease = MOTION_EASE.out
const spring = { type: 'spring', stiffness: 320, damping: 20 }

/* Guion de cada escena (segundos). Cada tramo arranca cuando termina el
   anterior, así se lee como un video: aparece la pantalla, pasa algo, y queda
   el resultado. */

const rise = (delay = 0) => ({
  off: { opacity: 0, y: 14 },
  on: { opacity: 1, y: 0, transition: { duration: 0.5, ease, delay } },
})

const grow = (delay = 0, to = 1) => ({
  off: { scaleX: 0 },
  on: { scaleX: to, transition: { duration: 0.7, ease, delay } },
})

const pop = (delay = 0) => ({
  off: { scale: 0, opacity: 0 },
  on: { scale: 1, opacity: 1, transition: { ...spring, delay } },
})

/** Marco común: pantalla grafito con barra superior y paso actual. */
function Screen({ children, index, total, label }) {
  return (
    <div className="explainer-screen">
      <div className="explainer-screen__bar" aria-hidden>
        <span className="explainer-screen__brand">PLU ARG</span>
        <span className="explainer-screen__step">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>
      <p className="explainer-screen__label">{label}</p>
      <div className="explainer-screen__body">{children}</div>
    </div>
  )
}

/** 1 · Creás tu cuenta: tres datos que se completan y el botón que se presiona. */
function AccountScene({ mp }) {
  const rows = [
    { Icon: UserRound, fill: 0.78 },
    { Icon: IdCard, fill: 0.58 },
    { Icon: CalendarDays, fill: 0.42 },
  ]
  const rowAt = (i) => 0.5 + i * 0.7

  return (
    <div className="explainer-form">
      {rows.map(({ Icon, fill }, i) => (
        <div key={i} className="explainer-form__row">
          <m.span className="explainer-chip" variants={rise(rowAt(i) - 0.2)} {...mp}>
            <Icon size={16} aria-hidden />
          </m.span>
          <span className="explainer-form__field">
            <m.i variants={grow(rowAt(i), fill)} {...mp} className="explainer-form__fill" />
          </span>
          <m.span
            className="explainer-form__tick"
            variants={pop(rowAt(i) + 0.55)}
            {...mp}
            aria-hidden
          >
            <Check size={12} strokeWidth={3} />
          </m.span>
        </div>
      ))}
      <m.span
        className="explainer-form__button"
        variants={{
          off: { opacity: 0, y: 12, scale: 1 },
          on: {
            opacity: 1,
            y: 0,
            scale: [1, 1, 0.95, 1],
            transition: { duration: 1, ease, delay: 2.7, times: [0, 0.5, 0.75, 1] },
          },
        }}
        {...mp}
      />
    </div>
  )
}

/** 2 · Pagás online: elegís cómo pagar, se procesa y queda acreditado. */
function PaymentScene({ mp, price }) {
  const { t } = useI18n()

  return (
    <div className="explainer-pay">
      {price ? (
        <m.p className="explainer-pay__total" variants={rise(0.2)} {...mp}>
          <span>{t('account.membership.priceLabel')}</span>
          <strong>{price}</strong>
        </m.p>
      ) : null}
      <div className="explainer-pay__methods">
        <m.span className="explainer-method explainer-method--picked" variants={rise(0.5)} {...mp}>
          <CreditCard size={18} aria-hidden />
          {t('pages.members.explainer.methodCard')}
          <m.i
            className="explainer-method__ring"
            variants={{
              off: { opacity: 0, scale: 1.06 },
              on: { opacity: 1, scale: 1, transition: { duration: 0.4, ease, delay: 1.3 } },
            }}
            {...mp}
          />
        </m.span>
        <m.span className="explainer-method" variants={rise(0.7)} {...mp}>
          <Landmark size={18} aria-hidden />
          {t('pages.members.explainer.methodTransfer')}
        </m.span>
      </div>
      <div className="explainer-pay__progress" aria-hidden>
        <m.i variants={grow(1.8, 1)} {...mp} />
      </div>
      <m.p className="explainer-pay__done" variants={pop(2.7)} {...mp}>
        <BadgeCheck size={20} aria-hidden />
        {t('pages.members.explainer.paid')}
      </m.p>
    </div>
  )
}

/* QR decorativo: tres marcas de esquina + módulos fijos. No es escaneable ni
   representa ningún dato real; es la ilustración de "tu credencial con QR". */
const QR_SIZE = 9
const QR_ON = new Set([
  '0,0',
  '0,1',
  '0,2',
  '1,0',
  '1,2',
  '2,0',
  '2,1',
  '2,2',
  '0,6',
  '0,7',
  '0,8',
  '1,6',
  '1,8',
  '2,6',
  '2,7',
  '2,8',
  '6,0',
  '6,1',
  '6,2',
  '7,0',
  '7,2',
  '8,0',
  '8,1',
  '8,2',
  '0,4',
  '1,4',
  '3,3',
  '3,5',
  '4,1',
  '4,3',
  '4,4',
  '4,6',
  '4,7',
  '5,2',
  '5,4',
  '5,5',
  '5,8',
  '3,7',
  '6,5',
  '6,7',
  '7,4',
  '7,6',
  '8,4',
  '8,5',
  '8,7',
  '2,4',
  '5,6',
  '7,8',
])

/** 3 · Quedás activo con QR: se compone la credencial y se enciende el estado. */
function CredentialScene({ mp }) {
  const { t } = useI18n()
  const cells = []
  for (let r = 0; r < QR_SIZE; r += 1) {
    for (let c = 0; c < QR_SIZE; c += 1) {
      if (QR_ON.has(`${r},${c}`)) cells.push({ r, c })
    }
  }

  return (
    <div className="explainer-card">
      <m.div className="explainer-card__qr" variants={rise(0.2)} {...mp} aria-hidden>
        {cells.map(({ r, c }) => (
          <m.i
            key={`${r}-${c}`}
            style={{ gridRow: r + 1, gridColumn: c + 1 }}
            variants={{
              off: { scale: 0, opacity: 0 },
              on: {
                scale: 1,
                opacity: 1,
                transition: { duration: 0.28, ease, delay: 0.6 + (r + c) * 0.07 },
              },
            }}
            {...mp}
          />
        ))}
        <m.span
          className="explainer-card__scan"
          variants={{
            off: { opacity: 0, y: '0%' },
            on: {
              opacity: [0, 1, 1, 0],
              y: ['0%', '0%', '100%', '100%'],
              transition: { duration: 1.2, ease: 'linear', delay: 2.3, times: [0, 0.1, 0.9, 1] },
            },
          }}
          {...mp}
        />
      </m.div>
      <div className="explainer-card__meta">
        <m.span className="explainer-card__line" variants={grow(0.5, 1)} {...mp} aria-hidden />
        <m.span
          className="explainer-card__line explainer-card__line--short"
          variants={grow(0.7, 1)}
          {...mp}
          aria-hidden
        />
        <m.span className="explainer-card__status" variants={pop(3.6)} {...mp}>
          <BadgeCheck size={16} aria-hidden />
          {t('account.membership.statusActive')}
        </m.span>
      </div>
    </div>
  )
}

/**
 * Escena animada de un paso de la afiliación. Se reproduce cuando `play` pasa
 * a true (al montarse en el escenario o al entrar en viewport) y queda en el
 * estado final. Reduced motion / tier low: estado final directo, sin animar.
 */
export default function ExplainerScene({ index, step, total, play, price }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  // Sin `initial` Motion arrancaría ya en el estado final: se fija en 'off' para
  // que el paso se reproduzca; en modo quieto se monta directo en 'on'.
  const mp = { initial: still ? false : 'off', animate: still || play ? 'on' : 'off' }
  const Scene = [AccountScene, PaymentScene, CredentialScene][index] ?? AccountScene

  return (
    <Screen index={index} total={total} label={step.title}>
      <div className="explainer-scene" data-still={still ? 'true' : undefined}>
        <Scene mp={mp} price={price} />
      </div>
    </Screen>
  )
}
