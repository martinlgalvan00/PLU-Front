import { ArrowRight, Share2 } from 'lucide-react'
import { m } from 'motion/react'
import StatusPill from './StatusPill.jsx'
import EventShareCard from './EventShareCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider'
import { MOTION_EASE } from '../../motion/tokens'
import MercadoPagoEmbeddedCheckout from './MercadoPagoEmbeddedCheckout.jsx'

/* Secuencia one-shot al montar (no whileInView: la pantalla ya está a la
   vista cuando aparece). La pieza entra como una sola composición y los
   bloques de apoyo la siguen — es el ritmo de una entrega, no cuatro cards
   animándose por separado. Bajo prefers-reduced-motion no se monta ningún
   nodo animado: ver `reducedMotion` más abajo. */
const SEQUENCE = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
}

const RISE = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: MOTION_EASE.out } },
}

const PIECE = {
  hidden: { opacity: 0, y: 22, scale: 0.975 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.62, ease: MOTION_EASE.cinematic },
  },
}

export default function RegisterMembershipConfirmation({
  order,
  memberCode,
  membershipExpiration,
  cardData,
  onNavigate,
  onOpenCard,
  onOpenTransfer,
  showCardAction = false,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const { tone } = getStatusMeta(order.status, t)
  const isActive = tone === 'success'
  const isManual = order.paymentMethod === 'manual_link'
  const isCashAtPitbull = order.manualPaymentChannel === 'cash_pitbull'
  const showCardPreview = showCardAction && Boolean(cardData)

  const nextStep = isManual
    ? t('pages.register.membershipNextStepManual')
    : t('pages.register.membershipNextStepMp')

  // Con reduced motion los mismos bloques se renderizan como divs planos:
  // misma jerarquía y mismo orden de lectura, sin transform ni opacidad.
  const Section = reducedMotion ? 'section' : m.section
  const Block = reducedMotion ? 'div' : m.div
  const sequenceProps = reducedMotion
    ? {}
    : { variants: SEQUENCE, initial: 'hidden', animate: 'visible' }
  const riseProps = reducedMotion ? {} : { variants: RISE }
  const pieceProps = reducedMotion ? {} : { variants: PIECE }

  return (
    <Section
      className="register-membership-confirmation"
      aria-labelledby="register-membership-confirmation-title"
      {...sequenceProps}
    >
      {/* El título de la pantalla ya vive en el intro de la ruta (aside en
          desktop, contexto en mobile). Acá solo queda el nombre accesible
          del bloque para que el aria-labelledby siga apuntando a algo. */}
      <h2 id="register-membership-confirmation-title" className="visually-hidden">
        {isActive
          ? t('pages.register.membershipConfirmedActiveTitle')
          : t('pages.register.membershipConfirmedPendingTitle')}
      </h2>

      {/* ── La pieza: la card real, no una miniatura decorativa ──
          Es el mismo componente que se descarga como PNG, así que lo que el
          socio ve acá es exactamente lo que va a subir. */}
      {showCardPreview ? (
        <Block className="register-membership-confirmation__piece" {...pieceProps}>
          <div className="register-membership-confirmation__piece-frame">
            <EventShareCard {...cardData} preview format="square" />
          </div>
          <button
            type="button"
            className="register-membership-confirmation__cta register-membership-confirmation__cta--primary"
            onClick={onOpenCard}
          >
            <Share2 size={16} aria-hidden />
            {t('pages.register.membershipShareCard')}
          </button>
        </Block>
      ) : (
        /* Sin card emitida (afiliación aún pendiente de acreditación) la
           credencial se muestra como ficha: mismo dato, sin prometer una
           pieza que todavía no existe. */
        <Block className="register-membership-confirmation__credential" {...pieceProps}>
          <span className="register-membership-confirmation__stripe" aria-hidden />
          <div className="register-membership-confirmation__credential-main">
            <div className="register-membership-confirmation__credential-meta">
              <span className="register-membership-confirmation__credential-label">
                {t('pages.register.membershipCredentialLabel')}
              </span>
              <strong className="register-membership-confirmation__credential-code">
                {memberCode ?? t('pages.register.membershipCredentialPendingCode')}
              </strong>
              <span className="register-membership-confirmation__credential-name">{order.athleteName}</span>
              {membershipExpiration && (
                <span className="register-membership-confirmation__credential-validity">
                  {t('shareCard.membershipValidUntil', { date: membershipExpiration })}
                </span>
              )}
            </div>
            <StatusPill value={order.status} />
          </div>
        </Block>
      )}

      {!isActive && (
        <Block className="register-membership-confirmation__next-inline" {...riseProps}>
          {nextStep}
        </Block>
      )}

      {order.paymentMethod === 'mercado_pago' && !isActive && (
        <Block {...riseProps}>
          <MercadoPagoEmbeddedCheckout order={order} />
        </Block>
      )}

      {isManual && !isActive && (
        <Block className="register-membership-confirmation__actions" {...riseProps}>
          <p className="register-membership-confirmation__manual">{t('pages.register.manualNote')}</p>
          {/* Sin esto la pantalla daba los datos bancarios y terminaba ahí:
              el comprobante solo se podía adjuntar entrando después a la
              cuenta, y Finanzas aprobaba sin evidencia. */}
          {isCashAtPitbull ? (
            <p className="register-membership-confirmation__manual">
              {t('pages.register.cashPitbullCreated')}
            </p>
          ) : order.paymentId && onOpenTransfer ? (
            <button
              type="button"
              className="register-membership-confirmation__cta register-membership-confirmation__cta--primary"
              onClick={onOpenTransfer}
            >
              {t('pages.register.transferOpen')}
            </button>
          ) : null}
        </Block>
      )}

      {/* Los datos administrativos cierran la pantalla: son necesarios para
          reclamar un pago, pero no son el momento. Antes venían antes de la
          acción principal y enfriaban la confirmación. */}
      <Block {...riseProps}>
        <dl className="register-membership-confirmation__ledger">
          <div>
            <dt>{t('pages.register.membershipReferenceLabel')}</dt>
            <dd><code>{order.reference}</code></dd>
          </div>
          <div>
            <dt>{t('pages.register.membershipAmountLabel')}</dt>
            <dd>{money(order.amount, locale)}</dd>
          </div>
        </dl>

        {onNavigate && (
          <button
            type="button"
            className="register-membership-confirmation__cta register-membership-confirmation__cta--ghost"
            onClick={() => onNavigate('profile')}
          >
            {isActive
              ? t('pages.register.membershipGoProfileCredential')
              : t('pages.register.membershipGoProfile')}
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </Block>
    </Section>
  )
}
