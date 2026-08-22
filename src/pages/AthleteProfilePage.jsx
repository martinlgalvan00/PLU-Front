import { useEffect, useRef, useState } from 'react'
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
import SecuritySection from './profile/SecuritySection.jsx'

export default function AthleteProfilePage({
  athlete,
  memberships,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
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

  // Home, Members, Pitbull y el aviso de inscripción mandan `membership`
  // acá: hay que abrir el tab aunque la cuenta ya estuviera montada.
  useEffect(() => {
    if (!initialTab) return
    setActiveTab(initialTab)
  }, [initialTab, tabNonce])

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

  const visibleTabIds = ACCOUNT_TAB_IDS
  // Los enlaces históricos a `account-offer` se redirigen a Torneos: ese tab
  // fue retirado y ninguna oferta generada por código puede renderizarse.
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
        onNavigateSection={setActiveTab}
        onNavigate={onNavigate}
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
        onNavigateSection={setActiveTab}
        checkoutAvailability={checkoutAvailability}
      />
    ),
    'account-history': (
      <HistorySection
        athleteRegistrations={athleteRegistrations}
        onNavigateSection={setActiveTab}
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
        onNavigateSection={setActiveTab}
        onNavigate={onNavigate}
      />
    ),
    'account-payments': (
      <PaymentsSection
        payments={athletePayments}
        onNavigateSection={setActiveTab}
        // Reintentar es volver a la pantalla que abre un cobro nuevo: la orden
        // vieja quedó cerrada y no se reabre. La afiliación y el combo salen de
        // Afiliación; una inscripción suelta, de Torneos.
        onRetryPayment={(payment) =>
          setActiveTab(
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
              onNavigateSection={setActiveTab}
            />
          </Reveal>
          <AccountNav
            activeId={resolvedTab}
            onChange={setActiveTab}
            visibleIds={visibleTabIds}
            attentionIds={navAttentionIds}
          />
        </aside>

        <div className="account-main" ref={mainRef}>
          <EmailVerificationBanner athlete={athlete} />
          <GateMembershipBanner
            pendingEvents={gatePendingRegistrations}
            onCompleteMembership={() => setActiveTab('account-membership')}
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
