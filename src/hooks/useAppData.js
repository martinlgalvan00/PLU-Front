import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loginRequest, logoutRequest, meRequest, oauthSessionRequest } from '../lib/api.js'
import { DEFAULT_FORM } from '../lib/constants.js'
import { canEdit } from '../lib/roles.js'
import { usePluOAuth } from '../providers/oauthContext.js'
import {
  approvePayment as approvePaymentAction,
  createAthleteProfile,
  createCompetitionOrder,
  createMembershipOrder,
  getInitialState,
} from '../services/athleteService.js'
import { readStorage, writeStorage } from '../services/storageService.js'
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
  const [createdOrder, setCreatedOrder] = useState(() => getInitialState(storedData).createdOrder)
  const [auditLogs, setAuditLogs] = useState(() => getInitialState(storedData).auditLogs)
  const [adminEvents, setAdminEvents] = useState(() => getInitialAdminEvents(storedData?.adminEvents))
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })

  const role = session?.role || null
  const userCanEdit = canEdit(role)

  useEffect(() => {
    writeStorage({ athletes, memberships, registrations, payments, createdOrder, auditLogs, adminEvents })
  }, [athletes, memberships, registrations, payments, createdOrder, auditLogs, adminEvents])

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
    registerAthlete,
    submitMembership,
    submitCompetition,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
  }
}
