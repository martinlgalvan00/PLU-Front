import { useCallback, useEffect, useRef, useState } from 'react'
import '../styles/pages/design-phase2.css'
import '../styles/pages/account.css'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { getFeaturedEvent, getPitbullClassicEvent } from '../lib/eventNavigation.js'
import { findGatePendingRegistrations } from '../lib/gateAccess.js'
import { hasPlayedCredentialMerge } from '../lib/credentialMerge.js'
import {
  ACCOUNT_EVENTS_TAB,
  ACCOUNT_MEMBERSHIP_TAB,
  ACCOUNT_OFFER_TAB,
  ACCOUNT_TAB_IDS,
  DEFAULT_ACCOUNT_TAB,
} from '../lib/navigation.js'
import { isRegistrationAdmitted } from '../lib/status.js'
import { isPaymentActionable } from '../lib/paymentProgress.js'
import { isMembershipCurrent } from '../services/membershipService.js'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import Reveal from '../components/ui/Reveal.jsx'
import EmailVerificationBanner from '../components/ui/EmailVerificationBanner.jsx'
import GateMembershipBanner from '../components/ui/GateMembershipBanner.jsx'
import AccountNav from './profile/AccountNav.jsx'
import ProfileHero from './profile/ProfileHero.jsx'
import QrCredentialSection from './profile/QrCredentialSection.jsx'
import UpcomingEventsSection from './profile/UpcomingEventsSection.jsx'
import HistorySection from './profile/HistorySection.jsx'
import MembershipPurchaseSection from './profile/MembershipPurchaseSection.jsx'
import PaymentsSection from './profile/PaymentsSection.jsx'
import PersonalDataSection from './profile/PersonalDataSection.jsx'
import SecretBundleSection from './profile/SecretBundleSection.jsx'
import SecuritySection from './profile/SecuritySection.jsx'
import { fetchOfferUnlocks } from '../services/athleteApi.js'

