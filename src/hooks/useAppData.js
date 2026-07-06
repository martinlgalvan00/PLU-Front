import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, loginRequest, logoutRequest, meRequest, oauthSessionRequest } from '../lib/api.js'
import { DEFAULT_FORM } from '../lib/constants.js'
import { canEdit } from '../lib/roles.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import {
  approvePayment as approvePaymentAction,
  checkInRegistration,
  createAthleteProfile,
  createCompetitionOrder,
  createMembershipOrder,
  getInitialState,
  updateAthleteProfile,
} from '../services/athleteService.js'
import { readStorage, writeStorage } from '../services/storageService.js'
import {
  approveTicketOrder as approveTicketOrderRequest,
  checkInTicket as checkInTicketRequest,
  createTicketOrder as createTicketOrderRequest,
  listTicketsForEvent as listTicketsForEventRequest,
  mapApiTicket,
} from '../services/ticketApi.js'
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
  getInitialAdminEvents,
  updateAdminEvent,
} from '../services/eventAdminService.js'
import { enrichMemberships } from '../services/membershipService.js'

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
  const [athletes, setAthletes] = useState(() => getInitialState(storedData).athletes)
  const [memberships, setMemberships] = useState(() => getInitialState(storedData).memberships)
  const [registrations, setRegistrations] = useState(
    () => getInitialState(storedData).registrations,
  )
  const [payments, setPayments] = useState(() => getInitialState(storedData).payments)
  // Las entradas viven en Postgres, no en localStorage — este estado es
  // solo un cache de lo último que se creó/consultó vía la API real.
  const [tickets, setTickets] = useState([])
  const [createdOrder, setCreatedOrder] = useState(() => getInitialState(storedData).createdOrder)
  const [auditLogs, setAuditLogs] = useState(() => getInitialState(storedData).auditLogs)
  const [adminEvents, setAdminEvents] = useState(() => getInitialAdminEvents(storedData?.adminEvents))
  const [users, setUsers] = useState(() => getInitialUsers(storedData?.users))
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })

  const role = session?.role || null
  const userCanEdit = canEdit(role)

  useEffect(() => {
    writeStorage({
      athletes,
      memberships,
      registrations,
      payments,
      createdOrder,
      auditLogs,
      adminEvents,
      users,
    })
  }, [athletes, memberships, registrations, payments, createdOrder, auditLogs, adminEvents, users])

  useEffect(() => {
    let active = true

    meRequest()
      .then(({ user }) => {
        if (active) setSession(user)
      })
      .catch(async (error) => {
        if (!active) return

        if (error.status !== 401) {
          console.warn('No se pudo restaurar la sesion.', error)
          return
        }

        if (!oauth.configured || !oauth.isAuthenticated || oauth.isLoading) return

        try {
          const accessToken = await oauth.getAccessToken()
          if (!active || !accessToken) return

          const { user } = await oauthSessionRequest(accessToken)
          if (active) setSession(user)
        } catch (oauthError) {
          console.warn('No se pudo iniciar sesion con OAuth.', oauthError)
        }
      })

    return () => {
      active = false
    }
  }, [oauth])

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
    () => buildPendingActions({ payments, athletes, memberships, registrations }),
    [payments, athletes, memberships, registrations],
  )

  const adminNavBadges = useMemo(
    () => getAdminNavBadges({ payments, registrations }),
    [payments, registrations],
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
    (event) => {
      event.preventDefault()
      const result = createAthleteProfile(form, athletes)
      if (result.error) return result
      setAthletes((c) => [result.athlete, ...c])
      setCreatedOrder(result.confirmation)
      setAuditLogs((c) => [result.auditLog, ...c])
      setForm(result.resetForm)
      setSession({
        role: 'athlete_plu',
        athleteId: result.athlete.id,
        name: result.athlete.fullName,
        email: result.athlete.email,
      })
      return result
    },
    [form, athletes],
  )

  const submitMembership = useCallback(
    (event) => {
      event.preventDefault()
      const athlete = athletes.find((item) => item.id === session?.athleteId)
      if (!athlete) return { error: 'No se encontró el perfil del atleta.' }
      const result = createMembershipOrder({ athlete, form, memberships, payments })
      setMemberships((current) => [
        result.membership,
        ...current.filter((item) => item.athleteId !== athlete.id || item.year !== '2026'),
      ])
      setPayments((current) => [result.payment, ...current])
      setCreatedOrder(result.createdOrder)
      setAuditLogs((current) => [result.auditLog, ...current])
      return result
    },
    [athletes, form, memberships, payments, session],
  )

  const submitCompetition = useCallback(
    (event, selectedEvent) => {
      event.preventDefault()
      const athlete = athletes.find((item) => item.id === session?.athleteId)
      if (!athlete) return { error: 'No se encontró el perfil del atleta.' }
      const duplicate = registrations.some(
        (item) =>
          item.athleteId === athlete.id &&
          item.event === selectedEvent.title &&
          item.status !== 'cancelada',
      )
      if (duplicate) return { error: `Ya estás inscripto en ${selectedEvent.title}.` }
      const result = createCompetitionOrder({
        athlete,
        event: selectedEvent,
        form,
        registrations,
        payments,
      })
      setRegistrations((current) => [result.registration, ...current])
      setPayments((current) => [result.payment, ...current])
      setCreatedOrder(result.createdOrder)
      setAuditLogs((current) => [result.auditLog, ...current])
      return result
    },
    [athletes, form, payments, registrations, session],
  )

  // Compra pública de entradas — no requiere cuenta ni sesión: cualquiera
  // puede comprar para un evento dando el DNI de cada asistente. A
  // diferencia del resto del dominio, esto habla con el backend real
  // (Postgres): es la parte del sistema que necesita la garantía dura de
  // "no se puede duplicar/reusar", y esa garantía no existe sin una base
  // de datos real arbitrando el check-in.
  const submitTicketPurchase = useCallback(
    async (event, purchaseEvent, attendees, paymentMethod) => {
      event.preventDefault()
      try {
        const { order, tickets: createdTickets } = await createTicketOrderRequest({
          eventSlug: purchaseEvent.slug,
          attendees,
          provider: paymentMethod,
        })
        const mappedTickets = createdTickets.map((ticket) => mapApiTicket(ticket, purchaseEvent))
        setTickets((current) => [...mappedTickets, ...current])
        const nextOrder = {
          type: 'tickets',
          orderId: order.id,
          eventTitle: purchaseEvent.title,
          quantity: createdTickets.length,
          amount: order.amount,
          paymentMethod: order.provider,
          reference: order.reference,
          status: order.status,
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

  // Equivalente al "Simular pago" de afiliación/inscripción, pero para una
  // orden de entradas completa (puede cubrir varios tickets a la vez).
  const approveTicketPurchase = useCallback(async (orderId) => {
    try {
      const { order, tickets: approvedTickets } = await approveTicketOrderRequest(orderId)
      setTickets((current) => {
        const byId = new Map(approvedTickets.map((ticket) => [ticket.id, ticket]))
        return current.map((item) => (byId.has(item.id) ? { ...item, status: byId.get(item.id).status } : item))
      })
      setCreatedOrder((current) => (current?.orderId === orderId ? { ...current, status: order.status } : current))
    } catch (error) {
      console.error('approveTicketPurchase:', error)
    }
  }, [])

  // Check-in en la puerta: el backend valida el qrToken y lo marca como
  // usado de forma atómica — dos escaneos simultáneos del mismo QR no
  // pueden dejar pasar a las dos personas (ver server/modules/ticketing).
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

  // Refresca la lista de entradas de un evento desde el backend real —
  // la usa el panel de Seguridad, que necesita ver compras hechas desde
  // cualquier dispositivo, no solo las de esta pestaña.
  const refreshTickets = useCallback(async (eventSlug) => {
    try {
      const { tickets: apiTickets } = await listTicketsForEventRequest(eventSlug)
      setTickets(apiTickets.map((ticket) => mapApiTicket(ticket)))
    } catch (error) {
      console.error('refreshTickets:', error)
    }
  }, [])

  // Check-in en la puerta para un atleta inscripto (competidor) — separado
  // del check-in de entradas porque los atletas no tienen ticketCode/QR de
  // entrada, se buscan directo por su fila en el panel de seguridad.
  const checkInRegistrationAction = useCallback(
    (registrationId) => {
      const result = checkInRegistration(registrationId, registrations)
      if (result.outcome === 'ok') {
        setRegistrations((current) =>
          current.map((item) => (item.id === result.registration.id ? result.registration : item)),
        )
      }
      return result
    },
    [registrations],
  )

  // Gestión de cuentas del panel: solo quien tiene canManageUsers puede
  // cambiar roles o crear cuentas nuevas (se valida también en la UI).
  const updateUserRoleAction = useCallback((userId, nextRole) => {
    setUsers((current) => updateUserRole(current, userId, nextRole))
  }, [])

  const createUserAction = useCallback(
    (draft) => {
      setUsers((current) => createUser(current, draft))
    },
    [],
  )

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

      // La cuenta de seguridad SÍ pasa por el backend real (más abajo, loginRequest):
      // necesita una sesión de verdad porque el check-in muta datos reales en Postgres,
      // a diferencia del resto de la demo que vive en localStorage.
    }

    const { user } = await loginRequest(credentialsOrAccountType)
    const nextSession = user
    setSession(nextSession)
    return nextSession
  }, [])

  const logout = useCallback(async () => {
    const currentSession = session
    setSession(null)

    if (currentSession?.role !== 'athlete_plu' && currentSession?.id !== 'demo-admin') {
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
  }, [oauth, session])

  const handleApprovePayment = useCallback(
    async (paymentId) => {
      const payment = payments.find((item) => item.id === paymentId)
      if (!payment || !userCanEdit) return
      const result = await approvePaymentAction(paymentId, payments)
      if (!result) return

      setPayments((c) => c.map((p) => (p.id === paymentId ? result.payment : p)))
      setMemberships((c) =>
        c.map((m) =>
          result.payment.concept === 'Afiliación anual' && m.athleteId === result.athleteId
            ? {
                ...m,
                status: 'activa',
                paymentStatus: 'aprobado',
                mercadoPagoRef: result.payment.reference,
              }
            : m,
        ),
      )
      setRegistrations((c) =>
        c.map((r) =>
          result.payment.concept === `Inscripción ${r.event}` && r.athleteId === result.athleteId
            ? { ...r, status: 'confirmada', paymentStatus: 'aprobado' }
            : r,
        ),
      )
      setAthletes((c) =>
        c.map((a) =>
          a.id === result.athleteId && result.payment.concept === 'Afiliación anual'
            ? { ...a, status: 'afiliado_activo' }
            : a,
        ),
      )
      setCreatedOrder((c) => (c?.paymentId === paymentId ? { ...c, status: 'aprobado' } : c))
      setAuditLogs((c) => [result.auditLog, ...c])

      const athlete = athletes.find((a) => a.id === result.athleteId)
      if (athlete) await result.emails(athlete)
    },
    [userCanEdit, payments, athletes],
  )

  const updateAthleteProfileAction = useCallback(
    (athleteId, updates) => {
      const result = updateAthleteProfile(athleteId, updates, athletes)
      if (result.error) return result
      setAthletes(result.athletes)
      return result
    },
    [athletes],
  )

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
        if (!result.event) return { error: 'No se encontró el evento.' }
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
    registerAthlete,
    submitMembership,
    submitCompetition,
    submitTicketPurchase,
    approveTicketPurchase,
    checkInTicketAction,
    refreshTickets,
    checkInRegistrationAction,
    users,
    updateUserRoleAction,
    createUserAction,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
  }
}
