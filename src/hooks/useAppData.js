import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createSecurityUserRequest, loginRequest, logoutRequest, meRequest, oauthSessionRequest } from '../lib/api.js'
import { DEFAULT_FORM } from '../lib/constants.js'
import { canEdit } from '../lib/roles.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import {
  approveAthletePaymentOrder as approveAthletePaymentOrderRequest,
  checkInRegistration as checkInRegistrationRequest,
  createCompetitionRegistration as createCompetitionRegistrationRequest,
  createMembershipOrder as createMembershipOrderRequest,
  fetchAdminAthleteData,
  fetchAthleteSession,
  fetchAthleteSnapshot,
  logoutAthleteSession,
  loginAthleteSession,
  registerAthlete as registerAthleteRequest,
  registerAthletePhoto as registerAthletePhotoRequest,
  updateAthleteProfile as updateAthleteProfileRequest,
} from '../services/athleteApi.js'
import { uploadAthletePhoto } from '../services/athletePhotoService.js'
import {
  demoAthletes,
  demoMemberships,
  demoPayments,
  demoRegistrations,
  isDemoSession,
} from '../services/demoAthleteSeed.js'
import { notifyAffiliationStarted, notifyPaymentApproved, notifyRegistrationConfirmed } from '../services/emailService.js'
import {
  createPreference as createPreferenceRequest,
} from '../services/paymentService.js'
import { readStorage, writeStorage } from '../services/storageService.js'
import {
  approveTicketOrder as approveTicketOrderRequest,
  checkInTicket as checkInTicketRequest,
  createTicketOrder as createTicketOrderRequest,
  listPendingTicketOrders as listPendingTicketOrdersRequest,
  listTicketsForEvent as listTicketsForEventRequest,
  mapApiTicket,
  redeemTicketAddon as redeemTicketAddonRequest,
  registerTicketPaymentProof as registerTicketPaymentProofRequest,
} from '../services/ticketApi.js'
import { uploadTicketPaymentProof } from '../services/ticketProofService.js'
import { createUser, getInitialUsers, updateUserRole } from '../services/userService.js'
import {
  buildAdminExportRows,
  buildPluUsaExportRows,
  createCsv,
} from '../services/exportService.js'
import {
  buildPendingActions,
  buildDashboardOverview,
  buildRecentActivity,
  getAdminNavBadges,
  getAthleteAuditLogs,
} from '../services/adminService.js'
import {
  createAdminEvent,
  fetchAdminEvents,
  fetchPublishedEvents,
  getInitialAdminEvents,
  updateAdminEvent,
} from '../services/eventAdminService.js'
import { enrichMemberships } from '../services/membershipService.js'

// El login de esta app corre sobre Prisma/Auth0, nunca sobre supabase.auth
// -- sin esto, auth.uid() es siempre null en el navegador y ninguna RPC
// protegida por is_admin()/can_check_in() puede autorizar a nadie, ni
// siquiera a un admin real logueado (ver server/services/supabaseAuthBridge.js).
// El backend genera un magic-link de un solo uso al loguear staff; acá lo
// canjeamos para tener una sesión real de Supabase Auth en el cliente.
async function establishSupabaseSession(supabaseAuth) {
  if (!supabaseAuth || !isSupabaseConfigured || !supabase) return

  try {
    await supabase.auth.verifyOtp({
      email: supabaseAuth.email,
      token: supabaseAuth.tokenHash,
      type: 'magiclink',
    })
  } catch (error) {
    console.warn('No se pudo establecer la sesión de Supabase.', error)
  }
}

function buildAuditLog(action, entityType, entityId, actor, metadata) {
  return { id: `audit-${Date.now()}`, action, entityType, entityId, actor, createdAt: new Date().toISOString(), metadata }
}

