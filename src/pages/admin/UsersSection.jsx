import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Ban,
  CalendarCheck,
  CircleCheck,
  ChevronDown,
  KeyRound,
  Link2,
  CirclePause,
  Search,
  Shield,
  UserRound,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminEmptyState from '../../components/admin/AdminEmptyState.jsx'
import StaffInvitationNotice from '../../components/admin/StaffInvitationNotice.jsx'
import UserEventAccessDialog from '../../components/admin/UserEventAccessDialog.jsx'
import UsersBulkRoleBar from '../../components/admin/UsersBulkRoleBar.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRecordCount } from '../../i18n/adminHelpers.js'
import { isEventScopedRole } from '../../lib/permissions.js'
import { getRoleLabel } from '../../lib/roles.js'
import { isPendingInviteEmail, PENDING_INVITE_NAME } from '../../lib/staffInvitationRoute.js'
import {
  indexAthletesByEmail,
  listAssignableStaffRoles,
  normalizeEmail,
} from '../../services/staffAccessService.js'
import { isBulkRoleTarget, summarizeBulkRoleResults } from '../../services/userService.js'
import UsersInviteForm from './UsersInviteForm.jsx'
import UsersRowMenu from './UsersRowMenu.jsx'
import '../../styles/pages/admin-users.css'

const EMPTY_DRAFT = {
  name: '',
  email: '',
  role: 'plu_arg',
  eventId: '',
  eventIds: [],
  sendEmail: true,
}

const STATUS_FILTERS = [
  ['active', 'admin.users.statusActive'],
  ['invited', 'admin.users.statusInvited'],
  ['suspended', 'admin.users.statusSuspended'],
  ['disabled', 'admin.users.statusDisabled'],
]

function statusLabel(t, status) {
  switch (status) {
    case 'active':
      return t('admin.users.statusActive')
    case 'invited':
      return t('admin.users.statusInvited')
    case 'suspended':
      return t('admin.users.statusSuspended')
    case 'disabled':
      return t('admin.users.statusDisabled')
    default:
      return status ?? t('admin.users.statusUnknown')
  }
}

// Una invitación abierta todavía no tiene persona detrás: su email es un
// reservado y su nombre un rótulo. El panel muestra lo que falta, no el reservado.
function isOpenInvite(user) {
  return isPendingInviteEmail(user?.email)
}

function displayName(t, user) {
  return isOpenInvite(user) && (!user.name || user.name === PENDING_INVITE_NAME)
    ? t('admin.users.openInviteName')
    : (user.name ?? '—')
}

