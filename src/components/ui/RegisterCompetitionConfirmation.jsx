import { ArrowRight, ImageDown } from 'lucide-react'
import { m } from 'motion/react'
import ConfirmationSeal from './ConfirmationSeal.jsx'
import EventShareCard from './EventShareCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { useMotionConfig } from '../../motion/MotionProvider'
import { MOTION_EASE } from '../../motion/tokens'

/**
 * RegisterCompetitionConfirmation — PLU ARG
 *
 * El cierre de una inscripción a meet: el atleta pagó, la organización lo
 * admitió, su lugar está tomado. Hermano de `RegisterMembershipConfirmation`
 * y a propósito con la misma gramática — es la misma federación confirmando,
 * y los dos trámites terminan igual: sello, pieza, acción, papeles.
 *
 * ── Por qué existe ──
 * La inscripción confirmada no tenía cierre propio. El acuse vivía al pie de
 * `register-status--settle`, la lista de datos de la orden que se renderiza en
 * el aside de desktop y en el contexto mobile, y la columna principal quedaba
 * con la barra de total y nada más. Eso producía cuatro problemas medibles en
 * el render:
 *
 *   · El dato administrativo (referencia, pastilla de estado) se leía ANTES
 *     que el hecho. La jerarquía estaba invertida respecto de la afiliación.
 *   · La card nunca se veía: había un botón que prometía una pieza que el
 *     atleta no había visto nunca. En afiliación la pieza está a la vista.
 *   · La ráfaga salía del sello, y el sello estaba en una columna angosta
 *     contra el borde izquierdo: en 390px la mitad del papel volaba fuera
 *     del viewport.
 *   · En 1440 la confirmación ocupaba una caja de ~340px y el 60% restante
 *     de la pantalla quedaba vacío.
 *
 * ── Orden de lectura ──
 * 1. El sello: entraste. Es la respuesta a lo que la persona vino a hacer.
 * 2. La card real, no una miniatura decorativa: es el mismo componente que se
 *    descarga como PNG, así que lo que se ve acá es exactamente lo que se va
 *    a subir a redes.
 * 3. Una sola acción principal: descargar y compartir.
 * 4. Referencia e importe al cierre. Son necesarios para reclamar un pago,
 *    pero no son el momento.
 *
 * ── Motion ──
 * Una secuencia one-shot al montar (no `whileInView`: la pantalla ya está a la
 * vista cuando aparece), sólo transform y opacity. Bajo
 * `prefers-reduced-motion` no se monta un solo nodo animado: los mismos
 * bloques se renderizan como divs planos, con la misma jerarquía y el mismo
 * orden de lectura. La ráfaga de papel la decide `ConfirmationSeal` y su
 * puerta es `shouldCelebrate`, que ya respeta la preferencia.
 *
 * @param {object} props
 * @param {object} props.order         Orden visible y ya admitida.
 * @param {object} [props.cardData]    Props de `EventShareCard`. Sin card
 *   emitida el bloque no promete una pieza que no existe.
 * @param {string} [props.slotLabel]   División y categoría del atleta, ya
 *   armadas ("Open · Clásico"). Es lo único que el sello agrega al intro: la
 *   fecha y la sede ya viven ahí y repetirlas al lado era el mismo dato dos
 *   veces en el mismo viewport. Sin división ni categoría el sello va sin
 *   detalle antes que con un renglón vacío.
 * @param {(route: string, params?: object) => void} [props.onNavigate]
 * @param {() => void} [props.onOpenCard] Abre el modal de descarga/compartir.
 */
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

export default function RegisterCompetitionConfirmation({
  order,
  cardData = null,
  slotLabel = '',
  onNavigate,
  onOpenCard,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const showCardPreview = Boolean(cardData)

  const Section = reducedMotion ? 'section' : m.section
  const Block = reducedMotion ? 'div' : m.div
  const sequenceProps = reducedMotion
    ? {}
    : { variants: SEQUENCE, initial: 'hidden', animate: 'visible' }
  const riseProps = reducedMotion ? {} : { variants: RISE }
  const pieceProps = reducedMotion ? {} : { variants: PIECE }

  return (
    <Section
      className="register-confirmation register-confirmation--competition"
      aria-labelledby="register-confirmation-competition-title"
      {...sequenceProps}
    >
      {/* El título de la pantalla ya vive en el intro de la ruta (aside en
          desktop, contexto en mobile). Acá sólo queda el nombre accesible del
          bloque para que el aria-labelledby siga apuntando a algo. */}
      <h2 id="register-confirmation-competition-title" className="visually-hidden">
        {t('pages.register.competitionCardEyebrow')}
      </h2>

      {/* ── El sello ──
          Este bloque sólo se monta con la inscripción ya admitida
          (`registrationAdmitted` en RegisterPage), así que el sello siempre
          festeja un hecho cerrado y nunca una orden pendiente.

          `celebrate` vive acá y en ningún otro lugar de la pantalla: el acuse
          del aside se retiró justamente para que la federación festeje una
          sola vez y el papel salga del sello que la persona está mirando. */}
      <Block className="register-confirmation__seal" {...riseProps}>
        {/* Sin detalle inventado: `registrationAdmitted` significa que la orden
            está paga y el lugar tomado, NO que la puerta vaya a marcar ingreso
            —para eso hace falta además la afiliación vigente cuando el evento
            la exige (`isGateAccessReady`)—, así que el sello no promete un
            ingreso habilitado. Dice lo que es cierto: el lugar es suyo, en la
            categoría que eligió. */}
        <ConfirmationSeal
          variant="registration"
          celebrate
          eyebrow={t('pages.register.sealRegistrationEyebrow')}
          title={t('pages.register.competitionCardEyebrow')}
          detail={
            slotLabel ? t('pages.register.sealRegistrationSlot', { slot: slotLabel }) : undefined
          }
        />
      </Block>

      {/* ── La pieza: la card real, no una miniatura decorativa ──
          Es el mismo componente que se descarga como PNG, así que lo que el
          atleta ve acá es exactamente lo que va a subir. */}
      {showCardPreview ? (
        <Block className="register-confirmation__piece" {...pieceProps}>
          <div className="register-confirmation__piece-frame">
            <EventShareCard {...cardData} preview format="square" />
          </div>
          <p className="register-confirmation__piece-lead">
            {t('pages.register.competitionCardDesc')}
          </p>
          <button
            type="button"
            className="register-confirmation__cta register-confirmation__cta--primary"
            onClick={onOpenCard}
            id="register-generate-card-btn"
          >
            <ImageDown size={16} aria-hidden />
            {t('pages.register.competitionShareCard')}
          </button>
        </Block>
      ) : null}

      {/* Los datos administrativos cierran la pantalla: son necesarios para
          reclamar un pago, pero no son el momento. */}
      <Block {...riseProps}>
        <dl className="register-confirmation__ledger">
          <div>
            <dt>{t('pages.register.membershipReferenceLabel')}</dt>
            <dd>
              <code>{order.reference}</code>
            </dd>
          </div>
          <div>
            <dt>{t('pages.register.membershipAmountLabel')}</dt>
            <dd>{money(order.amount, locale)}</dd>
          </div>
        </dl>

        {onNavigate ? (
          <button
            type="button"
            className="register-confirmation__cta register-confirmation__cta--ghost"
            onClick={() => onNavigate('profile', { tab: 'account-events' })}
          >
            {t('pages.register.competitionGoMyEvents')}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
      </Block>
    </Section>
  )
}