export function useAppData() {
  const oauth = usePluOAuth()
  const storedData = useMemo(() => readStorage(), [])
  const [session, setSessionState] = useState(null)
  const sessionRef = useRef(null)
  const setSession = useCallback((next) => {
    sessionRef.current = next
    setSessionState(next)
  }, [])
  const getSession = useCallback(() => sessionRef.current, [])
  // Atletas/membresías/inscripciones/pagos viven en Supabase (ver
  // athleteApi.js) -- estos arrays son un cache de lo último fetcheado.
  // Arrancan con el seed de demo porque las 4 cuentas de acceso rápido de
  // la pantalla de login nunca pasan por el backend real (ver
  // demoAthleteSeed.js); una sesión real los reemplaza por datos remotos
  // en el efecto de refreshAthleteData de más abajo.
  const [athletes, setAthletes] = useState(demoAthletes)
  const [memberships, setMemberships] = useState(demoMemberships)
  const [registrations, setRegistrations] = useState(demoRegistrations)
  const [payments, setPayments] = useState(demoPayments)
  // Las entradas viven en Postgres, no en localStorage â€” este estado es
  // solo un cache de lo Ãºltimo que se creÃ³/consultÃ³ vÃ­a la API real.
  const [tickets, setTickets] = useState([])
  const [pendingTicketOrders, setPendingTicketOrders] = useState([])
  const [pendingTicketOrdersLoading, setPendingTicketOrdersLoading] = useState(false)
  const [pendingTicketOrdersError, setPendingTicketOrdersError] = useState(null)
  const [createdOrder, setCreatedOrder] = useState(() => storedData?.createdOrder ?? null)
  const [auditLogs, setAuditLogs] = useState(() => storedData?.auditLogs ?? [])
  const [adminEvents, setAdminEvents] = useState(() => getInitialAdminEvents(storedData?.adminEvents))
  const [users, setUsers] = useState(() => getInitialUsers(storedData?.users))
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })
  const membershipAttemptRef = useRef(null)
  const registrationAttemptRef = useRef(null)
  const ticketAttemptRef = useRef(null)

  const role = session?.role || null
  const userCanEdit = canEdit(role)

  // athletes/memberships/registrations/payments ya no se persisten acá --
  // viven en Supabase (athleteApi.js); las cuentas de demo (que sí siguen
  // siendo locales) tampoco necesitan persistirse entre recargas.
  useEffect(() => {
    writeStorage({ createdOrder, auditLogs, adminEvents, users })
  }, [createdOrder, auditLogs, adminEvents, users])

  useEffect(() => {
    let active = true
    fetchPublishedEvents()
      .then((remoteEvents) => {
        if (!active || remoteEvents.length === 0) return
        setAdminEvents((current) => remoteEvents.map((event) => ({
          ...current.find((item) => item.slug === event.slug),
          ...event,
        })))
      })
      .catch((error) => console.warn('No se pudieron cargar los eventos publicados.', error))
    return () => { active = false }
  }, [])

  const refreshAthleteData = useCallback(async () => {
    if (!session || isDemoSession(session)) return

    try {
      if (session.role === 'athlete_plu') {
        const snapshot = await fetchAthleteSnapshot(session.athleteId)
        setAthletes(snapshot.athlete ? [snapshot.athlete] : [])
        setMemberships(snapshot.memberships)
        setRegistrations(snapshot.registrations)
        setPayments(snapshot.payments)
      } else {
        const [data, remoteEvents] = await Promise.all([fetchAdminAthleteData(), fetchAdminEvents()])
        setAthletes(data.athletes)
        setMemberships(data.memberships)
        setRegistrations(data.registrations)
        setPayments(data.payments)
        setAdminEvents(remoteEvents)
      }
    } catch (error) {
      console.error('refreshAthleteData:', error)
    }
  }, [session])

  useEffect(() => {
    refreshAthleteData()
  }, [refreshAthleteData])

  useEffect(() => {
    const refreshAfterPayment = () => { void refreshAthleteData() }
    window.addEventListener('plu:payment-updated', refreshAfterPayment)
    return () => window.removeEventListener('plu:payment-updated', refreshAfterPayment)
  }, [refreshAthleteData])

  useEffect(() => {
    let active = true

    meRequest()
      .then(({ user }) => {
        if (active) setSession(user)
      })
      .catch(async (error) => {
        if (!active) return

        // API caída o sin red: seguimos sin sesión (demo login sigue andando).
        if (!error?.status || error.status === 0) {
          if (import.meta.env.DEV) {
            console.info('Sesión no restaurada: API no disponible en', error?.message ?? error)
          }
          return
        }

        if (error.status !== 401) {
          console.warn('No se pudo restaurar la sesion.', error)
          return
        }

        try {
          const athleteSession = await fetchAthleteSession()
          if (!active) return
          setSession(athleteSession.user)
          setAthletes(athleteSession.athlete ? [athleteSession.athlete] : [])
          setMemberships(athleteSession.memberships)
          setRegistrations(athleteSession.registrations)
          setPayments(athleteSession.payments)
          return
        } catch (athleteError) {
          if (athleteError?.status !== 401) console.warn('No se pudo restaurar la sesion de atleta.', athleteError)
        }

        if (!oauth.configured || !oauth.isAuthenticated || oauth.isLoading) return

        try {
          const accessToken = await oauth.getAccessToken()
          if (!active || !accessToken) return

          const { user, supabaseAuth } = await oauthSessionRequest(accessToken)
          if (active) setSession(user)
          await establishSupabaseSession(supabaseAuth)
        } catch (oauthError) {
          console.warn('No se pudo iniciar sesion con OAuth.', oauthError)
        }
      })

    return () => {
      active = false
    }
  }, [oauth, setSession])

  const dashboardOverview = useMemo(
    () =>
      buildDashboardOverview({
        athletes,
        memberships,
        registrations,
        payments,
        events: adminEvents,
      }),
    [athletes, memberships, registrations, payments, adminEvents],
  )

  const dashboard = dashboardOverview.primary

  const enrichedRegistrations = useMemo(
    () =>
      registrations.map((registration) => ({
        ...registration,
        athlete: athletes.find((a) => a.id === registration.athleteId),
      })),
    [registrations, athletes],
  )

  const enrichedMemberships = useMemo(
    () => enrichMemberships(memberships, athletes),
    [memberships, athletes],
  )

  const pendingActions = useMemo(
    () => buildPendingActions({ payments, athletes, memberships, registrations, pendingTicketOrders }),
    [payments, athletes, memberships, registrations, pendingTicketOrders],
  )

  const adminNavBadges = useMemo(
    () => getAdminNavBadges({ payments, registrations, pendingTicketOrders }),
    [payments, registrations, pendingTicketOrders],
  )

  const recentActivity = useMemo(
    () =>
      buildRecentActivity({ auditLogs, athletes, memberships, registrations, payments, events: adminEvents }),
    [auditLogs, athletes, memberships, registrations, payments, adminEvents],
  )

  const getAthleteDetail = useCallback(
    (athleteId) => {
      const athlete = athletes.find((item) => item.id === athleteId)
      if (!athlete) return null

      return {
        athlete,
        memberships: memberships.filter((item) => item.athleteId === athleteId),
        registrations: registrations.filter((item) => item.athleteId === athleteId),
        payments: payments.filter((item) => item.athleteId === athleteId),
        auditLogs: getAthleteAuditLogs(athleteId, auditLogs, memberships, registrations, payments),
      }
    },
    [athletes, memberships, registrations, payments, auditLogs],
  )

  const filteredRegistrations = useMemo(() => {
    return enrichedRegistrations.filter((registration) => {
      const statusMatch =
        filters.status === 'all' ||
        registration.status === filters.status ||
        registration.paymentStatus === filters.status
      const eventMatch = filters.event === 'all' || registration.event === filters.event
      const query = filters.query.trim().toLowerCase()
      const queryMatch =
        !query ||
        registration.athlete?.fullName.toLowerCase().includes(query) ||
        registration.athlete?.documentId.includes(query) ||
        registration.category.toLowerCase().includes(query)
      return statusMatch && eventMatch && queryMatch
    })
  }, [enrichedRegistrations, filters])

  const updateForm = useCallback((event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }, [])

  const registerAthlete = useCallback(
    async (event) => {
      event.preventDefault()
      try {
        const { athlete } = await registerAthleteRequest(form)
        setAthletes([athlete])
        setMemberships([])
        setRegistrations([])
        setPayments([])
        const confirmation = { type: 'profile', athleteName: athlete.fullName, status: 'registrado' }
        setCreatedOrder(confirmation)
        setAuditLogs((c) => [buildAuditLog('athlete.registered', 'athlete', athlete.id, 'public'), ...c])
        setForm({ ...DEFAULT_FORM })
        setSession({
          role: 'athlete_plu',
          athleteId: athlete.id,
          name: athlete.fullName,
          email: athlete.email,
        })
        return { athlete, confirmation }
      } catch (error) {
        if (error instanceof ApiError) return { error: error.message }
        throw error
      }
    },
    [form, setSession],
  )

  const startMembershipPayment = useCallback(
    async (paymentMethod = form.paymentMethod, planCode = 'plu-annual') => {
      const athlete = athletes.find((item) => item.id === session?.athleteId)
      if (!athlete) return { error: 'No se encontró el perfil del atleta.' }

      try {
        const normalizedMethod = paymentMethod === 'transferencia' ? 'manual_link' : paymentMethod
        const attemptFingerprint = `${athlete.id}:${planCode}:${normalizedMethod}`
        if (membershipAttemptRef.current?.fingerprint !== attemptFingerprint) {
          membershipAttemptRef.current = { fingerprint: attemptFingerprint, idempotencyKey: crypto.randomUUID() }
        }
        const { order, membership, plan } = await createMembershipOrderRequest(
          athlete.id,
          normalizedMethod,
          planCode,
          membershipAttemptRef.current.idempotencyKey,
        )
        const checkout = order.method === 'mercado_pago' && plan?.collectionMode !== 'recurring'
          ? await createPreferenceRequest({ paymentId: order.id })
          : null
        setMemberships((current) => [
          membership,
          ...current.filter((item) => item.athleteId !== athlete.id || item.year !== membership.year),
        ])
        const payment = {
          id: order.id,
          athleteId: athlete.id,
          concept: plan?.name ?? 'Afiliación PLU',
          amount: order.amount,
          method: order.method,
          status: order.status,
          reference: order.reference,
          createdAt: order.createdAt,
        }
        setPayments((current) => [payment, ...current])
        const createdOrder = {
          type: 'membership',
          athleteName: athlete.fullName,
          athleteDocument: athlete.documentId,
          athleteId: athlete.id,
          paymentId: order.id,
          paymentMethod: order.method,
          checkoutUrl: checkout?.preference?.initPoint ?? checkout?.initPoint ?? null,
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: plan?.collectionMode === 'recurring' ? 'subscription' : 'payment',
          plan,
          ...payment,
        }
        setCreatedOrder(createdOrder)
        setAuditLogs((current) => [buildAuditLog('membership.created', 'membership', membership.id, athlete.id), ...current])
        return { membership, payment, plan, createdOrder }
      } catch (error) {
        if (error instanceof ApiError) return { error: error.message }
        throw error
      }
    },
    [athletes, form, session],
  )

  const submitMembership = useCallback(
    async (event) => {
      event.preventDefault()
      return startMembershipPayment(form.paymentMethod)
    },
    [form.paymentMethod, startMembershipPayment],
  )

  const submitCompetition = useCallback(
    async (event, selectedEvent) => {
      event.preventDefault()
      const athlete = athletes.find((item) => item.id === session?.athleteId)
      if (!athlete) return { error: 'No se encontró el perfil del atleta.' }

      try {
        const attemptFingerprint = JSON.stringify([
          athlete.id, selectedEvent.slug, form.division, form.category, form.estimatedWeight, form.paymentMethod,
        ])
        if (registrationAttemptRef.current?.fingerprint !== attemptFingerprint) {
          registrationAttemptRef.current = { fingerprint: attemptFingerprint, idempotencyKey: crypto.randomUUID() }
        }
        const { order, registration } = await createCompetitionRegistrationRequest({
          athleteId: athlete.id,
          eventSlug: selectedEvent.slug,
          division: form.division,
          category: form.category,
          bodyweightKg: form.estimatedWeight ? Number(String(form.estimatedWeight).replace(',', '.')) : null,
          paymentMethod: form.paymentMethod,
          idempotencyKey: registrationAttemptRef.current.idempotencyKey,
        })
        const checkout = order.method === 'mercado_pago'
          ? await createPreferenceRequest({ paymentId: order.id })
          : null
        const enrichedRegistration = { ...registration, event: selectedEvent.title, eventSlug: selectedEvent.slug }
        setRegistrations((current) => [enrichedRegistration, ...current])
        const payment = {
          id: order.id,
          athleteId: athlete.id,
          concept: `Inscripción ${selectedEvent.title}`,
          amount: order.amount,
          method: order.method,
          status: order.status,
          reference: order.reference,
          createdAt: order.createdAt,
        }
        setPayments((current) => [payment, ...current])
        const createdOrder = {
          type: 'competition',
          athleteName: athlete.fullName,
          athleteDocument: athlete.documentId,
          athleteId: athlete.id,
          paymentId: order.id,
          paymentMethod: order.method,
          checkoutUrl: checkout?.preference?.initPoint ?? null,
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: 'payment',
          ...payment,
        }
        setCreatedOrder(createdOrder)
        setAuditLogs((current) => [buildAuditLog('registration.created', 'registration', registration.id, athlete.id), ...current])
        return { registration: enrichedRegistration, payment, createdOrder }
      } catch (error) {
        // El servidor es la autoridad para el gate de membresía activa
        // (PLU05) y de inscripción duplicada (PLU08) -- antes esos dos
        // checks vivían solo del lado del cliente.
        if (error instanceof ApiError) return { error: error.message }
        throw error
      }
    },
    [athletes, form, session],
  )

  // Compra pÃºblica de entradas â€” no requiere cuenta ni sesiÃ³n: cualquiera
  // puede comprar para un evento dando el DNI de cada asistente. A
  // diferencia del resto del dominio, esto habla con el backend real
  // (Postgres): es la parte del sistema que necesita la garantÃ­a dura de
  // "no se puede duplicar/reusar", y esa garantÃ­a no existe sin una base
  // de datos real arbitrando el check-in.
  const submitTicketPurchase = useCallback(
    async (event, purchaseEvent, attendees, paymentMethod) => {
      event.preventDefault()
      const provider =
        paymentMethod === 'transferencia' || paymentMethod === 'manual_link' ? 'manual' : paymentMethod
      try {
        const attemptFingerprint = JSON.stringify([purchaseEvent.slug, attendees, provider])
        if (ticketAttemptRef.current?.fingerprint !== attemptFingerprint) {
          ticketAttemptRef.current = {
            fingerprint: attemptFingerprint,
            idempotencyKey: crypto.randomUUID(),
            accessToken: `${crypto.randomUUID()}${crypto.randomUUID()}`,
          }
        }
        const { order, tickets: createdTickets, orderAccessToken } = await createTicketOrderRequest({
          eventSlug: purchaseEvent.slug,
          attendees: attendees.map((attendee) => ({
            fullName: attendee.fullName,
            dni: attendee.dni,
            dayPass: attendee.dayPass,
            addonIds: attendee.addonIds ?? [],
          })),
          provider,
          idempotencyKey: ticketAttemptRef.current.idempotencyKey,
          accessToken: ticketAttemptRef.current.accessToken,
        })
        const checkout =
          provider === 'mercado_pago'
            ? await createPreferenceRequest({ paymentId: order.id, orderAccessToken })
            : null
        const mappedTickets = createdTickets.map((ticket) => mapApiTicket(ticket, purchaseEvent))
        setTickets((current) => [...mappedTickets, ...current])
        const nextOrder = {
          type: 'tickets',
          orderId: order.id,
          orderAccessToken,
          eventTitle: purchaseEvent.title,
          quantity: createdTickets.length,
          amount: order.amount,
          paymentMethod: order.provider,
          reference: order.reference,
          status: order.status,
          paymentProofPath: order.paymentProofPath,
          paymentProofUploadedAt: order.paymentProofUploadedAt,
          checkoutUrl: checkout?.preference?.initPoint ?? null,
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: 'payment',
          createdAt: order.createdAt,
        }
        setCreatedOrder(nextOrder)
        return { tickets: mappedTickets, createdOrder: nextOrder }
      } catch (error) {
        return { error: error.message ?? 'No se pudo completar la compra.' }
      }
    },
    [],
  )

  // Aprobación operativa reservada a transferencias manuales. Las órdenes
  // Mercado Pago se acreditan exclusivamente mediante webhook.
  const approveTicketPurchase = useCallback(async (orderId) => {
    try {
      const { order, tickets: approvedTickets } = await approveTicketOrderRequest(orderId)
      setTickets((current) => {
        const byId = new Map(approvedTickets.map((ticket) => [ticket.id, ticket]))
        return current.map((item) => (byId.has(item.id) ? { ...item, status: byId.get(item.id).status } : item))
      })
      setCreatedOrder((current) => (current?.orderId === orderId ? { ...current, status: order.status } : current))
      setPendingTicketOrders((current) => current.filter((item) => item.orderId !== orderId))
    } catch (error) {
      console.error('approveTicketPurchase:', error)
      throw error
    }
  }, [])

  const uploadTicketPaymentProofAction = useCallback(async (orderId, file) => {
    try {
      const accessToken = createdOrder?.orderId === orderId ? createdOrder.orderAccessToken : null
      const { storagePath } = await uploadTicketPaymentProof(orderId, accessToken, file)
      const { order } = await registerTicketPaymentProofRequest(orderId, accessToken, storagePath)
      setCreatedOrder((current) =>
        current?.orderId === orderId
          ? {
              ...current,
              status: order.status,
              paymentProofPath: order.paymentProofPath,
              paymentProofUploadedAt: order.paymentProofUploadedAt,
            }
          : current,
      )
      setPendingTicketOrders((current) =>
        current.map((item) =>
          item.orderId === orderId
            ? {
                ...item,
                status: order.status,
                paymentProofPath: order.paymentProofPath,
                paymentProofUploadedAt: order.paymentProofUploadedAt,
              }
            : item,
        ),
      )
      return { order }
    } catch (error) {
      return { error: error.message ?? 'No se pudo enviar el comprobante.' }
    }
  }, [createdOrder])

  const refreshPendingTicketOrders = useCallback(async () => {
    if (!userCanEdit) return
    setPendingTicketOrdersLoading(true)
    setPendingTicketOrdersError(null)
    try {
      const { orders } = await listPendingTicketOrdersRequest()
      setPendingTicketOrders(orders)
    } catch (error) {
      console.error('refreshPendingTicketOrders:', error)
      setPendingTicketOrdersError(error.message ?? 'No se pudieron cargar las Ã³rdenes pendientes.')
    } finally {
      setPendingTicketOrdersLoading(false)
    }
  }, [userCanEdit])

  // Check-in en la puerta: el backend valida el qrToken y lo marca como
  // usado de forma atÃ³mica â€” dos escaneos simultÃ¡neos del mismo QR no
  // pueden dejar pasar a las dos personas (ver server/modules/ticketing).
  useEffect(() => {
    if (!userCanEdit) return undefined
    refreshPendingTicketOrders()
    return undefined
  }, [userCanEdit, refreshPendingTicketOrders])

  const checkInTicketAction = useCallback(async (qrToken) => {
    try {
      const { ticket, checkIn } = await checkInTicketRequest(qrToken)
      const updated = { ...mapApiTicket(ticket), checkedInAt: checkIn.scannedAt }
      setTickets((current) => current.map((item) => (item.qrToken === qrToken ? updated : item)))
      return { outcome: 'ok', ticket: updated }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return { outcome: error.body?.alreadyUsed ? 'already_used' : 'not_paid' }
      }
      if (error instanceof ApiError && error.status === 404) {
        return { outcome: 'not_found' }
      }
      throw error
    }
  }, [])

  const redeemTicketAddonAction = useCallback(async (qrToken, addonId) => {
    try {
      const { ticket } = await redeemTicketAddonRequest(qrToken, addonId)
      const updated = mapApiTicket(ticket)
      setTickets((current) => current.map((item) => (item.qrToken === qrToken ? updated : item)))
      return { ticket: updated }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return { error: error.message ?? 'Este beneficio ya fue canjeado.' }
      }
      if (error instanceof ApiError && error.status === 404) {
        return { error: error.message ?? 'Beneficio no encontrado.' }
      }
      return { error: error.message ?? 'No se pudo canjear el beneficio.' }
    }
  }, [])

  // Refresca la lista de entradas de un evento desde el backend real â€”
  // la usa el panel de Seguridad, que necesita ver compras hechas desde
  // cualquier dispositivo, no solo las de esta pestaÃ±a.
  const refreshTickets = useCallback(async (eventSlug) => {
    try {
      const { tickets: apiTickets } = await listTicketsForEventRequest(eventSlug)
      setTickets(apiTickets.map((ticket) => mapApiTicket(ticket)))
    } catch (error) {
      console.error('refreshTickets:', error)
    }
  }, [])

  // Check-in en la puerta para un atleta inscripto (competidor) â€” separado
  // del check-in de entradas porque los atletas no tienen ticketCode/QR de
  // entrada, se buscan directo por su fila en el panel de seguridad.
  const checkInRegistrationAction = useCallback(async (registrationId, gate) => {
    try {
      const { registration } = await checkInRegistrationRequest(registrationId, gate)
      setRegistrations((current) =>
        current.map((item) => (item.id === registration.id ? { ...item, checkedInAt: registration.checkedInAt } : item)),
      )
      return { outcome: 'ok', registration }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        return { outcome: error.body?.alreadyUsed ? 'already_used' : 'not_paid' }
      }
      if (error instanceof ApiError && error.status === 404) {
        return { outcome: 'not_found' }
      }
      throw error
    }
  }, [])

  // GestiÃ³n de cuentas del panel: solo quien tiene canManageUsers puede
  // cambiar roles o crear cuentas nuevas (se valida tambiÃ©n en la UI).
  const updateUserRoleAction = useCallback((userId, nextRole) => {
    setUsers((current) => updateUserRole(current, userId, nextRole))
  }, [])

  const createUserAction = useCallback(
    (draft) => {
      setUsers((current) => createUser(current, draft))
    },
    [],
  )

  const createSecurityUserAction = useCallback(async (draft) => {
    const { user, tempPassword } = await createSecurityUserRequest(draft)
    setUsers((current) => [{ id: user.id, name: user.name, email: user.email, role: user.role }, ...current])
    return { user, tempPassword }
  }, [])

  const login = useCallback(async (credentialsOrAccountType) => {
    if (credentialsOrAccountType === 'athlete') {
      const demoAthleteSession = {
        role: 'athlete_plu',
        athleteId: 'ath-001',
        name: 'Martina Rivas',
        email: 'martina.rivas@example.com',
      }
      setSession(demoAthleteSession)
      return demoAthleteSession
    }

    if (credentialsOrAccountType === 'admin') {
      const demoAdminSession = {
        id: 'demo-admin',
        role: 'admin_plu_arg',
        name: 'Admin Demo',
        email: 'demo@pluarg.com.ar',
      }
      setSession(demoAdminSession)
      return demoAdminSession
    }

    if (typeof credentialsOrAccountType === 'object') {
      const emailRaw = String(credentialsOrAccountType.email ?? '').trim().toLowerCase()
      const email = emailRaw === 'demo' ? 'demo@pluarg.com.ar' : emailRaw
      const password = String(credentialsOrAccountType.password ?? '')

      if (email === 'demo@pluarg.com.ar' && password === '123') {
        const demoAdminSession = {
          id: 'demo-admin',
          role: 'admin_plu_arg',
          name: 'Admin Demo',
          email: 'demo@pluarg.com.ar',
        }
        setSession(demoAdminSession)
        return demoAdminSession
      }

      if ((emailRaw === 'demo2' || email === 'demo2@pluarg.com.ar') && password === '123') {
        setMemberships((current) =>
          current.map((membership) =>
            membership.athleteId === 'ath-001' && membership.year === '2026'
              ? { ...membership, status: 'pendiente_pago', paymentStatus: 'pendiente_pago', mercadoPagoRef: '' }
              : membership,
          ),
        )
        setAthletes((current) =>
          current.map((athlete) => (athlete.id === 'ath-001' ? { ...athlete, status: 'registrado' } : athlete)),
        )
        const demoAthleteSession = {
          id: 'demo-athlete',
          role: 'athlete_plu',
          athleteId: 'ath-001',
          demoUnAffiliated: true,
          name: 'Martina Rivas',
          email: 'martina.rivas@example.com',
        }
        setSession(demoAthleteSession)
        return demoAthleteSession
      }

      if ((emailRaw === 'demo3' || email === 'demo3@pluarg.com.ar') && password === '123') {
        const demoPluUsaSession = {
          id: 'demo-plu-usa',
          role: 'viewer_plu_usa',
          name: 'PLU USA',
          email: 'demo3@pluarg.com.ar',
        }
        setSession(demoPluUsaSession)
        return demoPluUsaSession
      }

      // La cuenta de seguridad SÃ pasa por el backend real (mÃ¡s abajo, loginRequest):
      // necesita una sesiÃ³n de verdad porque el check-in muta datos reales en Postgres,
      // a diferencia del resto de la demo que vive en localStorage.
    }

    try {
      const { user, supabaseAuth } = await loginRequest(credentialsOrAccountType)
      setSession(user)
      await establishSupabaseSession(supabaseAuth)
      return user
    } catch (error) {
      if (error?.status !== 401) throw error
      const { user } = await loginAthleteSession(credentialsOrAccountType)
      setSession(user)
      return user
    }
  }, [setSession])

  const logout = useCallback(async () => {
    const currentSession = session
    setSession(null)

    if (currentSession?.role === 'athlete_plu' && !isDemoSession(currentSession)) {
      await logoutAthleteSession().catch((error) => {
        if (error.status !== 401) console.warn('No se pudo cerrar la sesion de atleta.', error)
      })
    } else if (currentSession?.role !== 'athlete_plu' && currentSession?.id !== 'demo-admin') {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut().catch(() => {})
      }

      try {
        await logoutRequest()
      } catch (error) {
        if (error.status !== 401) {
          console.warn('No se pudo cerrar la sesion del servidor.', error)
        }
      }

      if (oauth.configured && oauth.isAuthenticated) {
        await oauth.logout()
      }
    }
  }, [oauth, session, setSession])

  const handleApprovePayment = useCallback(
    async (paymentId) => {
      try {
        const { order, membership, registration } = await approveAthletePaymentOrderRequest(paymentId)
        setPayments((c) => c.map((p) => (p.id === paymentId ? { ...p, status: order.status, reference: order.reference } : p)))

        const athlete = athletes.find((a) => a.id === order.athleteId)

        if (membership) {
          setMemberships((c) => c.map((m) => (m.id === membership.id ? membership : m)))
          setAthletes((c) => c.map((a) => (a.id === membership.athleteId ? { ...a, status: 'afiliado_activo' } : a)))
          if (athlete) await notifyPaymentApproved(athlete, { amount: order.amount, concept: 'Afiliación anual' })
          if (athlete) await notifyAffiliationStarted({ ...athlete, memberCode: membership.memberCode })
        }

        if (registration) {
          const eventTitle = registrations.find((r) => r.id === registration.id)?.event
          setRegistrations((c) => c.map((r) => (r.id === registration.id ? { ...r, status: registration.status, paymentStatus: order.status } : r)))
          if (athlete) await notifyPaymentApproved(athlete, { amount: order.amount, concept: `Inscripción ${eventTitle}` })
          if (athlete) await notifyRegistrationConfirmed(athlete, eventTitle)
        }

        setCreatedOrder((c) => (c?.paymentId === paymentId ? { ...c, status: order.status } : c))
        setAuditLogs((c) => [buildAuditLog('payment.approved', 'payment', paymentId, 'admin'), ...c])
      } catch (error) {
        console.error('handleApprovePayment:', error)
      }
    },
    [athletes, registrations],
  )

  const activateDemoMembership = useCallback((athleteId) => {
    const athlete = athletes.find((item) => item.id === athleteId)
    if (!athlete) return { error: 'No se encontró el perfil del atleta.' }

    const memberCode = `PLU-ARG-2026-${athlete.id.replace('ath-', '')}`
    const membershipPatch = {
      athleteId,
      year: '2026',
      status: 'activa',
      startDate: new Date().toISOString().slice(0, 10),
      expirationDate: '2027-01-31',
      memberCode,
      paymentStatus: 'aprobado',
      mercadoPagoRef: `DEMO-AFIL-${Date.now()}`,
    }

    setMemberships((current) => {
      const existing = current.find((membership) => membership.athleteId === athleteId && membership.year === '2026')
      if (existing) {
        return current.map((membership) =>
          membership.id === existing.id ? { ...membership, ...membershipPatch } : membership,
        )
      }

      return [
        {
          id: `mem-demo-${athleteId}`,
          ...membershipPatch,
        },
        ...current,
      ]
    })
    setAthletes((current) =>
      current.map((item) => (item.id === athleteId ? { ...item, status: 'afiliado_activo' } : item)),
    )
    return { success: true }
  }, [athletes])

  const cancelDemoMembership = useCallback((athleteId) => {
    setMemberships((current) =>
      current.map((membership) =>
        membership.athleteId === athleteId && membership.year === '2026'
          ? { ...membership, status: 'pendiente_pago', paymentStatus: 'pendiente_pago', mercadoPagoRef: '' }
          : membership,
      ),
    )
    setAthletes((current) =>
      current.map((item) => (item.id === athleteId ? { ...item, status: 'registrado' } : item)),
    )
    return { success: true }
  }, [])

  const updateAthleteProfileAction = useCallback(async (athleteId, updates) => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(updates.email ?? '')) {
      return { error: 'Email inválido.' }
    }

    try {
      const { athlete } = await updateAthleteProfileRequest(athleteId, updates)
      setAthletes((current) => current.map((item) => (item.id === athleteId ? athlete : item)))
      return { athlete }
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message }
      throw error
    }
  }, [])

  const updateAthletePhotoAction = useCallback(async (athleteId, file) => {
    try {
      const { storagePath } = await uploadAthletePhoto(athleteId, file)
      const { athlete } = await registerAthletePhotoRequest(athleteId, storagePath)
      setAthletes((current) => current.map((item) => (item.id === athleteId ? athlete : item)))
      return { athlete }
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message }
      throw error
    }
  }, [])

  const removeAthletePhotoAction = useCallback(async (athleteId) => {
    try {
      const { athlete } = await registerAthletePhotoRequest(athleteId, null)
      setAthletes((current) => current.map((item) => (item.id === athleteId ? athlete : item)))
      return { athlete }
    } catch (error) {
      if (error instanceof ApiError) return { error: error.message }
      throw error
    }
  }, [])

  const exportAdminCsv = useCallback(() => {
    const rows = buildAdminExportRows(registrations, athletes, memberships, payments)
    createCsv('plu-arg-admin-export.csv', rows)
  }, [registrations, athletes, memberships, payments])

  const exportPluUsaCsv = useCallback(() => {
    const rows = buildPluUsaExportRows(athletes, memberships, registrations)
    createCsv('plu-usa-export.csv', rows)
  }, [athletes, memberships, registrations])

  const saveAdminEvent = useCallback(
    (draft) => {
      if (!userCanEdit) return { error: 'Sin permisos para editar eventos.' }

      if (draft.id) {
        const result = updateAdminEvent(adminEvents, draft.id, draft)
        if (!result.event) return { error: 'No se encontrÃ³ el evento.' }
        setAdminEvents(result.events)
        if (result.auditLog) setAuditLogs((current) => [result.auditLog, ...current])
        return { event: result.event }
      }

      const result = createAdminEvent(adminEvents, draft)
      setAdminEvents(result.events)
      setAuditLogs((current) => [result.auditLog, ...current])
      return { event: result.event }
    },
    [adminEvents, userCanEdit],
  )

  return {
    role,
    session,
    getSession,
    login,
    logout,
    userCanEdit,
    athletes,
    memberships,
    registrations,
    payments,
    tickets,
    pendingTicketOrders,
    pendingTicketOrdersLoading,
    pendingTicketOrdersError,
    createdOrder,
    auditLogs,
    form,
    filters,
    setFilters,
    dashboard,
    dashboardOverview,
    adminEvents,
    saveAdminEvent,
    filteredRegistrations,
    enrichedMemberships,
    pendingActions,
    adminNavBadges,
    recentActivity,
    getAthleteDetail,
    updateForm,
    updateAthleteProfileAction,
    updateAthletePhotoAction,
    removeAthletePhotoAction,
    registerAthlete,
    submitMembership,
    startMembershipPayment,
    submitCompetition,
    activateDemoMembership,
    cancelDemoMembership,
    submitTicketPurchase,
    uploadTicketPaymentProofAction,
    approveTicketPurchase,
    refreshPendingTicketOrders,
    checkInTicketAction,
    redeemTicketAddonAction,
    refreshTickets,
    checkInRegistrationAction,
    users,
    updateUserRoleAction,
    createUserAction,
    createSecurityUserAction,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
    demoMode: isDemoSession(session),
  }
}