export default function AthleteProfilePage({
  athlete,
  memberships,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  onStartOfferPayment,
  demoMode = false,
  onNavigate,
  onSelectEvent,
  onUpdateProfile,
  onUpdatePhoto,
  onRemovePhoto,
  payments = [],
  registrations,
  session,
  events = [],
  initialTab = DEFAULT_ACCOUNT_TAB,
  tabNonce = 0,
  checkoutAvailability = {},
}) {
  const [activeTab, setActiveTab] = useState(initialTab || DEFAULT_ACCOUNT_TAB)
  const mainRef = useRef(null)
  const isFirstTabRef = useRef(true)
  /**
   * Códigos-paquete canjeados por esta persona. Deciden dos cosas: si la ficha
   * existe en la cinta y qué muestra adentro.
   *
   * Se leen acá y no en la sección porque la cinta se dibuja antes que el panel:
   * pedirlo abajo dejaría la ficha apareciendo un frame después del resto de la
   * navegación. `null` es "todavía no sé" y no "no hay" — con `[]` la ficha
   * parpadearía al entrar directo desde un canje.
   */
  const [bundleOffers, setBundleOffers] = useState(null)

  // El panel entra desde el lado de la cinta por el que se movió el foco: hacia
  // adelante entra por la derecha, hacia atrás por la izquierda. No es adorno —
  // es lo único que ata el panel al tab que lo abrió. Antes todos los cambios
  // eran el mismo fade y la cinta y el contenido parecían dos cosas sueltas.
  //
  // La dirección se guarda junto al índice y no se recalcula contra "el índice
  // anterior": un segundo render del mismo tab (StrictMode, o cualquier cambio
  // de props) volvería a comparar el índice contra sí mismo y perdería la
  // dirección a mitad de la transición.
  const tabIndex = ACCOUNT_TAB_IDS.indexOf(activeTab)
  const swapRef = useRef({ index: tabIndex, direction: undefined })
  if (tabIndex >= 0 && tabIndex !== swapRef.current.index) {
    swapRef.current = {
      index: tabIndex,
      direction: swapRef.current.index >= 0 && tabIndex > swapRef.current.index ? 1 : -1,
    }
  }
  const swapDirection = swapRef.current.direction

  const athleteId = athlete?.id ?? null
  const athleteMemberships = athleteId
    ? memberships.filter((item) => item.athleteId === athleteId)
    : []
  const membership = athleteMemberships.find((item) => isMembershipCurrent(item))
  const storedMembership = membership ?? athleteMemberships[0]
  const athleteRegistrations = athleteId
    ? registrations.filter((item) => item.athleteId === athleteId)
    : []
  const athletePayments = athleteId ? payments.filter((item) => item.athleteId === athleteId) : []
  // La credencial ya se emite con el derecho habilitado por financiamiento
  // (afiliación 'activa', inscripción 'confirmada' — ver
  // athlete_confirm_manual_payment, 20260909100000): lo que la pantalla no
  // sabe todavía es que ese derecho sigue provisorio hasta que Finanzas
  // acredite. Se toma la orden financiada más próxima a vencer -- si hay más
  // de una abierta, es la que más urge -- y no revocada ni ya aprobada: una
  // vez que Finanzas acredita, el beneficio deja de ser condicional.
  const pendingFinancedPayment =
    athletePayments
      .filter(
        (item) =>
          item.financingAllowed &&
          item.financedEntitlementsAt &&
          !item.financedEntitlementsRevokedAt &&
          item.status !== 'aprobado',
      )
      .sort((a, b) => {
        const aDue = a.financedPaymentDueAt ? new Date(a.financedPaymentDueAt).getTime() : Infinity
        const bDue = b.financedPaymentDueAt ? new Date(b.financedPaymentDueAt).getTime() : Infinity
        return aDue - bDue
      })[0] ?? null
  // Cobro rechazado/vencido sin resolver: la ficha "Pagos" lo marca desde la
  // navegación para que se note sin tener que entrar a leer la lista.
  const paymentsNeedAttention = athletePayments.some((item) => isPaymentActionable(item.progress))
  const navAttentionIds = paymentsNeedAttention ? ['account-payments'] : []
  const availableEvents = (events.length ? events : UPCOMING_EVENTS).filter(
    (event) => event.status !== 'finalizado',
  )
  const nextEvent = availableEvents[0]
  const gateEvent =
    getPitbullClassicEvent(events.length ? events : UPCOMING_EVENTS) ??
    getFeaturedEvent(events.length ? events : UPCOMING_EVENTS)
  const gatePendingRegistrations = athleteId
    ? findGatePendingRegistrations(athleteRegistrations, {
        memberships: athleteMemberships,
        athleteId,
        events: availableEvents,
      })
    : []

  const hasAdmittedMeet = athleteRegistrations.some((item) => isRegistrationAdmitted(item.status))
  const membershipId = membership?.id ?? null

  /**
   * La ficha del paquete se relee cuando cambia un pago, no sólo al montar: el
   * estado del trámite —reservado, habilitado, acreditado— vive en la orden, y
   * declarar o diferir el pago dispara `plu:payment-updated`. Sin esto la ficha
   * seguía ofreciendo comprar algo que la persona acababa de comprar.
   *
   * Una lectura por vez (`bundleReadRef`): la ficha se pide al montar, al abrirla
   * y después de cada pago, y dos de esas pueden caer en el mismo commit — con
   * dos pedidos en vuelo gana el que vuelve último, que no es necesariamente el
   * más nuevo.
   */
  const bundleReadRef = useRef({ inFlight: false, alive: true })
  // `alive` se vuelve a prender al montar y no sólo al crear el ref: en
  // StrictMode el efecto corre, se limpia y vuelve a correr, así que un ref que
  // sólo se apaga quedaba apagado desde el primer ciclo — la lectura volvía del
  // servidor y ninguna respuesta se guardaba nunca. La ficha quedaba en
  // "Buscando tu paquete…" para siempre en desarrollo.
  useEffect(() => {
    bundleReadRef.current.alive = true
    return () => {
      bundleReadRef.current.alive = false
    }
  }, [])
  const reloadBundleOffers = useCallback(() => {
    if (!athleteId) {
      setBundleOffers([])
      return
    }
    if (bundleReadRef.current.inFlight) return
    bundleReadRef.current.inFlight = true
    void fetchOfferUnlocks()
      .then((offers) => {
        if (bundleReadRef.current.alive) setBundleOffers(offers)
      })
      .catch(() => {
        // Una ficha que no se pudo leer no rompe la cuenta: se comporta como si
        // no hubiera ningún código canjeado, que es el caso de casi todos.
        if (bundleReadRef.current.alive) setBundleOffers([])
      })
      .finally(() => {
        bundleReadRef.current.inFlight = false
      })
  }, [athleteId])

  useEffect(() => {
    reloadBundleOffers()
  }, [reloadBundleOffers])

  /**
   * Abrir una ficha. Todas menos una son estáticas; la del paquete puede no
   * existir todavía cuando alguien pide abrirla.
   *
   * El canje que la habilita no ocurre acá: pasa dentro del checkout de
   * Afiliación (y del de Inscripción), y el desbloqueo nace del lado del
   * servidor. La lectura hecha al montar la cuenta ya está vieja para ese
   * momento, así que el destino del canje caía en Torneos — la ficha existía,
   * el código estaba canjeado, y no había manera de llegar sin recargar la
   * página. Se vuelve a leer al abrirla, y mientras la respuesta no vuelve la
   * ficha se considera desconocida (`null`) y no inexistente.
   */
  const openTab = useCallback(
    (id) => {
      if (id === ACCOUNT_OFFER_TAB) {
        setBundleOffers((current) => (current?.length ? current : null))
        reloadBundleOffers()
      }
      setActiveTab(id)
    },
    [reloadBundleOffers],
  )

  /**
   * El cobro del paquete, con la relectura pegada al resultado.
   *
   * La orden recién creada es la que decide qué muestra la ficha — los datos de
   * la transferencia, el plazo, las dos maneras de cerrarla — y vive en el
   * `purchase` del payload, no en el estado local del formulario. Sin releer,
   * quien terminaba de confirmar volvía a ver el mismo formulario y no llegaba
   * nunca a los datos bancarios: el alta funcionaba y la pantalla no se movía.
   */
  const startBundlePayment = useCallback(
    async (input) => {
      const result = await onStartOfferPayment?.(input)
      if (result && !result.error) reloadBundleOffers()
      return result
    },
    [onStartOfferPayment, reloadBundleOffers],
  )

  // Home, Members, Pitbull y el aviso de inscripción mandan `membership`
  // acá: hay que abrir el tab aunque la cuenta ya estuviera montada. Pasa por
  // `openTab` y no por `setActiveTab` porque uno de esos destinos es la ficha
  // del paquete (`?section=codigo`, y el canje del checkout de Inscripción):
  // abrirla implica volver a leer qué códigos tiene esta persona.
  useEffect(() => {
    if (!initialTab) return
    openTab(initialTab)
    // `openTab` queda afuera a propósito: el efecto abre lo que pidió la
    // navegación, y volver a correrlo porque cambió la identidad del callback
    // devolvería al atleta a esa ficha después de haber tocado otra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, tabNonce])

  useEffect(() => {
    const onPaymentUpdated = () => reloadBundleOffers()
    window.addEventListener('plu:payment-updated', onPaymentUpdated)
    return () => window.removeEventListener('plu:payment-updated', onPaymentUpdated)
  }, [reloadBundleOffers])

  // Si la afiliación acaba de activarse y todavía no se vio el ritual de
  // fusión, saltamos al tab QR para mostrarlo (p.ej. tras pagar desde
  // Afiliación o volver desde el checkout).
  useEffect(() => {
    if (!athleteId || !membershipId || !hasAdmittedMeet) return
    if (hasPlayedCredentialMerge(athleteId, membershipId)) return
    setActiveTab('account-qr')
  }, [athleteId, hasAdmittedMeet, membershipId])

  // El panel se remonta por tab (key={activeTab} más abajo) pero la página
  // no reajusta el scroll: si el atleta venía leyendo un tab largo (p.ej.
  // Torneos) y tocaba otro más corto, quedaba con el scroll heredado y el
  // panel nuevo aparecía a mitad o al pie — "de abajo". Saltamos el primer
  // render (ese ya arranca arriba por el scrollTo(0) de App.jsx en el
  // cambio de vista) y sólo ajustamos en cambios de tab posteriores.
  useEffect(() => {
    if (isFirstTabRef.current) {
      isFirstTabRef.current = false
      return
    }
    mainRef.current?.scrollIntoView({ block: 'start' })
  }, [activeTab])

  if (!athlete) return null

  // La ficha del paquete es condicional: existe sólo para quien canjeó un
  // código de combo. Una pestaña vacía anunciando algo que no está sería peor
  // que no tenerla, así que se saca de la cinta cuando no hay nada que mostrar.
  const hasBundle = (bundleOffers?.length ?? 0) > 0
  // …pero "todavía no sé" no es "no hay". Mientras la lectura está en vuelo y
  // el destino pedido es justamente esa ficha, se la mantiene: es el caso del
  // canje recién hecho, donde el desbloqueo existe del lado del servidor y esta
  // pantalla todavía no lo leyó. Sin esta espera el atleta caía en Torneos y la
  // ficha quedaba inalcanzable hasta recargar la página.
  const bundleAnswerPending = bundleOffers === null && activeTab === ACCOUNT_OFFER_TAB
  const visibleTabIds =
    hasBundle || bundleAnswerPending
      ? ACCOUNT_TAB_IDS
      : ACCOUNT_TAB_IDS.filter((id) => id !== ACCOUNT_OFFER_TAB)
  // Un enlace a `account-offer` sin ningún paquete canjeado —ya con la lectura
  // resuelta— cae en Torneos en vez de abrir una ficha que no tiene contenido.
  const resolvedTab = visibleTabIds.includes(activeTab)
    ? activeTab
    : activeTab === ACCOUNT_OFFER_TAB
      ? ACCOUNT_EVENTS_TAB
      : DEFAULT_ACCOUNT_TAB

  const tabContent = {
    'account-qr': (
      <QrCredentialSection
        athlete={athlete}
        membership={membership}
        latestMembership={storedMembership}
        registrations={athleteRegistrations}
        pendingFinancedPayment={pendingFinancedPayment}
        onNavigateSection={openTab}
        onNavigate={onNavigate}
      />
    ),
    'account-offer': (
      <SecretBundleSection
        athlete={athlete}
        offers={bundleOffers ?? []}
        pending={bundleAnswerPending}
        onStartOfferPayment={startBundlePayment}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
      />
    ),
    'account-events': (
      <UpcomingEventsSection
        availableEvents={availableEvents}
        athleteRegistrations={athleteRegistrations}
        membership={membership}
        onNavigate={onNavigate}
        onSelectEvent={onSelectEvent}
        athlete={athlete}
        onNavigateSection={openTab}
        checkoutAvailability={checkoutAvailability}
        pendingFinancedPayment={pendingFinancedPayment}
      />
    ),
    'account-history': (
      <HistorySection
        athleteRegistrations={athleteRegistrations}
        onNavigateSection={openTab}
      />
    ),
    'account-membership': (
      <MembershipPurchaseSection
        athlete={athlete}
        membership={storedMembership}
        onActivateMembership={onActivateMembership}
        onCancelMembership={onCancelMembership}
        onStartMembershipPayment={onStartMembershipPayment}
        demoMode={demoMode}
        gateEvent={gateEvent}
        events={availableEvents}
        onSelectEvent={onSelectEvent}
        checkoutAvailability={checkoutAvailability}
        onNavigateSection={openTab}
        onNavigate={onNavigate}
        pendingFinancedPayment={pendingFinancedPayment}
      />
    ),
    'account-payments': (
      <PaymentsSection
        payments={athletePayments}
        onNavigateSection={openTab}
        // Reintentar es volver a la pantalla que abre un cobro nuevo: la orden
        // vieja quedó cerrada y no se reabre. La afiliación y el combo salen de
        // Afiliación; una inscripción suelta, de Torneos.
        onRetryPayment={(payment) =>
          openTab(
            payment.conceptType === 'registration' ? ACCOUNT_EVENTS_TAB : ACCOUNT_MEMBERSHIP_TAB,
          )
        }
      />
    ),
    'account-personal-data': (
      <PersonalDataSection
        athlete={athlete}
        onUpdateProfile={onUpdateProfile}
        onUpdatePhoto={onUpdatePhoto}
        onRemovePhoto={onRemovePhoto}
      />
    ),
    'account-security': <SecuritySection session={session} />,
  }

  return (
    <main className="page page--design account-page--design">
      <div className="account-dashboard">
        <aside className="account-sidebar">
          <Reveal>
            <ProfileHero
              athlete={athlete}
              membership={membership}
              athleteRegistrations={athleteRegistrations}
              nextEvent={nextEvent}
              onNavigateSection={openTab}
            />
          </Reveal>
          <AccountNav
            activeId={resolvedTab}
            onChange={openTab}
            visibleIds={visibleTabIds}
            attentionIds={navAttentionIds}
          />
        </aside>

        <div className="account-main" ref={mainRef}>
          <EmailVerificationBanner athlete={athlete} />
          <GateMembershipBanner
            pendingEvents={gatePendingRegistrations}
            onCompleteMembership={() => openTab(ACCOUNT_MEMBERSHIP_TAB)}
          />
          {/* `sync` y no `wait`: el panel saliente sigue montado mientras entra
              el nuevo, así el contenedor no colapsa un frame y la página no da
              un salto de scroll en los tabs altos. Los dos paneles comparten la
              celda de la grilla (ver .account-sections en account.css). */}
          <div className="account-sections">
            <MotionContentSwap
              className="account-tab-panel"
              swapKey={resolvedTab}
              direction={swapDirection}
              mode="sync"
            >
              {tabContent[resolvedTab]}
            </MotionContentSwap>
          </div>
        </div>
      </div>
    </main>
  )
}
