import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_FORM } from '../lib/constants.js'
import { canEdit } from '../lib/roles.js'
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

export function useAppData() {
  const storedData = useMemo(() => readStorage(), [])
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plu-arg-session')) }
    catch { return null }
  })
  const [athletes, setAthletes] = useState(() => getInitialState(storedData).athletes)
  const [memberships, setMemberships] = useState(() => getInitialState(storedData).memberships)
  const [registrations, setRegistrations] = useState(() => getInitialState(storedData).registrations)
  const [payments, setPayments] = useState(() => getInitialState(storedData).payments)
  const [createdOrder, setCreatedOrder] = useState(() => getInitialState(storedData).createdOrder)
  const [auditLogs, setAuditLogs] = useState(() => getInitialState(storedData).auditLogs)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })

  const role = session?.role || null
  const userCanEdit = canEdit(role)

  useEffect(() => {
    writeStorage({ athletes, memberships, registrations, payments, createdOrder, auditLogs })
  }, [athletes, memberships, registrations, payments, createdOrder, auditLogs])

  useEffect(() => {
    if (session) localStorage.setItem('plu-arg-session', JSON.stringify(session))
    else localStorage.removeItem('plu-arg-session')
  }, [session])

  const dashboard = useMemo(() => {
    const pendingPayments = payments.filter((p) =>
      ['pendiente_pago', 'pendiente', 'validacion_manual'].includes(p.status),
    ).length

    return [
      { label: 'Atletas', value: athletes.length, icon: 'users' },
      { label: 'Afiliaciones activas', value: memberships.filter((m) => m.status === 'activa').length, icon: 'badge' },
      { label: 'Pitbull Classic', value: registrations.length, icon: 'clipboard' },
      { label: 'Pagos pendientes', value: pendingPayments, icon: 'shield' },
    ]
  }, [athletes, memberships, payments, registrations])

  const enrichedRegistrations = useMemo(
    () =>
      registrations.map((registration) => ({
        ...registration,
        athlete: athletes.find((a) => a.id === registration.athleteId),
      })),
    [registrations, athletes],
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
      setSession({ role: 'athlete_plu', athleteId: result.athlete.id, name: result.athlete.fullName, email: result.athlete.email })
      return result
    },
    [form, athletes],
  )

  const submitMembership = useCallback((event) => {
    event.preventDefault()
    const athlete = athletes.find((item) => item.id === session?.athleteId)
    if (!athlete) return { error: 'No se encontró el perfil del atleta.' }
    const result = createMembershipOrder({ athlete, form, memberships, payments })
    setMemberships((current) => [result.membership, ...current.filter((item) => item.athleteId !== athlete.id || item.year !== '2026')])
    setPayments((current) => [result.payment, ...current])
    setCreatedOrder(result.createdOrder)
    setAuditLogs((current) => [result.auditLog, ...current])
    return result
  }, [athletes, form, memberships, payments, session])

  const submitCompetition = useCallback((event, selectedEvent) => {
    event.preventDefault()
    const athlete = athletes.find((item) => item.id === session?.athleteId)
    if (!athlete) return { error: 'No se encontró el perfil del atleta.' }
    const duplicate = registrations.some((item) => item.athleteId === athlete.id && item.event === selectedEvent.title && item.status !== 'cancelada')
    if (duplicate) return { error: `Ya estás inscripto en ${selectedEvent.title}.` }
    const result = createCompetitionOrder({ athlete, event: selectedEvent, form, registrations, payments })
    setRegistrations((current) => [result.registration, ...current])
    setPayments((current) => [result.payment, ...current])
    setCreatedOrder(result.createdOrder)
    setAuditLogs((current) => [result.auditLog, ...current])
    return result
  }, [athletes, form, payments, registrations, session])

  const login = useCallback((accountType) => {
    const nextSession = accountType === 'admin'
      ? { role: 'admin_plu', name: 'Administración PLU', email: 'admin@pluarg.com' }
      : { role: 'athlete_plu', athleteId: 'ath-001', name: 'Martina Rivas', email: 'martina.rivas@example.com' }
    setSession(nextSession)
    return nextSession
  }, [])

  const logout = useCallback(() => setSession(null), [])

  const handleApprovePayment = useCallback(
    async (paymentId) => {
      const payment = payments.find((item) => item.id === paymentId)
      const canApproveOwnPayment = session?.role === 'athlete_plu' && payment?.athleteId === session.athleteId
      if (!userCanEdit && !canApproveOwnPayment) return
      const result = await approvePaymentAction(paymentId, payments)
      if (!result) return

      setPayments((c) => c.map((p) => (p.id === paymentId ? result.payment : p)))
      setMemberships((c) =>
        c.map((m) =>
          result.payment.concept === 'Afiliación anual' && m.athleteId === result.athleteId
            ? { ...m, status: 'activa', paymentStatus: 'aprobado', mercadoPagoRef: result.payment.reference }
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
    [userCanEdit, payments, athletes, session],
  )

  const exportAdminCsv = useCallback(() => {
    const rows = buildAdminExportRows(registrations, athletes, memberships, payments)
    createCsv('plu-arg-admin-export.csv', rows)
  }, [registrations, athletes, memberships, payments])

  const exportPluUsaCsv = useCallback(() => {
    const rows = buildPluUsaExportRows(athletes, memberships, registrations)
    createCsv('plu-usa-export.csv', rows)
  }, [athletes, memberships, registrations])

  return {
    role,
    session,
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
    filteredRegistrations,
    updateForm,
    registerAthlete,
    submitMembership,
    submitCompetition,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
  }
}
