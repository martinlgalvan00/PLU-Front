import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  acceptStaffInvitationRequest,
  createAccessRoleRequest,
  createSecurityAccessLinkRequest,
  createSecurityUserRequest,
  createSecurityUsersBulkRequest,
  changeOwnPasswordRequest,
  createStaffUserRequest,
  requestEmailChangeRequest,
  resetStaffPasswordRequest,
  deleteStaffUserRequest,
  deactivateAllSecurityUsersRequest,
  listAccessRolesRequest,
  listSecurityUsersRequest,
  listStaffUsersRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  oauthSessionRequest,
  securityGateRequest,
  updateSecurityUserStatusRequest,
  updateAccessRolePermissionsRequest,
  updateStaffUserRoleRequest,
  updateStaffUserStatusRequest,
} from '../lib/api.js'
import { DEFAULT_FORM } from '../lib/constants.js'
import { env } from '../config/env.js'
import {
  FEATURE_KEYS,
  getFeatureAvailability,
  isFeatureEnabled,
} from '../lib/featureAvailability.js'
import {
  ACCESS_ROLE_TEMPLATES,
  getDefaultPermissionsForRole,
  hasAnyPermission,
  hasPermission,
  PERMISSION_CATALOG,
} from '../lib/permissions.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'
import {
  approveAthletePaymentOrder as approveAthletePaymentOrderRequest,
  checkInRegistration as checkInRegistrationRequest,
  createCompetitionRegistration as createCompetitionRegistrationRequest,
  createCompetitionRegistrationCombo as createCompetitionRegistrationComboRequest,
  createMembershipOrder as createMembershipOrderRequest,
  deleteAthleteRequest,
  fetchAdminAthleteData,
  fetchAthleteSession,
  fetchAthleteSnapshot,
  logoutAthleteSession,
  loginAthleteSession,
  registerAthlete as registerAthleteRequest,
  registerAthletePhoto as registerAthletePhotoRequest,
  setMembershipStatus as setMembershipStatusRequest,
  updateAthleteProfile as updateAthleteProfileRequest,
} from '../services/athleteApi.js'
import { uploadAthletePhoto } from '../services/athletePhotoService.js'
import {
  invalidateEventLiveData,
  invalidateEventRegistrationSummary,
  invalidateTicketAvailability,
} from '../services/eventLiveStore.js'
import {
  demoAthletes,
  demoMemberships,
  demoPayments,
  demoRegistrations,
  isDemoSession,
} from '../services/demoAthleteSeed.js'
import {
  applyPaymentUpdate,
  clearMembershipPlansCache,
  createPreference as createPreferenceRequest,
  reconcileCreatedOrder,
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
import {
  deleteUser,
  getInitialUsers,
  updateUserRole,
  updateUserStatus,
} from '../services/userService.js'
import { canDeleteAthletes, canDeleteUsers } from '../lib/roles.js'
import {
  buildAdminExportRows,
  buildPluUsaExportRows,
  createCsv,
} from '../services/exportService.js'
import {
  buildPendingActions,
  buildDashboardOverview,
  getAdminNavBadges,
} from '../services/adminService.js'
import {
  createAdminEvent,
  fetchAdminEvents,
  fetchPublishedEvents,
  getInitialAdminEvents,
  isEventFull,
  OPEN_REGISTRATION_STATUSES,
  saveAdminEventRequest,
  setEventStateRequest,
  updateAdminEvent,
} from '../services/eventAdminService.js'
import { enrichMemberships } from '../services/membershipService.js'
import {
  createMembershipPlanVersionRequest,
  fetchPricingConfigurationRequest,
  saveEventComboOfferRequest,
  setMembershipPlanActiveRequest,
} from '../services/pricingAdminService.js'
import { findGatePendingRegistrations } from '../lib/gateAccess.js'
import {
  deleteShopProduct,
  getInitialShopProducts,
  upsertShopProduct,
} from '../services/shopService.js'

// El login de esta app corre sobre Prisma/Auth0, nunca sobre supabase.auth
// -- sin esto, auth.uid() es siempre null en el navegador y ninguna RPC
// protegida por is_admin()/can_check_in() puede autorizar a nadie, ni
// siquiera a un admin real logueado (ver server/services/supabaseAuthBridge.js).
// El backend genera un magic-link de un solo uso al loguear staff; acá lo
// canjeamos para tener una sesión real de Supabase Auth en el cliente.
async function establishSupabaseSession(supabaseAuth) {
  if (!supabaseAuth || !isSupabaseConfigured) return

  try {
    const supabase = await getSupabaseClient()
    await supabase.auth.verifyOtp({
      email: supabaseAuth.email,
      token: supabaseAuth.tokenHash,
      type: 'magiclink',
    })
  } catch (error) {
    console.warn('No se pudo establecer la sesión de Supabase.', error)
  }
}

export function useAppData() {
  const oauth = usePluOAuth()
  const storedData = useMemo(() => readStorage(), [])
  const [session, setSessionState] = useState(null)
  // Restauración de sesión en vuelo (cookie httpOnly: no se puede saber de
  // forma síncrona si el visitante tiene sesión). En demo no hay probe.
  const [sessionPending, setSessionPending] = useState(() => !env.demoMode)
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
  const [athletes, setAthletes] = useState(() => (env.demoMode ? demoAthletes : []))
  const [memberships, setMemberships] = useState(() => (env.demoMode ? demoMemberships : []))
  const [registrations, setRegistrations] = useState(() =>
    env.demoMode ? demoRegistrations : [],
  )
  const [payments, setPayments] = useState(() => (env.demoMode ? demoPayments : []))
  const [athleteDataLoading, setAthleteDataLoading] = useState(false)
  const [athleteDataError, setAthleteDataError] = useState(null)
  // Las entradas viven en Postgres, no en localStorage â€” este estado es
  // solo un cache de lo Ãºltimo que se creÃ³/consultÃ³ vÃ­a la API real.
  const [tickets, setTickets] = useState([])
  const [pendingTicketOrders, setPendingTicketOrders] = useState([])
  const [pendingTicketOrdersLoading, setPendingTicketOrdersLoading] = useState(false)
  const [pendingTicketOrdersError, setPendingTicketOrdersError] = useState(null)
  const [createdOrder, setCreatedOrder] = useState(() => storedData?.createdOrder ?? null)
  const [adminEvents, setAdminEvents] = useState(() =>
    getInitialAdminEvents(storedData?.adminEvents, { allowStoredEvents: env.demoMode }),
  )
  const [adminEventsLoading, setAdminEventsLoading] = useState(false)
  const [adminEventsError, setAdminEventsError] = useState(null)
  const [pricingConfiguration, setPricingConfiguration] = useState(() => {
    const pricingAvailability = getFeatureAvailability(FEATURE_KEYS.pricingWrites)
    return {
      plans: [],
      events: [],
      availability: {
        editable: pricingAvailability.enabled,
        reason: pricingAvailability.reason,
      },
    }
  })
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState(null)
  const [shopProducts, setShopProducts] = useState(() =>
    getInitialShopProducts(storedData?.shopProducts),
  )
  const [users, setUsers] = useState(() => getInitialUsers(storedData?.users))
  const [accessRoles, setAccessRoles] = useState(() =>
    ACCESS_ROLE_TEMPLATES.map((role) => ({
      id: role.key,
      ...role,
      permissions: getDefaultPermissionsForRole(role.key),
      canAssign: role.assignableByAdmin,
      userCount: 0,
    })),
  )
  const [roleActivity, setRoleActivity] = useState([])
  const [permissionCatalog, setPermissionCatalog] = useState(PERMISSION_CATALOG)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })
  const membershipAttemptRef = useRef(null)
  const registrationAttemptRef = useRef(null)
  const ticketAttemptRef = useRef(null)

  useEffect(() => {
    const onPaymentUpdated = (event) => {
      const status = String(event?.detail?.status ?? '')
      if (status === 'approved' || status === 'aprobado') {
        membershipAttemptRef.current = null
        registrationAttemptRef.current = null
      }
    }
    window.addEventListener('plu:payment-updated', onPaymentUpdated)
    return () => window.removeEventListener('plu:payment-updated', onPaymentUpdated)
  }, [])

  const role = session?.role || null

  // athletes/memberships/registrations/payments ya no se persisten acá --
  // viven en Supabase (athleteApi.js); las cuentas de demo (que sí siguen
  // siendo locales) tampoco necesitan persistirse entre recargas.
  useEffect(() => {
    writeStorage({
      createdOrder,
      // En modo real se elimina también cualquier snapshot legacy que haya
      // quedado en el navegador: el próximo arranque nace del catálogo vigente.
      ...(env.demoMode ? { adminEvents } : {}),
      shopProducts,
      users,
    })
  }, [createdOrder, adminEvents, shopProducts, users])

  useEffect(() => {
    let active = true
    fetchPublishedEvents()
      .then((remoteEvents) => {
        if (!active || remoteEvents.length === 0) return
        setAdminEvents((current) => {
          const bySlug = new Map(current.map((event) => [event.slug, event]))
          return remoteEvents.map((event) => ({
            ...bySlug.get(event.slug),
            ...event,
            // Fecha del panel (`registration_opens_at`): nunca conservar seed local.
            registrationOpensAt: event.registrationOpensAt ?? null,
          }))
        })
      })
      .catch((error) => console.warn('No se pudieron cargar los eventos publicados.', error))
    return () => {
      active = false
    }
  }, [])

  const refreshAdminEvents = useCallback(async () => {
    const currentSession = sessionRef.current
    if (
      !currentSession ||
      isDemoSession(currentSession) ||
      !hasPermission(currentSession, 'admin.events.read')
    ) {
      return null
    }

    setAdminEventsLoading(true)
    setAdminEventsError(null)
    try {
      const remoteEvents = await fetchAdminEvents()
      setAdminEvents(remoteEvents)
      return remoteEvents
    } catch (error) {
      setAdminEventsError(error?.message ?? 'No se pudieron cargar los eventos.')
      console.warn('No se pudieron cargar los eventos del panel.', error)
      return null
    } finally {
      setAdminEventsLoading(false)
    }
  }, [])

  const refreshAthleteData = useCallback(async () => {
    if (!session || isDemoSession(session)) return

    if (session.role === 'athlete_plu') {
      try {
        const snapshot = await fetchAthleteSnapshot(session.athleteId)
        setAthletes(snapshot.athlete ? [snapshot.athlete] : [])
        setMemberships(snapshot.memberships)
        setRegistrations(snapshot.registrations)
        setPayments(snapshot.payments)
        // El snapshot es la fuente autoritativa del estado de la orden y ya
        // viajó: sin esto la confirmación de afiliación seguía anunciando
        // "pendiente de pago" después de que Mercado Pago acreditara.
        setCreatedOrder((current) => reconcileCreatedOrder(current, snapshot.payments))
      } catch (error) {
        console.error('refreshAthleteData:', error)
      }
      return
    }

    const tasks = []
    const canReadAthleteData = hasAnyPermission(session, [
      'admin.athletes.read',
      'admin.memberships.read',
      'admin.registrations.read',
      'admin.payments.read',
    ])

    if (canReadAthleteData) {
      setAthleteDataLoading(true)
      setAthleteDataError(null)
      tasks.push(
        fetchAdminAthleteData()
          .then((data) => {
            setAthletes(data.athletes)
            setMemberships(data.memberships)
            setRegistrations(data.registrations)
            setPayments(data.payments)
          })
          .catch((error) => {
            setAthleteDataError(
              error?.message ?? 'No se pudieron cargar atletas, afiliaciones e inscripciones.',
            )
            console.error('refreshAthleteData:', error)
          })
          .finally(() => setAthleteDataLoading(false)),
      )
    } else {
      setAthleteDataLoading(false)
      setAthleteDataError(null)
      setAthletes([])
      setMemberships([])
      setRegistrations([])
      setPayments([])
    }

    if (hasPermission(session, 'admin.events.read')) {
      tasks.push(refreshAdminEvents())
    }

    if (hasPermission(session, 'admin.users.read')) {
      tasks.push(
        listStaffUsersRequest()
          .then(({ users: staffUsers }) => setUsers(staffUsers))
          .catch((error) => {
            if (!(error instanceof ApiError && error.status === 403)) {
              console.warn('No se pudo cargar el listado de staff.', error)
            }
          }),
      )
    }

    if (hasPermission(session, 'admin.roles.read')) {
      tasks.push(
        listAccessRolesRequest()
          .then(({ activity = [], permissions, roles: remoteRoles }) => {
            setAccessRoles(remoteRoles)
            setRoleActivity(activity)
            setPermissionCatalog(permissions)
          })
          .catch((error) => {
            if (!(error instanceof ApiError && error.status === 403)) {
              console.warn('No se pudo cargar la matriz de roles.', error)
            }
          }),
      )
    }

    await Promise.all(tasks)
  }, [refreshAdminEvents, session])

  useEffect(() => {
    refreshAthleteData()
  }, [refreshAthleteData])

  useEffect(() => {
    if (!session?.athleteId || session.role !== 'athlete_plu') return
    const athlete = athletes.find((item) => item.id === session.athleteId)
    const nextPhoto = athlete?.photoUrl ?? null
    if ((session.photoUrl ?? null) === nextPhoto) return
    setSession({ ...session, photoUrl: nextPhoto })
  }, [athletes, session, setSession])

  // `plu:email-verified` lo dispara EmailVerificationNotice al consumir el
  // deep link del mail. Sin esto el cache local seguía con emailVerifiedAt en
  // null y el aviso de "confirmá tu correo" quedaba pegado hasta recargar,
  // aunque el gate del servidor ya estuviera abierto.
  useEffect(() => {
    const refreshFromServer = (event) => {
      if (event.type === 'plu:payment-updated') {
        setCreatedOrder((current) => {
          const updated = applyPaymentUpdate(current, [], event.detail)
          return updated.createdOrder
        })
        setTickets((current) => applyPaymentUpdate(null, current, event.detail).tickets)
        // El pago puede haber pasado a aprobado o rechazado: el detalle no
        // trae el evento, así que se vencen las dos caches públicas y el
        // próximo lector vuelve a preguntarle al servidor.
        invalidateEventLiveData()
      }
      void refreshAthleteData()
    }
    window.addEventListener('plu:payment-updated', refreshFromServer)
    window.addEventListener('plu:email-verified', refreshFromServer)
    return () => {
      window.removeEventListener('plu:payment-updated', refreshFromServer)
      window.removeEventListener('plu:email-verified', refreshFromServer)
    }
  }, [refreshAthleteData])

  useEffect(() => {
    if (env.demoMode) return undefined

    let active = true

    meRequest()
      .then(async ({ user }) => {
        if (!active) return

        // Soft-probe: { user: null } = anónimo (ya no debería venir como 401).
        if (user) {
          setSession(user)
          return
        }

        await restoreAthleteOrOAuth()
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

        // Compat: APIs viejas todavía respondían 401 en el probe anónimo.
        if (error.status === 401) {
          await restoreAthleteOrOAuth()
          return
        }

        console.warn('No se pudo restaurar la sesion.', error)
      })
      .finally(() => {
        // Si el SDK de Auth0 sigue inicializando, el efecto se re-ejecuta al
        // cambiar `oauth` y este finally vuelve a correr en ese momento.
        if (active && !(oauth.configured && oauth.isLoading)) setSessionPending(false)
      })

    async function restoreAthleteOrOAuth() {
      try {
        const athleteSession = await fetchAthleteSession()
        if (!active) return
        if (athleteSession.user) {
          setSession(athleteSession.user)
          setAthletes(athleteSession.athlete ? [athleteSession.athlete] : [])
          setMemberships(athleteSession.memberships)
          setRegistrations(athleteSession.registrations)
          setPayments(athleteSession.payments)
          return
        }
      } catch (athleteError) {
        if (athleteError?.status !== 401)
          console.warn('No se pudo restaurar la sesion de atleta.', athleteError)
      }

      if (!oauth.configured || !oauth.isAuthenticated || oauth.isLoading) return

      try {
        const accessToken = await oauth.getAccessToken()
        if (!active || !accessToken) return

        const { user: oauthUser, supabaseAuth } = await oauthSessionRequest(accessToken)
        if (active) setSession(oauthUser)
        await establishSupabaseSession(supabaseAuth)
      } catch (oauthError) {
        console.warn('No se pudo iniciar sesion con OAuth.', oauthError)
      }
    }

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
    () =>
      buildPendingActions({
        payments,
        athletes,
        memberships,
        registrations,
        pendingTicketOrders,
        events: adminEvents,
      }),
    [payments, athletes, memberships, registrations, pendingTicketOrders, adminEvents],
  )

  const adminNavBadges = useMemo(
    () =>
      getAdminNavBadges({
        payments,
        registrations,
        pendingTicketOrders,
        memberships,
        events: adminEvents,
      }),
    [payments, registrations, pendingTicketOrders, memberships, adminEvents],
  )

  // La actividad reciente y el timeline del atleta salen de `domain_audit_logs`
  // vía /api/audit (`AdminRecentActivity`, `AdminAthleteActivity`). Antes se
  // armaban acá sobre un array de localStorage: uno distinto por navegador y
  // sin relación con lo que había pasado de verdad en la base.
  const getAthleteDetail = useCallback(
    (athleteId) => {
      const athlete = athletes.find((item) => item.id === athleteId)
      if (!athlete) return null

      return {
        athlete,
        memberships: memberships.filter((item) => item.athleteId === athleteId),
        registrations: registrations.filter((item) => item.athleteId === athleteId),
        payments: payments.filter((item) => item.athleteId === athleteId),
      }
    },
    [athletes, memberships, registrations, payments],
  )

  const filteredRegistrations = useMemo(() => {
    const gatePendingIds =
      filters.status === 'gate_pending'
        ? new Set(
            findGatePendingRegistrations(registrations, {
              memberships,
              events: adminEvents,
            }).map((item) => item.id),
          )
        : null

    return enrichedRegistrations.filter((registration) => {
      const statusMatch =
        filters.status === 'all' ||
        (filters.status === 'gate_pending'
          ? gatePendingIds.has(registration.id)
          : registration.status === filters.status || registration.paymentStatus === filters.status)
      const eventMatch = filters.event === 'all' || registration.event === filters.event
      const query = filters.query.trim().toLowerCase()
      const queryMatch =
        !query ||
        registration.athlete?.fullName?.toLowerCase().includes(query) ||
        registration.athlete?.documentId?.toLowerCase().includes(query) ||
        registration.athlete?.email?.toLowerCase().includes(query) ||
        registration.event?.toLowerCase().includes(query) ||
        registration.category?.toLowerCase().includes(query) ||
        registration.division?.toLowerCase().includes(query)
      return statusMatch && eventMatch && queryMatch
    })
  }, [enrichedRegistrations, filters, registrations, memberships, adminEvents])

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
        const confirmation = {
          type: 'profile',
          athleteName: athlete.fullName,
          status: 'registrado',
        }
        setCreatedOrder(confirmation)
        setForm({ ...DEFAULT_FORM })
        setSession({
          role: 'athlete_plu',
          athleteId: athlete.id,
          name: athlete.fullName,
          email: athlete.email,
        })
        return { athlete, confirmation }
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            error: error.message,
            code: error.body?.code ?? null,
            fields: error.body?.fields ?? null,
          }
        }
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
          membershipAttemptRef.current = {
            fingerprint: attemptFingerprint,
            idempotencyKey: crypto.randomUUID(),
          }
        }
        const { order, membership, plan } = await createMembershipOrderRequest(
          athlete.id,
          normalizedMethod,
          planCode,
          membershipAttemptRef.current.idempotencyKey,
        )
        const checkout =
          order.method === 'mercado_pago' && plan?.collectionMode !== 'recurring'
            ? await createPreferenceRequest({ paymentId: order.id })
            : null
        setMemberships((current) => [
          membership,
          ...current.filter(
            (item) => item.athleteId !== athlete.id || item.year !== membership.year,
          ),
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
          payerEmail: athlete.email ?? session?.email ?? null,
          paymentId: order.id,
          paymentMethod: order.method,
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: plan?.collectionMode === 'recurring' ? 'subscription' : 'payment',
          plan,
          ...payment,
        }
        setCreatedOrder(createdOrder)
        return { membership, payment, plan, createdOrder }
      } catch (error) {
        // El `code` viaja para que la pantalla que quedó bloqueada pueda
        // ofrecer la acción correcta (ej. reenviar el mail de verificación) en
        // vez de solo mostrar un texto.
        if (error instanceof ApiError)
          return { error: error.message, code: error.body?.code ?? null }
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
    async (event, selectedEvent, options = {}) => {
      event.preventDefault()
      const athlete = athletes.find((item) => item.id === session?.athleteId)
      if (!athlete) return { error: 'No se encontró el perfil del atleta.' }

      try {
        const purchaseType = options.purchaseType === 'combo' ? 'combo' : 'registration'
        const attemptFingerprint = JSON.stringify([
          athlete.id,
          selectedEvent.slug,
          form.division,
          form.category,
          form.estimatedWeight,
          form.paymentMethod,
          purchaseType,
        ])
        if (registrationAttemptRef.current?.fingerprint !== attemptFingerprint) {
          registrationAttemptRef.current = {
            fingerprint: attemptFingerprint,
            idempotencyKey: crypto.randomUUID(),
          }
        }
        const createRegistrationRequest = purchaseType === 'combo'
          ? createCompetitionRegistrationComboRequest
          : createCompetitionRegistrationRequest
        const { order, registration, membership, plan, comboOffer } = await createRegistrationRequest({
          athleteId: athlete.id,
          eventSlug: selectedEvent.slug,
          division: form.division,
          category: form.category,
          bodyweightKg: form.estimatedWeight
            ? Number(String(form.estimatedWeight).replace(',', '.'))
            : null,
          paymentMethod: form.paymentMethod,
          idempotencyKey: registrationAttemptRef.current.idempotencyKey,
        })
        const checkout =
          order.method === 'mercado_pago'
            ? await createPreferenceRequest({ paymentId: order.id })
            : null
        const enrichedRegistration = {
          ...registration,
          event: selectedEvent.title,
          eventSlug: selectedEvent.slug,
        }
        setRegistrations((current) => [enrichedRegistration, ...current])
        // El cupo público de ese evento acaba de cambiar: la landing y el
        // dossier de Pitbull lo repintan sin esperar el próximo tick de
        // polling. El número sigue saliendo del servidor, no de acá.
        invalidateEventRegistrationSummary(selectedEvent.slug)
        if (membership) {
          setMemberships((current) => [
            membership,
            ...current.filter(
              (item) => item.athleteId !== athlete.id || item.year !== membership.year,
            ),
          ])
        }
        const payment = {
          id: order.id,
          athleteId: athlete.id,
          concept: purchaseType === 'combo'
            ? `Afiliación + inscripción ${selectedEvent.title}`
            : `Inscripción ${selectedEvent.title}`,
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
          payerEmail: athlete.email ?? session?.email ?? null,
          paymentId: order.id,
          paymentMethod: order.method,
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: 'payment',
          purchaseType,
          plan,
          comboOffer,
          ...payment,
        }
        setCreatedOrder(createdOrder)
        return { registration: enrichedRegistration, membership, payment, plan, comboOffer, createdOrder }
      } catch (error) {
        // El servidor es la autoridad para el gate de membresía activa
        // (PLU05) y de inscripción duplicada (PLU08) -- antes esos dos
        // checks vivían solo del lado del cliente.
        if (error instanceof ApiError)
          return { error: error.message, code: error.body?.code ?? null }
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
        paymentMethod === 'transferencia' || paymentMethod === 'manual_link'
          ? 'manual'
          : paymentMethod
      try {
        const attemptFingerprint = JSON.stringify([purchaseEvent.slug, attendees, provider])
        if (ticketAttemptRef.current?.fingerprint !== attemptFingerprint) {
          ticketAttemptRef.current = {
            fingerprint: attemptFingerprint,
            idempotencyKey: crypto.randomUUID(),
            accessToken: `${crypto.randomUUID()}${crypto.randomUUID()}`,
          }
        }
        const {
          order,
          tickets: createdTickets,
          orderAccessToken,
        } = await createTicketOrderRequest({
          eventSlug: purchaseEvent.slug,
          attendees: attendees.map((attendee) => ({
            fullName: attendee.fullName,
            dni: attendee.dni,
            ticketTypeId: attendee.ticketTypeId,
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
        // Las entradas creadas ya ocupan cupo en el backend: el aviso de
        // disponibilidad tiene que dejar de mostrar el remaining anterior.
        invalidateTicketAvailability(purchaseEvent.slug)
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
          preferenceId: checkout?.preference?.id ?? null,
          paymentMode: 'payment',
          payerEmail: order.buyerEmail ?? order.payerEmail ?? session?.email ?? null,
          createdAt: order.createdAt,
        }
        setCreatedOrder(nextOrder)
        return { tickets: mappedTickets, createdOrder: nextOrder }
      } catch (error) {
        return { error: error.message ?? 'No se pudo completar la compra.' }
      }
    },
    [session],
  )

  // Aprobación operativa reservada a transferencias manuales. Las órdenes
  // Mercado Pago se acreditan exclusivamente mediante webhook.
  const approveTicketPurchase = useCallback(
    async (orderId) => {
      if (!hasPermission(session, 'admin.payments.approve')) {
        return { error: 'Sin permisos para aprobar pagos.' }
      }
      try {
        const { order, tickets: approvedTickets } = await approveTicketOrderRequest(orderId)
        setTickets((current) => {
          const byId = new Map(approvedTickets.map((ticket) => [ticket.id, ticket]))
          return current.map((item) =>
            byId.has(item.id) ? { ...item, status: byId.get(item.id).status } : item,
          )
        })
        setCreatedOrder((current) =>
          current?.orderId === orderId ? { ...current, status: order.status } : current,
        )
        setPendingTicketOrders((current) => current.filter((item) => item.orderId !== orderId))
      } catch (error) {
        console.error('approveTicketPurchase:', error)
        throw error
      }
    },
    [session],
  )

  const uploadTicketPaymentProofAction = useCallback(
    async (orderId, file) => {
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
    },
    [createdOrder],
  )

  const refreshPendingTicketOrders = useCallback(async () => {
    if (!hasPermission(session, 'admin.payments.read') || isDemoSession(session)) return
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
  }, [session])

  // Check-in en la puerta: el backend valida el qrToken y lo marca como
  // usado de forma atÃ³mica â€” dos escaneos simultÃ¡neos del mismo QR no
  // pueden dejar pasar a las dos personas (ver server/modules/ticketing).
  useEffect(() => {
    if (!hasPermission(session, 'admin.payments.read')) return undefined
    refreshPendingTicketOrders()
    return undefined
  }, [session, refreshPendingTicketOrders])

  const checkInTicketAction = useCallback(
    async (qrToken) => {
      if (!hasPermission(session, 'admin.checkin.execute')) {
        return { outcome: 'forbidden' }
      }
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
    },
    [session],
  )

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
  const checkInRegistrationAction = useCallback(
    async (registrationId, gate) => {
      if (!hasPermission(session, 'admin.checkin.execute')) {
        return { outcome: 'forbidden' }
      }
      try {
        const { registration } = await checkInRegistrationRequest(registrationId, gate)
        setRegistrations((current) =>
          current.map((item) =>
            item.id === registration.id ? { ...item, checkedInAt: registration.checkedInAt } : item,
          ),
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
    },
    [session],
  )

  // La asignación se persiste y se vuelve a validar en Express. El fallback
  // local queda únicamente para la sesión demo.
  const updateUserRoleAction = useCallback(
    async (userId, nextRole) => {
      if (isDemoSession(session)) {
        setUsers((current) => updateUserRole(current, userId, nextRole))
        return users.find((user) => user.id === userId) ?? null
      }

      const { user } = await updateStaffUserRoleRequest(userId, nextRole)
      setUsers((current) => current.map((item) => (item.id === user.id ? user : item)))
      return user
    },
    [session, users],
  )

  const updateUserStatusAction = useCallback(
    async (userId, nextStatus) => {
      if (isDemoSession(session)) {
        setUsers((current) => updateUserStatus(current, userId, nextStatus))
        return users.find((user) => user.id === userId) ?? null
      }

      const { user } = await updateStaffUserStatusRequest(userId, nextStatus)
      setUsers((current) => current.map((item) => (item.id === user.id ? user : item)))
      return user
    },
    [session, users],
  )

  // Alta real de staff (admin/operador/viewer): el backend crea la cuenta
  // invitada y manda un enlace firmado para elegir contraseña.
  const createUserAction = useCallback(async (draft) => {
    const { user, emailed } = await createStaffUserRequest(draft)
    setUsers((current) => [user, ...current.filter((item) => item.id !== user.id)])
    return { user, emailed }
  }, [])

  // Reenvío de invitación / reseteo: rota el enlace anterior y corta sesiones.
  const resetStaffPasswordAction = useCallback(async (userId, sendEmail = true) => {
    const { user, emailed } = await resetStaffPasswordRequest(userId, sendEmail)
    setUsers((current) => current.map((item) => (item.id === user.id ? user : item)))
    return { user, emailed }
  }, [])

  const acceptStaffInvitationAction = useCallback(
    async (payload) => {
      const { user } = await acceptStaffInvitationRequest(payload)
      setSession(user)
      return user
    },
    [setSession],
  )

  // Mi cuenta. El backend rota la cookie de sesión, así que se refresca la
  // sesión local con el usuario ya sin `mustChangePassword`.
  const changeOwnPasswordAction = useCallback(
    async (payload) => {
      const { user } = await changeOwnPasswordRequest(payload)
      setSession(user)
      return user
    },
    [setSession],
  )

  const requestEmailChangeAction = useCallback(async (payload) => {
    return requestEmailChangeRequest(payload)
  }, [])

  const deleteUserAction = useCallback(
    async (userId) => {
      if (isDemoSession(session)) {
        if (!canDeleteUsers(session)) {
          throw new Error('Solo Super Admin puede eliminar usuarios.')
        }
        setUsers((current) => deleteUser(current, userId))
        return { id: userId }
      }

      const { deletedUser } = await deleteStaffUserRequest(userId)
      setUsers((current) => deleteUser(current, deletedUser.id))
      return deletedUser
    },
    [session],
  )

  // Borrado definitivo del atleta: la cascada real la hace la RPC
  // delete_athlete en Supabase; acá se espeja la limpieza en el estado local
  // para que el panel no siga mostrando filas huérfanas hasta el próximo
  // refetch.
  const deleteAthleteAction = useCallback(
    async (athleteId) => {
      const applyLocalRemoval = () => {
        setAthletes((current) => current.filter((item) => item.id !== athleteId))
        setMemberships((current) => current.filter((item) => item.athleteId !== athleteId))
        setRegistrations((current) => current.filter((item) => item.athleteId !== athleteId))
        setPayments((current) => current.filter((item) => item.athleteId !== athleteId))
      }

      if (isDemoSession(session)) {
        if (!canDeleteAthletes(session)) {
          throw new Error('Solo Super Admin puede eliminar atletas.')
        }
        applyLocalRemoval()
        return { id: athleteId }
      }

      const { deletedAthlete } = await deleteAthleteRequest(athleteId)
      applyLocalRemoval()
      return deletedAthlete
    },
    [session],
  )

  const createAccessRoleAction = useCallback(
    async (draft) => {
      let createdRole
      let activityEntry

      if (isDemoSession(session)) {
        const normalizedName = draft.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        const key = `custom_${normalizedName || crypto.randomUUID().slice(0, 8)}`
        createdRole = {
          id: key,
          key,
          name: draft.name.trim(),
          description: draft.description?.trim() ?? '',
          baseRole: 'operador_plu_arg',
          isSystem: false,
          isProtected: false,
          assignableByAdmin: true,
          active: true,
          permissions: [...(draft.permissionKeys ?? [])],
          userCount: 0,
          canAssign: true,
          canManagePermissions: true,
        }
        activityEntry = {
          id: `demo-role-created-${Date.now()}`,
          action: 'access_role.created',
          roleId: createdRole.id,
          roleName: createdRole.name,
          actorName: session?.name ?? session?.email ?? null,
          createdAt: new Date().toISOString(),
          addedPermissions: [...createdRole.permissions],
          removedPermissions: [],
        }
      } else {
        const response = await createAccessRoleRequest(draft)
        createdRole = response.role
        activityEntry = response.activity
      }

      setAccessRoles((current) => [
        ...current.filter((role) => role.id !== createdRole.id),
        createdRole,
      ])
      if (activityEntry) {
        setRoleActivity((current) =>
          [activityEntry, ...current.filter((item) => item.id !== activityEntry.id)].slice(0, 20),
        )
      }
      return createdRole
    },
    [session],
  )

  const updateAccessRolePermissionsAction = useCallback(
    async (roleId, permissionKeys) => {
      let updatedRole
      let activityEntry
      const currentRole = accessRoles.find((role) => role.id === roleId)
      if (!currentRole) throw new Error('El rol seleccionado no existe.')

      if (isDemoSession(session)) {
        updatedRole = { ...currentRole, permissions: [...permissionKeys] }
        const beforePermissions = new Set(currentRole.permissions ?? [])
        const afterPermissions = new Set(permissionKeys)
        activityEntry = {
          id: `demo-role-updated-${Date.now()}`,
          action: 'access_role.permissions_updated',
          roleId: updatedRole.id,
          roleName: updatedRole.name,
          actorName: session?.name ?? session?.email ?? null,
          createdAt: new Date().toISOString(),
          addedPermissions: permissionKeys.filter(
            (permissionKey) => !beforePermissions.has(permissionKey),
          ),
          removedPermissions: [...beforePermissions].filter(
            (permissionKey) => !afterPermissions.has(permissionKey),
          ),
        }
      } else {
        const response = await updateAccessRolePermissionsRequest(roleId, permissionKeys)
        updatedRole = response.role
        activityEntry = response.activity
      }

      setAccessRoles((current) =>
        current.map((role) => (role.id === updatedRole.id ? updatedRole : role)),
      )
      setSession((current) => {
        if (!current || current.roleKey !== updatedRole.key) return current
        return {
          ...current,
          permissions: updatedRole.permissions,
          roleLabel: updatedRole.name,
        }
      })
      if (activityEntry) {
        setRoleActivity((current) =>
          [activityEntry, ...current.filter((item) => item.id !== activityEntry.id)].slice(0, 20),
        )
      }
      return updatedRole
    },
    [accessRoles, session, setSession],
  )

  const createSecurityUserAction = useCallback(async (draft) => {
    const { user, tempPassword, emailed, accessUrl, expiresAt } =
      await createSecurityUserRequest(draft)
    setUsers((current) => [
      { id: user.id, name: user.name, email: user.email, role: user.role },
      ...current.filter((item) => item.id !== user.id),
    ])
    return { user, tempPassword, emailed, accessUrl, expiresAt }
  }, [])

  const createSecurityUsersBulkAction = useCallback(async (draft) => {
    const { created, skipped } = await createSecurityUsersBulkRequest(draft)
    if (created.length) {
      setUsers((current) => [
        ...created.map(({ user }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        })),
        ...current.filter((item) => !created.some(({ user }) => user.id === item.id)),
      ])
    }
    return { created, skipped }
  }, [])

  const deactivateAllSecurityUsersAction = useCallback(async (eventId) => {
    const { deactivated } = await deactivateAllSecurityUsersRequest(eventId)
    return deactivated
  }, [])

  // Listado real (Prisma) de cuentas seguridad_plu_arg de un evento puntual
  // -- vive fuera de `users` a propósito: ese array es un cache local
  // ligero (ver getInitialUsers) que no refleja lo que hay en el backend
  // para este rol, así que el panel de "Seguridad" de cada evento pide su
  // propia lista en vez de confiar en `users`.
  const listSecurityUsersForEventAction = useCallback(
    async (eventId) => {
      if (isDemoSession(session)) {
        return users.filter((user) => user.role === 'seguridad_plu_arg' && user.eventId === eventId)
      }

      const { users: securityUsers } = await listSecurityUsersRequest(eventId)
      return securityUsers
    },
    [session, users],
  )

  const updateSecurityUserStatusAction = useCallback(async (userId, status) => {
    const { user } = await updateSecurityUserStatusRequest(userId, status)
    return user
  }, [])

  const createSecurityAccessLinkAction = useCallback(
    (userId, sendEmail = false) => createSecurityAccessLinkRequest(userId, sendEmail),
    [],
  )

  // Login passwordless de puerta: la credencial (token firmado) crea una
  // sesión real igual que loginRequest, incluyendo el puente de Supabase Auth.
  const loginWithGateToken = useCallback(
    async (token) => {
      const { user, supabaseAuth } = await securityGateRequest(token)
      setSession(user)
      await establishSupabaseSession(supabaseAuth)
      return user
    },
    [setSession],
  )

  const login = useCallback(
    async (credentialsOrAccountType) => {
      if (env.demoMode && credentialsOrAccountType === 'athlete') {
        const demoAthleteSession = {
          role: 'athlete_plu',
          athleteId: 'ath-001',
          name: 'Martina Rivas',
          email: 'martina.rivas@example.com',
        }
        setSession(demoAthleteSession)
        return demoAthleteSession
      }

      if (env.demoMode && credentialsOrAccountType === 'admin') {
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
        const emailRaw = String(credentialsOrAccountType.email ?? '')
          .trim()
          .toLowerCase()
        const email = emailRaw === 'demo' ? 'demo@pluarg.com.ar' : emailRaw
        const password = String(credentialsOrAccountType.password ?? '')

        if (env.demoMode && email === 'demo@pluarg.com.ar' && password === '123') {
          // Desde /evento/:slug/seguridad, demo entra como personal de puerta
          // del evento (no como admin del panel).
          const eventSlug = String(credentialsOrAccountType.eventSlug ?? '').trim()
          if (eventSlug) {
            const demoSecuritySession = {
              id: 'demo-security',
              role: 'seguridad_plu_arg',
              name: 'Seguridad Demo',
              email: 'demo@pluarg.com.ar',
              eventId: `demo-event-${eventSlug}`,
              eventSlug,
            }
            setSession(demoSecuritySession)
            return demoSecuritySession
          }

          const demoAdminSession = {
            id: 'demo-admin',
            role: 'admin_plu_arg',
            name: 'Admin Demo',
            email: 'demo@pluarg.com.ar',
          }
          setSession(demoAdminSession)
          return demoAdminSession
        }

        if (
          env.demoMode &&
          (emailRaw === 'demo2' || email === 'demo2@pluarg.com.ar') &&
          password === '123'
        ) {
          setMemberships((current) =>
            current.map((membership) =>
              membership.athleteId === 'ath-001' && membership.year === '2026'
                ? {
                    ...membership,
                    status: 'pendiente_pago',
                    paymentStatus: 'pendiente_pago',
                    mercadoPagoRef: '',
                  }
                : membership,
            ),
          )
          setAthletes((current) =>
            current.map((athlete) =>
              athlete.id === 'ath-001' ? { ...athlete, status: 'registrado' } : athlete,
            ),
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

        if (
          env.demoMode &&
          (emailRaw === 'demo3' || email === 'demo3@pluarg.com.ar') &&
          password === '123'
        ) {
          const demoPluSession = {
            id: 'demo-plu-usa',
            role: 'operador_plu_arg',
            roleKey: 'plu_arg',
            roleLabel: 'PLU',
            permissions: getDefaultPermissionsForRole('plu_arg'),
            name: 'Equipo PLU',
            email: 'demo3@pluarg.com.ar',
          }
          setSession(demoPluSession)
          return demoPluSession
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
        // 429 además de 401: el login de staff se prueba primero en cada
        // intento, así que si su limiter se agota (por ejemplo, muchos atletas
        // detrás del mismo NAT) no puede bloquear el login de atleta, que
        // tiene su propio cupo.
        if (error?.status !== 401 && error?.status !== 429) throw error
        const { user } = await loginAthleteSession(credentialsOrAccountType)
        setSession(user)
        return user
      }
    },
    [setSession],
  )

  const logout = useCallback(async () => {
    const currentSession = session
    setSession(null)

    if (currentSession?.role === 'athlete_plu' && !isDemoSession(currentSession)) {
      await logoutAthleteSession().catch((error) => {
        if (error.status !== 401) console.warn('No se pudo cerrar la sesion de atleta.', error)
      })
    } else if (currentSession?.role !== 'athlete_plu' && currentSession?.id !== 'demo-admin') {
      if (isSupabaseConfigured) {
        const supabase = await getSupabaseClient()
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
      if (!hasPermission(session, 'admin.payments.approve')) {
        return { error: 'Sin permisos para aprobar pagos.' }
      }
      try {
        const { order, membership, registration } =
          await approveAthletePaymentOrderRequest(paymentId)
        setPayments((c) =>
          c.map((p) =>
            p.id === paymentId ? { ...p, status: order.status, reference: order.reference } : p,
          ),
        )

        // Los emails de aprobación (comprobante, afiliación activa,
        // inscripción confirmada) los manda el backend dentro del mismo
        // endpoint, con registro en `transactional_email_logs`. Acá solo se
        // refleja el nuevo estado en la UI.
        if (membership) {
          setMemberships((c) => c.map((m) => (m.id === membership.id ? membership : m)))
          setAthletes((c) =>
            c.map((a) => (a.id === membership.athleteId ? { ...a, status: 'afiliado_activo' } : a)),
          )
        }

        if (registration) {
          setRegistrations((c) =>
            c.map((r) =>
              r.id === registration.id
                ? { ...r, status: registration.status, paymentStatus: order.status }
                : r,
            ),
          )
        }

        setCreatedOrder((c) => (c?.paymentId === paymentId ? { ...c, status: order.status } : c))
      } catch (error) {
        console.error('handleApprovePayment:', error)
        return { error: error?.message ?? 'No se pudo aprobar el pago.' }
      }
    },
    [session],
  )

  // Activación/baja manual desde el panel. El servidor vuelve a validar el
  // permiso y audita al responsable; este chequeo solo evita ofrecer una
  // acción que iba a rebotar.
  const setMembershipStatusAction = useCallback(
    async (membershipId, status) => {
      if (!hasPermission(session, 'admin.memberships.write')) {
        return { error: 'Sin permisos para editar afiliaciones.' }
      }
      try {
        const { membership } = await setMembershipStatusRequest(membershipId, status)
        setMemberships((current) =>
          current.map((item) => (item.id === membership.id ? { ...item, ...membership } : item)),
        )
        // El estado del atleta lo recalcula la RPC (afiliado_activo/registrado),
        // así que se refleja el padrón entero en vez de adivinarlo acá.
        void refreshAthleteData()
        return { membership }
      } catch (error) {
        if (error instanceof ApiError) return { error: error.message }
        throw error
      }
    },
    [refreshAthleteData, session],
  )

  /**
   * Post-asignación de grilla. El día y la tanda viven en la inscripción y
   * salen en el snapshot del panel, que es la misma proyección que alimenta la
   * columna de grilla y lo que ve seguridad al escanear el QR: se relee entero
   * en vez de parchear las filas tocadas, porque la RPC descarta las canceladas
   * y las de otro evento y el resultado real puede no ser el pedido.
   */
  const handleScheduleAssigned = useCallback(() => {
    void refreshAthleteData()
  }, [refreshAthleteData])

  const activateDemoMembership = useCallback(
    (athleteId) => {
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
        const existing = current.find(
          (membership) => membership.athleteId === athleteId && membership.year === '2026',
        )
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
        current.map((item) =>
          item.id === athleteId ? { ...item, status: 'afiliado_activo' } : item,
        ),
      )
      return { success: true }
    },
    [athletes],
  )

  const cancelDemoMembership = useCallback((athleteId) => {
    setMemberships((current) =>
      current.map((membership) =>
        membership.athleteId === athleteId && membership.year === '2026'
          ? {
              ...membership,
              status: 'pendiente_pago',
              paymentStatus: 'pendiente_pago',
              mercadoPagoRef: '',
            }
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
    if (!hasPermission(session, 'admin.exports.admin')) return
    const rows = buildAdminExportRows(registrations, athletes, memberships, payments)
    createCsv('plu-arg-admin-export.csv', rows)
  }, [registrations, athletes, memberships, payments, session])

  const exportPluUsaCsv = useCallback(() => {
    if (!hasPermission(session, 'admin.exports.plu_usa')) return
    const rows = buildPluUsaExportRows(athletes, memberships, registrations)
    createCsv('plu-usa-export.csv', rows)
  }, [athletes, memberships, registrations, session])

  const saveAdminEvent = useCallback(
    async (draft) => {
      if (!hasPermission(session, 'admin.events.write')) {
        return { error: 'Sin permisos para editar eventos.' }
      }

      if (isDemoSession(session)) {
        if (draft.id) {
          const result = updateAdminEvent(adminEvents, draft.id, draft)
          if (!result.event) return { error: 'No se encontró el evento.' }
          setAdminEvents(result.events)
          return { event: result.event, events: result.events }
        }

        const result = createAdminEvent(adminEvents, draft)
        setAdminEvents(result.events)
        return { event: result.event, events: result.events }
      }

      const sourceEvent = draft.id
        ? (adminEvents.find((event) => event.id === draft.id) ?? null)
        : null
      const result = await saveAdminEventRequest(draft, sourceEvent)
      setAdminEvents(result.events)
      setAdminEventsError(null)
      return result
    },
    [adminEvents, session],
  )

  /**
   * Habilitar/deshabilitar y cambiar el estado desde la lista, sin abrir el
   * editor. Va por `setEventStateRequest` y no por `saveAdminEvent` porque el
   * upsert completo recrea días y tipos de entrada en cada pasada.
   *
   * La base puede devolver un estado distinto al pedido (reabrir un evento que
   * sigue lleno lo deja en `agotado`); se propaga `statusOverridden` para que
   * la pantalla lo explique en vez de mostrar un badge que no coincide con lo
   * que el operador acaba de elegir.
   */
  const setAdminEventState = useCallback(
    async (slug, changes) => {
      if (!hasPermission(session, 'admin.events.write')) {
        return { error: 'Sin permisos para editar eventos.' }
      }
      if (!slug) return { error: 'Falta el slug del evento.' }

      if (isDemoSession(session)) {
        let updated = null
        const events = adminEvents.map((event) => {
          if (event.slug !== slug) return event
          const next = {
            ...event,
            status: changes.status ?? event.status,
            published: changes.published ?? event.published,
            updatedAt: new Date().toISOString(),
          }
          // El demo replica la regla de la base: sin esto el cupo lleno se
          // vería distinto según haya o no backend detrás.
          if (isEventFull(next) && OPEN_REGISTRATION_STATUSES.includes(next.status)) {
            next.status = 'agotado'
          } else if (next.status === 'agotado' && !isEventFull(next)) {
            next.status = 'inscripcion_abierta'
          }
          updated = next
          return next
        })

        if (!updated) return { error: 'No se encontró el evento.' }
        setAdminEvents(events)
        return {
          event: updated,
          events,
          statusOverridden: Boolean(changes.status) && changes.status !== updated.status,
        }
      }

      try {
        const result = await setEventStateRequest(slug, changes)
        setAdminEvents(result.events)
        setAdminEventsError(null)
        return result
      } catch (error) {
        return { error: error?.message ?? 'No se pudo cambiar el estado del evento.' }
      }
    },
    [adminEvents, session],
  )

  const refreshPricingConfiguration = useCallback(async () => {
    const currentSession = sessionRef.current
    if (!currentSession || !hasPermission(currentSession, 'admin.pricing.read')) return null

    if (isDemoSession(currentSession)) {
      const demoConfiguration = {
        plans: [],
        events: adminEvents.map((event) => ({
          id: event.id,
          slug: event.slug,
          title: event.title,
          registrationPrice: event.pricing?.registration ?? event.price ?? 0,
          currency: event.currency ?? 'ARS',
          comboOffer: null,
        })),
        availability: {
          editable: false,
          reason: isFeatureEnabled(FEATURE_KEYS.pricingWrites)
            ? 'demo_read_only'
            : 'production_coming_soon',
        },
      }
      setPricingConfiguration(demoConfiguration)
      return demoConfiguration
    }

    setPricingLoading(true)
    setPricingError(null)
    try {
      const configuration = await fetchPricingConfigurationRequest()
      setPricingConfiguration(configuration)
      return configuration
    } catch (error) {
      setPricingError(error?.message ?? 'No se pudo cargar la configuración económica.')
      return null
    } finally {
      setPricingLoading(false)
    }
  }, [adminEvents])

  const createMembershipPlanVersion = useCallback(async (plan) => {
    if (!hasPermission(session, 'admin.pricing.write') || !isFeatureEnabled(FEATURE_KEYS.pricingWrites)) {
      return { error: 'La configuración económica está disponible próximamente.' }
    }
    try {
      const created = await createMembershipPlanVersionRequest(plan)
      clearMembershipPlansCache()
      await refreshPricingConfiguration()
      return { plan: created }
    } catch (error) {
      return { error: error?.message ?? 'No se pudo publicar la versión del plan.' }
    }
  }, [refreshPricingConfiguration, session])

  const setMembershipPlanActive = useCallback(async (planId, active) => {
    if (!hasPermission(session, 'admin.pricing.write') || !isFeatureEnabled(FEATURE_KEYS.pricingWrites)) {
      return { error: 'La configuración económica está disponible próximamente.' }
    }
    try {
      const plan = await setMembershipPlanActiveRequest(planId, active)
      clearMembershipPlansCache()
      await refreshPricingConfiguration()
      return { plan }
    } catch (error) {
      return { error: error?.message ?? 'No se pudo cambiar el estado del plan.' }
    }
  }, [refreshPricingConfiguration, session])

  const saveEventComboOffer = useCallback(async (eventSlug, offer) => {
    if (!hasPermission(session, 'admin.pricing.write') || !isFeatureEnabled(FEATURE_KEYS.pricingWrites)) {
      return { error: 'La configuración económica está disponible próximamente.' }
    }
    try {
      const result = await saveEventComboOfferRequest(eventSlug, offer)
      await refreshPricingConfiguration()
      return result
    } catch (error) {
      return { error: error?.message ?? 'No se pudo guardar la oferta combo.' }
    }
  }, [refreshPricingConfiguration, session])

  const saveShopProduct = useCallback(
    (draft) => {
      if (!hasPermission(session, 'admin.shop.write')) {
        return { error: 'Sin permisos para editar productos.' }
      }
      const nextProducts = upsertShopProduct(shopProducts, draft)
      const savedProduct = draft.id
        ? nextProducts.find((product) => product.id === draft.id)
        : nextProducts[0]
      setShopProducts(nextProducts)
      return { product: savedProduct }
    },
    [shopProducts, session],
  )

  const deleteShopProductAction = useCallback(
    (productId) => {
      if (!hasPermission(session, 'admin.shop.write')) {
        return { error: 'Sin permisos para eliminar productos.' }
      }
      setShopProducts((current) => deleteShopProduct(current, productId))
      return { ok: true }
    },
    [session],
  )

  return {
    role,
    session,
    sessionPending,
    getSession,
    login,
    logout,
    athletes,
    memberships,
    registrations,
    payments,
    athleteDataLoading,
    athleteDataError,
    refreshAthleteData,
    tickets,
    pendingTicketOrders,
    pendingTicketOrdersLoading,
    pendingTicketOrdersError,
    createdOrder,
    form,
    filters,
    setFilters,
    dashboard,
    dashboardOverview,
    adminEvents,
    adminEventsLoading,
    adminEventsError,
    refreshAdminEvents,
    pricingConfiguration,
    pricingLoading,
    pricingError,
    refreshPricingConfiguration,
    createMembershipPlanVersion,
    setMembershipPlanActive,
    saveEventComboOffer,
    shopProducts,
    saveAdminEvent,
    setAdminEventState,
    saveShopProduct,
    deleteShopProductAction,
    filteredRegistrations,
    handleScheduleAssigned,
    enrichedMemberships,
    pendingActions,
    adminNavBadges,
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
    setMembershipStatusAction,
    submitTicketPurchase,
    uploadTicketPaymentProofAction,
    approveTicketPurchase,
    refreshPendingTicketOrders,
    checkInTicketAction,
    redeemTicketAddonAction,
    refreshTickets,
    checkInRegistrationAction,
    users,
    accessRoles,
    roleActivity,
    permissionCatalog,
    updateUserRoleAction,
    updateUserStatusAction,
    createUserAction,
    acceptStaffInvitationAction,
    changeOwnPasswordAction,
    requestEmailChangeAction,
    resetStaffPasswordAction,
    deleteUserAction,
    deleteAthleteAction,
    createAccessRoleAction,
    updateAccessRolePermissionsAction,
    createSecurityUserAction,
    createSecurityUsersBulkAction,
    createSecurityAccessLinkAction,
    deactivateAllSecurityUsersAction,
    listSecurityUsersForEventAction,
    updateSecurityUserStatusAction,
    loginWithGateToken,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
    demoMode: isDemoSession(session),
  }
}