function formatLastAccess(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function displayEmail(t, user) {
  return isOpenInvite(user) ? t('admin.users.openInviteEmail') : user.email
}

export default function UsersSection({
  accessRoles,
  adminEvents,
  athletes,
  canDeleteUsers,
  canManageUsers,
  initialRoleFilter = null,
  onBulkUpdateRole,
  onCreateSecurityUser,
  onCreateUser,
  onDeleteUser,
  onNavigateRoles,
  onOpenAthlete,
  onResetPassword,
  onSetEventAccess,
  onUpdateRole,
  onUpdateStatus,
  permissionCatalog,
  users,
}) {
  const { locale, t } = useI18n()
  const formId = useId()
  const formRef = useRef(null)
  const newButtonRef = useRef(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Puede llegar prefijado desde Roles («Ver usuarios» de un rol).
  const [roleFilter, setRoleFilter] = useState(initialRoleFilter ?? 'all')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [bulkNotice, setBulkNotice] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [tempPassword, setTempPassword] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState(null)
  const [pendingDeletion, setPendingDeletion] = useState(null)
  // Organizador cuyos eventos se están editando, y el error del último intento.
  const [eventAccessTarget, setEventAccessTarget] = useState(null)
  const [eventAccessError, setEventAccessError] = useState('')
  // Cambio de rol → Organizador: pide eventos antes de confirmar el rol.
  const [pendingOrganizerRole, setPendingOrganizerRole] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteNotice, setDeleteNotice] = useState('')

  const isSecurityRole = draft.role === 'seguridad_plu_arg'
  const isOrganizerRole = isEventScopedRole(draft.role)

  const eventOptions = useMemo(
    () => (adminEvents ?? []).map((event) => [event.id, event.title]),
    [adminEvents],
  )
  // Del más alto al más bajo en jerarquía: quien invita suele buscar el rol por
  // su peso, y los roles a medida quedan al final, por nombre.
  const assignableRoles = useMemo(() => listAssignableStaffRoles(accessRoles), [accessRoles])
  // Quién del padrón del panel también es atleta: se marca y se enlaza a su ficha.
  const athleteByEmail = useMemo(() => indexAthletesByEmail(athletes), [athletes])
  const roleOptions = useMemo(
    () => assignableRoles.map((role) => [role.key, role.name]),
    [assignableRoles],
  )

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const user of users) {
      const key = user.status ?? 'active'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [users])

  // Solo se ofrecen los estados que existen en el padrón: con un único estado
  // el filtro no separa nada, así que el control ni se dibuja (salvo que haya
  // quedado uno aplicado, para poder soltarlo).
  const statusOptions = useMemo(
    () => [
      ['all', t('admin.users.allStatuses')],
      ...STATUS_FILTERS.filter(
        ([value]) => (statusCounts[value] ?? 0) > 0 || value === statusFilter,
      ).map(([value, key]) => [value, `${t(key)} · ${statusCounts[value] ?? 0}`]),
    ],
    [statusCounts, statusFilter, t],
  )
  const distinctStatuses = Object.keys(statusCounts).length
  const showStatusFilter = distinctStatuses > 1 || statusFilter !== 'all'

  // Los roles que existen en el padrón, con cuántas cuentas tiene cada uno.
  const roleCounts = useMemo(() => {
    const counts = new Map()
    for (const user of users) {
      const key = user.roleKey ?? user.role
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { label: getRoleLabel(user), count: 1 })
    }
    return counts
  }, [users])
  const roleFilterOptions = useMemo(
    () => [
      ['all', t('admin.users.allRoles')],
      ...[...roleCounts.entries()]
        .sort((first, second) => first[1].label.localeCompare(second[1].label, 'es'))
        .map(([value, { label, count }]) => [value, `${label} · ${count}`]),
      // Un filtro heredado de otra pantalla puede apuntar a un rol sin cuentas:
      // se deja ver para poder soltarlo.
      ...(roleFilter !== 'all' && !roleCounts.has(roleFilter)
        ? [[roleFilter, `${roleFilter} · 0`]]
        : []),
    ],
    [roleCounts, roleFilter, t],
  )
  const showRoleFilter = roleCounts.size > 1 || roleFilter !== 'all'

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      const status = user.status ?? 'active'
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (roleFilter !== 'all' && (user.roleKey ?? user.role) !== roleFilter) return false
      if (!normalizedQuery) return true
      return (
        user.name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [users, query, statusFilter, roleFilter])

  function clearFilters() {
    setQuery('')
    setStatusFilter('all')
    setRoleFilter('all')
  }

  const isGloballyEmpty = users.length === 0
  const isFilteredEmpty = !isGloballyEmpty && rows.length === 0
  const emptyMessage = isGloballyEmpty ? (
    <AdminEmptyState
      icon={Shield}
      title={t('admin.sections.users.emptyTitle')}
      lead={t('admin.sections.users.emptyLead')}
    />
  ) : isFilteredEmpty ? (
    <AdminEmptyState
      icon={Shield}
      filtered
      title={t('admin.sections.users.emptyFilteredTitle')}
      lead={t('admin.sections.users.emptyFiltered')}
      actionLabel={t('admin.sections.users.clearFilters')}
      onAction={clearFilters}
    />
  ) : null

  useEffect(() => {
    if (!isCreating) return undefined
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.querySelector('input[name="name"]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isCreating])

  useEffect(() => {
    if (!isCreating) return undefined

    function handleKeyDown(event) {
      if (event.key !== 'Escape' || isSubmitting) return
      event.preventDefault()
      setIsCreating(false)
      setDraft(EMPTY_DRAFT)
      setFormError('')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreating, isSubmitting])

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }))
    // Al corregir un campo se le saca la marca de error sin esperar al reenvío.
    setFieldErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch)) delete next[key]
      return next
    })
  }

  function closeCreateForm() {
    setIsCreating(false)
    setDraft(EMPTY_DRAFT)
    setFormError('')
    setFieldErrors({})
    // El botón "Cancelar" desaparece al cerrar: el foco vuelve a "Nuevo usuario".
    window.requestAnimationFrame(() => newButtonRef.current?.focus())
  }

  function openCreateForm() {
    setFormError('')
    setTempPassword(null)
    setIsCreating(true)
  }

  async function handleAddUser(event) {
    event.preventDefault()
    const name = draft.name.trim()
    const email = draft.email.trim().toLowerCase()
    // Seguridad es nominal (credencial de puerta). El resto puede ser una
    // invitación abierta: sin email, la persona completa sus datos al abrir el
    // enlace. Con email hace falta también el nombre; con nombre, un nombre real.
    const needsIdentity = isSecurityRole || Boolean(email)
    if ((needsIdentity || name) && name.length < 3) {
      setFieldErrors({ name: true })
      setFormError(t('admin.users.errorName'))
      return
    }
    if ((isSecurityRole || email) && !/^\S+@\S+\.\S+$/.test(email)) {
      setFieldErrors({ email: true })
      setFormError(t('admin.users.errorEmail'))
      return
    }
    // Mismo chequeo que hace el servidor, pero antes de ir y volver.
    if (email && users.some((user) => user.email?.trim().toLowerCase() === email)) {
      setFieldErrors({ email: true })
      setFormError(t('admin.users.errorEmailTaken'))
      return
    }
    if (isSecurityRole && !draft.eventId) {
      setFieldErrors({ eventId: true })
      setFormError(t('admin.users.errorEvent'))
      return
    }
    if (isOrganizerRole && (!Array.isArray(draft.eventIds) || draft.eventIds.length === 0)) {
      setFieldErrors({ eventIds: true })
      setFormError(t('admin.users.errorOrganizerEvents'))
      return
    }

    setFieldErrors({})
    setFormError('')
    setTempPassword(null)

    setIsSubmitting(true)
    try {
      if (!isSecurityRole) {
        const { user, emailed, invitationUrl, invitationExpiresAt } = await onCreateUser(draft)
        setTempPassword({
          name: user?.name ?? name,
          email: user?.email ?? email,
          open: !email,
          roleName: assignableRoles.find((role) => role.key === draft.role)?.name ?? '',
          password: null,
          emailed,
          emailRequested: draft.sendEmail && Boolean(email),
          invitationUrl: invitationUrl ?? null,
          expiresAt: invitationExpiresAt ?? null,
          mode: 'invitation',
        })
        setDraft(EMPTY_DRAFT)
        setIsCreating(false)
        return
      }

      const { user, tempPassword: password } = await onCreateSecurityUser(draft)
      setTempPassword({ email: user.email, password, emailed: false, mode: 'security' })
      setDraft(EMPTY_DRAFT)
      setIsCreating(false)
    } catch (error) {
      setFormError(
        error?.status === 409 ? t('admin.users.errorEmailTaken') : t('admin.users.errorCreate'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRoleChange(userId, roleKey) {
    setFormError('')
    const target = users.find((user) => user.id === userId)
    // Pasar a Organizador exige autorizar eventos en el mismo acto.
    if (isEventScopedRole(roleKey) && target && !isEventScopedRole(target.roleKey ?? target.role)) {
      setEventAccessError('')
      setPendingOrganizerRole({ user: target, roleKey })
      return
    }
    setUpdatingUserId(userId)
    try {
      await onUpdateRole(userId, roleKey)
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorRoleUpdate'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  function closePendingOrganizerRole() {
    if (updatingUserId) return
    setPendingOrganizerRole(null)
    setEventAccessError('')
  }

  async function handleConfirmOrganizerRole(eventIds) {
    if (!pendingOrganizerRole || !onUpdateRole) return
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      setEventAccessError(t('admin.users.errorOrganizerEvents'))
      return
    }
    setEventAccessError('')
    setUpdatingUserId(pendingOrganizerRole.user.id)
    try {
      await onUpdateRole(pendingOrganizerRole.user.id, pendingOrganizerRole.roleKey, eventIds)
      setPendingOrganizerRole(null)
    } catch (error) {
      setEventAccessError(error?.message ?? t('admin.users.errorRoleUpdate'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  // Emite una invitación nueva (la anterior queda inválida). `sendEmail: false`
  // sólo genera el enlace para copiarlo. Nunca vuelve una contraseña.
  async function handleResetPassword(user, sendEmail = true) {
    if (!onResetPassword) return
    setFormError('')
    setTempPassword(null)
    setUpdatingUserId(user.id)
    try {
      const { emailed, invitationUrl, invitationExpiresAt } = await onResetPassword(
        user.id,
        sendEmail,
      )
      setTempPassword({
        name: user.name,
        email: user.email,
        open: isOpenInvite(user),
        roleName: getRoleLabel(user),
        password: null,
        emailed,
        emailRequested: sendEmail && !isOpenInvite(user),
        invitationUrl: invitationUrl ?? null,
        expiresAt: invitationExpiresAt ?? null,
        mode: 'reset',
      })
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorReset'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleStatusChange(userId, nextStatus) {
    if (!onUpdateStatus) return
    setFormError('')
    setUpdatingUserId(userId)
    try {
      await onUpdateStatus(userId, nextStatus)
    } catch (error) {
      setFormError(error?.message ?? t('admin.users.errorStatusUpdate'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  function openEventAccessDialog(user) {
    setEventAccessError('')
    setEventAccessTarget(user)
  }

  function closeEventAccessDialog() {
    if (updatingUserId) return
    setEventAccessTarget(null)
    setEventAccessError('')
  }

  async function handleSaveEventAccess(eventIds) {
    if (!eventAccessTarget || !onSetEventAccess) return
    setEventAccessError('')
    setUpdatingUserId(eventAccessTarget.id)
    try {
      await onSetEventAccess(eventAccessTarget.id, eventIds)
      setEventAccessTarget(null)
    } catch (error) {
      setEventAccessError(error?.message ?? t('admin.users.eventAccess.saveError'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  function openDeleteDialog(user) {
    setDeleteError('')
    setDeleteNotice('')
    setPendingDeletion(user)
  }

  function closeDeleteDialog() {
    if (updatingUserId) return
    setPendingDeletion(null)
    setDeleteError('')
  }

  async function handleDeleteUser() {
    if (!pendingDeletion || !onDeleteUser) return
    setDeleteError('')
    setUpdatingUserId(pendingDeletion.id)

    try {
      await onDeleteUser(pendingDeletion.id)
      setDeleteNotice(t('admin.users.deleteSuccess', { name: displayName(t, pendingDeletion) }))
      setPendingDeletion(null)
    } catch (error) {
      setDeleteError(error?.message ?? t('admin.users.errorDelete'))
    } finally {
      setUpdatingUserId(null)
    }
  }

  // Cambio de rol en lote. La selección sobrevive a los filtros (para armar un
  // lote desde varias búsquedas) pero sólo cuenta lo que sigue en el padrón y se
  // puede cambiar; el servidor vuelve a validar cada cuenta.
  const canBulkChangeRole = canManageUsers && Boolean(onBulkUpdateRole) && roleOptions.length > 0
  // Seguridad se asigna desde el evento; Organizador pide eventos por cuenta.
  const bulkRoleOptions = useMemo(
    () =>
      roleOptions.filter(
        ([value]) => value !== 'seguridad_plu_arg' && !isEventScopedRole(value),
      ),
    [roleOptions],
  )
  const selectedTargets = useMemo(() => {
    const selected = new Set(selectedRowKeys)
    return users.filter((user) => selected.has(user.id) && isBulkRoleTarget(user))
  }, [selectedRowKeys, users])

  async function handleBulkRoleChange(roleKey) {
    const ids = selectedTargets.map((user) => user.id)
    const results = await onBulkUpdateRole(ids, roleKey)
    const summary = summarizeBulkRoleResults(results)
    const namesById = new Map(selectedTargets.map((user) => [user.id, displayName(t, user)]))
    setBulkNotice({
      ...summary,
      roleName: roleOptions.find(([value]) => value === roleKey)?.[1] ?? roleKey,
      failed: summary.failed.map((item) => ({
        ...item,
        name: namesById.get(item.userId) ?? item.userId,
      })),
    })
    // Queda tildado sólo lo que falló: es lo que hay que revisar o reintentar.
    setSelectedRowKeys(summary.failed.map((item) => item.userId))
  }

  function canMutateUser(row) {
    return (
      row.role !== 'admin_maximal' &&
      ((canManageUsers && Boolean(onUpdateStatus)) ||
        (canManageUsers && Boolean(onResetPassword)) ||
        (canManageUsers && Boolean(onSetEventAccess) && row.eventScoped === true) ||
        (canDeleteUsers && Boolean(onDeleteUser)))
    )
  }

  const isFiltering = query.trim() !== '' || statusFilter !== 'all' || roleFilter !== 'all'
  const showActionsColumn = users.some(canMutateUser)

  function toggleCreateForm() {
    if (isCreating) {
      if (!isSubmitting) closeCreateForm()
      return
    }
    openCreateForm()
  }

  // Lo menos frecuente y lo irreversible van al menú. "Dar de baja" pide un
  // segundo toque dentro del propio menú; "Eliminar" abre su diálogo.
  function buildMenuItems(row) {
    const status = row.status ?? 'active'
    const canUpdateStatus = canManageUsers && Boolean(onUpdateStatus)
    const canDelete = canDeleteUsers && Boolean(onDeleteUser)
    const canReset = canManageUsers && Boolean(onResetPassword)
    const items = []
    const athlete = athleteByEmail.get(normalizeEmail(row.email))

    if (athlete && onOpenAthlete) {
      items.push({
        key: 'athlete',
        label: t('admin.users.actionViewAthlete'),
        icon: UserRound,
        onSelect: () => onOpenAthlete(athlete.id),
      })
    }
    // Solo para cuentas con rol por evento (Organizador): decide qué eventos gestiona.
    if (canManageUsers && onSetEventAccess && row.eventScoped) {
      items.push({
        key: 'event-access',
        label: t('admin.users.actionEventAccess'),
        icon: CalendarCheck,
        onSelect: () => openEventAccessDialog(row),
      })
    }
    if (canUpdateStatus && (status === 'active' || status === 'suspended')) {
      const isActive = status === 'active'
      items.push({
        key: 'toggle',
        label: isActive ? t('admin.users.actionSuspend') : t('admin.users.actionActivate'),
        icon: isActive ? CirclePause : CircleCheck,
        onSelect: () => void handleStatusChange(row.id, isActive ? 'suspended' : 'active'),
      })
    }
    if (status === 'disabled' && canUpdateStatus) {
      items.push({
        key: 'activate',
        label: t('admin.users.actionActivate'),
        icon: CircleCheck,
        onSelect: () => void handleStatusChange(row.id, 'active'),
      })
    }
    if (canReset) {
      items.push({
        key: 'link',
        label: t('admin.users.actionLink'),
        icon: Link2,
        onSelect: () => void handleResetPassword(row, false),
      })
      // Sin email propio no hay a quién mandarle el mail: sólo se regenera el enlace.
      if (!isOpenInvite(row)) {
        items.push({
          key: 'reset',
          label: t('admin.users.actionReset'),
          icon: KeyRound,
          onSelect: () => void handleResetPassword(row, true),
        })
      }
    }
    if (canUpdateStatus && status !== 'disabled') {
      items.push({
        key: 'disable',
        label: t('admin.users.actionDisable'),
        confirmLabel: t('admin.users.confirmDisable'),
        icon: Ban,
        tone: 'danger',
        onSelect: () => void handleStatusChange(row.id, 'disabled'),
      })
    }
    if (canDelete) {
      items.push({
        key: 'delete',
        label: t('admin.users.actionDelete'),
        icon: Trash2,
        tone: 'danger',
        onSelect: () => openDeleteDialog(row),
      })
    }
    return items
  }

  const columns = [
    {
      key: 'name',
      label: t('admin.columns.user'),
      mobile: 'primary',
      sortable: true,
      render: (row) => (
        <div className="admin-users__who">
          <span
            className={`admin-users__monogram${row.role === 'admin_maximal' ? ' is-owner' : ''}${isOpenInvite(row) ? ' is-open' : ''}`}
            aria-hidden
          >
            {isOpenInvite(row) ? (
              <Link2 size={14} />
            ) : (
              (row.name?.trim()?.charAt(0)?.toUpperCase() ?? '?')
            )}
          </span>
          <span className="admin-users__who-copy">
            <strong className="admin-users__who-name">
              {displayName(t, row)}
              {athleteByEmail.has(normalizeEmail(row.email)) ? (
                <span className="admin-users__tag">{t('admin.users.alsoAthlete')}</span>
              ) : null}
              {row.eventScoped ? (
                <span className="admin-users__tag">
                  {(row.eventAccess ?? []).length === 0
                    ? t('admin.users.eventAccess.tagNone')
                    : (row.eventAccess ?? []).length === 1
                      ? t('admin.users.eventAccess.tagOne')
                      : t('admin.users.eventAccess.tagMany', { count: row.eventAccess.length })}
                </span>
              ) : null}
            </strong>
            <span className="admin-users__who-email" title={displayEmail(t, row)}>
              {displayEmail(t, row)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      label: t('admin.columns.role'),
      mobile: 'badge',
      sortable: true,
      className: 'data-table__column--role',
      width: 190,
      render: (row) => {
        const roleKey = row.roleKey ?? row.role
        const canEditRole =
          canManageUsers &&
          row.role !== 'admin_maximal' &&
          roleOptions.some(([optionKey]) => optionKey === roleKey)

        if (!canEditRole) {
          return <span className="admin-users__role-text">{getRoleLabel(row)}</span>
        }

        const busy = updatingUserId === row.id

        return (
          <label
            className={`admin-users__role-select${busy ? ' is-busy' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <select
              name={`role-${row.id}`}
              value={roleKey}
              disabled={busy}
              aria-label={`${t('admin.columns.role')}: ${displayName(t, row)}`}
              onChange={(event) => handleRoleChange(row.id, event.target.value)}
            >
              {roleOptions.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </label>
        )
      },
    },
    {
      key: 'status',
      label: t('admin.columns.status'),
      mobile: 'badge',
      sortable: true,
      width: 140,
      sortAccessor: (row) => row.status ?? 'active',
      render: (row) => {
        const status = row.status ?? 'active'
        return (
          <span className={`admin-users__status admin-users__status--${status}`}>
            <span className="admin-users__status-dot" aria-hidden />
            {statusLabel(t, status)}
          </span>
        )
      },
    },
    {
      key: 'lastLoginAt',
      label: t('admin.users.lastAccess'),
      mobile: 'hidden',
      sortable: true,
      width: 170,
      sortAccessor: (row) => row.lastLoginAt ?? '',
      render: (row) => {
        if (row.lastLoginAt) {
          return (
            <span className="admin-users__last-access">
              {formatLastAccess(row.lastLoginAt, locale)}
            </span>
          )
        }
        return (
          <span className="admin-users__last-access is-empty">
            {(row.status ?? 'active') === 'invited'
              ? t('admin.users.pendingActivation')
              : t('admin.users.neverSignedIn')}
          </span>
        )
      },
    },
    ...(showActionsColumn
      ? [
          {
            key: 'actions',
            label: t('admin.columns.action'),
            mobile: 'action',
            sortable: false,
            mobileSortable: false,
            width: 64,
            className: 'data-table__column--actions admin-users__column-actions',
            render: (row) => {
              if (!canMutateUser(row)) return null

              const busy = updatingUserId === row.id

              return (
                <div
                  className="admin-users__row-actions"
                  role="group"
                  aria-label={t('admin.users.actionsAria', { name: displayName(t, row) })}
                  onClick={(event) => event.stopPropagation()}
                >
                  {busy ? (
                    <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
                  ) : null}
                  <UsersRowMenu
                    label={t('admin.actions.more')}
                    items={buildMenuItems(row)}
                    disabled={busy}
                  />
                </div>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <section className="admin-users" aria-label={t('admin.sections.users.title')}>
      <div className="admin-users__toolbar">
        {!isGloballyEmpty ? (
          <div className="admin-users__search" role="search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              name="users-search"
              value={query}
              placeholder={t('admin.search.users')}
              aria-label={t('admin.search.users')}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="admin-users__search-clear"
                aria-label={t('admin.filters.clearFilter')}
                onClick={() => setQuery('')}
              >
                <X size={13} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {showStatusFilter ? (
          <label className={`admin-users__filter${statusFilter !== 'all' ? ' is-active' : ''}`}>
            <select
              name="users-status"
              value={statusFilter}
              aria-label={t('admin.filters.status')}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </label>
        ) : null}

        {showRoleFilter ? (
          <label className={`admin-users__filter${roleFilter !== 'all' ? ' is-active' : ''}`}>
            <select
              name="users-role"
              value={roleFilter}
              aria-label={t('admin.columns.role')}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              {roleFilterOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={13} aria-hidden />
          </label>
        ) : null}

        <span className="admin-users__count" aria-live="polite">
          {isFiltering
            ? formatRecordCount(t, rows.length, users.length)
            : users.length === 1
              ? t('admin.users.totalOne')
              : t('admin.users.total', { count: users.length })}
        </span>

        {canManageUsers ? (
          <div className="admin-users__toolbar-actions">
            {onNavigateRoles ? (
              <button type="button" className="admin-users__link" onClick={onNavigateRoles}>
                <Shield size={15} aria-hidden />
                <span>{t('admin.users.managePermissions')}</span>
              </button>
            ) : null}
            {isCreating ? (
              <button
                type="button"
                className="admin-users__link"
                aria-controls={formId}
                aria-expanded
                onClick={toggleCreateForm}
              >
                <X size={15} aria-hidden />
                <span>{t('admin.users.cancel')}</span>
              </button>
            ) : (
              <Button
                ref={newButtonRef}
                type="button"
                variant="gold"
                className="btn--small admin-users__new-btn"
                aria-controls={formId}
                aria-expanded={false}
                onClick={toggleCreateForm}
              >
                <UserPlus size={15} aria-hidden />
                <span>{t('admin.users.newUser')}</span>
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {canManageUsers && isCreating ? (
        <UsersInviteForm
          adminEvents={adminEvents ?? []}
          draft={draft}
          eventOptions={eventOptions}
          fieldErrors={fieldErrors}
          formId={formId}
          formRef={formRef}
          isSecurityRole={isSecurityRole}
          isSubmitting={isSubmitting}
          onDraftChange={updateDraft}
          onSubmit={handleAddUser}
          permissionCatalog={permissionCatalog}
          roles={assignableRoles}
          t={t}
        />
      ) : null}

      {formError ? (
        <p className="admin-users__notice admin-users__notice--error" role="alert">
          {formError}
        </p>
      ) : null}
      {canBulkChangeRole ? (
        <UsersBulkRoleBar
          count={selectedTargets.length}
          onApply={handleBulkRoleChange}
          onClear={() => setSelectedRowKeys([])}
          roleOptions={bulkRoleOptions}
        />
      ) : null}
      {bulkNotice ? (
        <div className="admin-users__notice" role="status">
          <p>
            {[
              bulkNotice.updated > 0
                ? t('admin.users.bulk.resultUpdated', {
                    count: bulkNotice.updated,
                    role: bulkNotice.roleName,
                  })
                : null,
              bulkNotice.unchanged > 0
                ? t('admin.users.bulk.resultUnchanged', { count: bulkNotice.unchanged })
                : null,
              bulkNotice.failed.length > 0
                ? t('admin.users.bulk.resultFailed', { count: bulkNotice.failed.length })
                : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
          {bulkNotice.failed.length > 0 ? (
            <ul className="admin-users__bulk-failures">
              {bulkNotice.failed.map((item) => (
                <li key={item.userId}>
                  <strong>{item.name}</strong>: {item.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {deleteNotice ? (
        <p className="admin-users__notice" role="status">
          {deleteNotice}
        </p>
      ) : null}
      {tempPassword ? (
        <StaffInvitationNotice
          key={tempPassword.invitationUrl ?? tempPassword.email}
          info={tempPassword}
          locale={locale}
          onDismiss={() => setTempPassword(null)}
          t={t}
        />
      ) : null}

      {isGloballyEmpty ? (
        <div className="admin-users__empty">{emptyMessage}</div>
      ) : (
        <AdminDataTable
          variant="admin"
          density="compact"
          className="admin-users__table"
          columns={columns}
          rows={rows}
          emptyMessage={emptyMessage}
          rowSelection={
            canBulkChangeRole
              ? {
                  selectedRowKeys,
                  onChange: (keys) => {
                    setBulkNotice(null)
                    setSelectedRowKeys(keys)
                  },
                  preserveSelectedRowKeys: true,
                  // En tabla antd no etiqueta el checkbox: sin esto no tendría nombre.
                  getCheckboxProps: (row) => ({
                    disabled: !isBulkRoleTarget(row),
                    'aria-label': t('admin.table.selectRow', { name: displayName(t, row) }),
                  }),
                }
              : undefined
          }
          getRowSelectLabel={(row) => t('admin.table.selectRow', { name: displayName(t, row) })}
        />
      )}

      {eventAccessTarget ? (
        <UserEventAccessDialog
          busy={updatingUserId === eventAccessTarget.id}
          error={eventAccessError}
          events={adminEvents ?? []}
          initialEventIds={(eventAccessTarget.eventAccess ?? []).map((grant) => grant.eventId)}
          onCancel={closeEventAccessDialog}
          onSave={(eventIds) => void handleSaveEventAccess(eventIds)}
          userName={displayName(t, eventAccessTarget)}
        />
      ) : null}

      {pendingOrganizerRole ? (
        <UserEventAccessDialog
          busy={updatingUserId === pendingOrganizerRole.user.id}
          description={t('admin.users.eventAccess.assignRoleDescription')}
          error={eventAccessError}
          events={adminEvents ?? []}
          initialEventIds={[]}
          onCancel={closePendingOrganizerRole}
          onSave={(eventIds) => void handleConfirmOrganizerRole(eventIds)}
          requireSelection
          saveLabel={t('admin.users.eventAccess.assignRoleSave')}
          title={t('admin.users.eventAccess.assignRoleTitle', {
            name: displayName(t, pendingOrganizerRole.user),
          })}
          userName={displayName(t, pendingOrganizerRole.user)}
        />
      ) : null}

      {pendingDeletion ? (
        <AdminDeleteConfirmDialog
          busy={updatingUserId === pendingDeletion.id}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDeleteUser()}
          title={t('admin.users.deleteTitle')}
          description={t('admin.users.deleteDescription', {
            name: displayName(t, pendingDeletion),
            email: displayEmail(t, pendingDeletion),
          })}
          warning={t('admin.users.deleteWarning')}
          cancelLabel={t('admin.users.deleteCancel')}
          confirmLabel={t('admin.users.deleteConfirm')}
          busyLabel={t('admin.users.deleting')}
        />
      ) : null}
    </section>
  )
}
