import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_FORM } from '../lib/constants.js'
import { canEdit } from '../lib/roles.js'
import {
  approvePayment as approvePaymentAction,
  createRegistrationFromForm,
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
  const [role, setRole] = useState('admin_maximal')
  const [athletes, setAthletes] = useState(() => getInitialState(storedData).athletes)
  const [memberships, setMemberships] = useState(() => getInitialState(storedData).memberships)
  const [registrations, setRegistrations] = useState(() => getInitialState(storedData).registrations)
  const [payments, setPayments] = useState(() => getInitialState(storedData).payments)
  const [createdOrder, setCreatedOrder] = useState(() => getInitialState(storedData).createdOrder)
  const [auditLogs, setAuditLogs] = useState(() => getInitialState(storedData).auditLogs)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [filters, setFilters] = useState({ status: 'all', event: 'all', query: '' })

  const userCanEdit = canEdit(role)

  useEffect(() => {
    writeStorage({ athletes, memberships, registrations, payments, createdOrder, auditLogs })
  }, [athletes, memberships, registrations, payments, createdOrder, auditLogs])

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

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault()
      const result = createRegistrationFromForm(form, athletes, memberships, registrations, payments)
      if (result.error) {
        alert(result.error)
        return
      }

      setAthletes((c) => [result.athlete, ...c])
      if (result.memberships.length) setMemberships((c) => [...result.memberships, ...c])
      if (result.registrations.length) setRegistrations((c) => [...result.registrations, ...c])
      setPayments((c) => [result.payment, ...c])
      setCreatedOrder(result.createdOrder)
      setAuditLogs((c) => [result.auditLog, ...c])
      setForm(result.resetForm)
    },
    [form, athletes, memberships, registrations, payments],
  )

  const handleApprovePayment = useCallback(
    async (paymentId) => {
      if (!userCanEdit) return
      const result = await approvePaymentAction(paymentId, payments)
      if (!result) return

      setPayments((c) => c.map((p) => (p.id === paymentId ? result.payment : p)))
      setMemberships((c) =>
        c.map((m) =>
          m.athleteId === result.athleteId
            ? { ...m, status: 'activa', paymentStatus: 'aprobado', mercadoPagoRef: result.payment.reference }
            : m,
        ),
      )
      setRegistrations((c) =>
        c.map((r) =>
          r.athleteId === result.athleteId
            ? { ...r, status: 'confirmada', paymentStatus: 'aprobado' }
            : r,
        ),
      )
      setAthletes((c) =>
        c.map((a) =>
          a.id === result.athleteId ? { ...a, status: 'afiliado_activo' } : a,
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

  return {
    role,
    setRole,
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
    handleSubmit,
    handleApprovePayment,
    exportAdminCsv,
    exportPluUsaCsv,
  }
}
