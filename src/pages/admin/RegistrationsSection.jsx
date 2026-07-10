import { useMemo } from 'react'

import { BadgeCheck } from 'lucide-react'

import AdminIconButton from '../../components/admin/AdminIconButton.jsx'

import AdminListSection from '../../components/admin/AdminListSection.jsx'

import { AdminIdentityCell, AdminPaymentCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'

import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'

import ExportButton from '../../components/ui/ExportButton.jsx'

import { useI18n } from '../../i18n/I18nProvider.jsx'

import { translateFilterOptions } from '../../i18n/adminHelpers.js'

import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'

import { money } from '../../lib/format.js'



function findRegistrationPayment(payments, athleteId) {

  return payments.find((item) => item.athleteId === athleteId)

}



function matchesRegistrationFilter(registration, payment, filter) {

  if (filter === 'all') return true

  return registration.status === filter || registration.paymentStatus === filter || payment?.status === filter

}



function countRegistrationsByFilter(registrations, payments, filter) {

  return registrations.filter((registration) => {

    const payment = findRegistrationPayment(payments, registration.athleteId)

    return matchesRegistrationFilter(registration, payment, filter)

  }).length

}



export default function RegistrationsSection({

  canEdit,

  filters,

  filteredRegistrations,

  payments,

  registrations = [],

  registrationsCount,

  onApprovePayment,

  onExportAdmin,

  onExportPluUsa,

  onSetFilters,

}) {

  const { t } = useI18n()



  const statusCounts = useMemo(() => {

    const counts = {}

    for (const [value] of REGISTRATION_FILTER_STATUSES) {

      counts[value] = countRegistrationsByFilter(registrations, payments, value)

    }

    return counts

  }, [payments, registrations])



  const statusOptions = useMemo(

    () =>

      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [

        value,

        label,

        statusCounts[value] ?? 0,

      ]),

    [statusCounts, t],

  )



  const registrationRows = useMemo(

    () =>

      filteredRegistrations.map((reg) => {

        const payment = findRegistrationPayment(payments, reg.athleteId)

        return {

          id: reg.id,

          athlete: reg.athlete?.fullName,

          document: reg.athlete?.documentId,

          event: reg.event,

          category: `${reg.category} · ${reg.division}`,

          status: reg.status,

          paymentStatus: payment?.status,

          amount: payment ? money(payment.amount) : '—',

          paymentId: payment?.id,

        }

      }),

    [filteredRegistrations, payments],

  )



  function handleQueryChange(value) {

    onSetFilters((current) => ({ ...current, query: value }))

  }



  function handleStatusChange(value) {

    onSetFilters((current) => ({ ...current, status: value }))

  }



  return (

    <AdminListSection

      variant="registrations"

      filteredCount={registrationRows.length}

      placeholder={t('admin.search.registration')}

      query={filters.query ?? ''}

      showHeader

      showStats

      stats={[

        { label: t('admin.registrations.stats.total'), value: statusCounts.all ?? registrationsCount ?? 0, tone: 'default' },

        {

          label: t('admin.registrations.stats.pending'),

          value: statusCounts.pendiente_pago ?? 0,

          tone: 'warning',

        },

        {

          label: t('admin.registrations.stats.manual'),

          value: statusCounts.validacion_manual ?? 0,

          tone: 'warning',

        },

        {

          label: t('admin.registrations.stats.confirmed'),

          value: statusCounts.confirmada ?? 0,

          tone: 'success',

        },

      ]}

      title={t('admin.sections.registrations.title')}

      subtitle={t('admin.sections.registrations.subtitle')}

      totalCount={registrationsCount ?? registrationRows.length}

      actions={

        <>

          <ExportButton iconOnly label={t('admin.actions.exportCsvAdmin')} onClick={onExportAdmin} disabled={!canEdit} />

          <ExportButton

            iconOnly

            label={t('admin.actions.exportPluUsa')}

            onClick={onExportPluUsa}

            variant="gold"

          />

        </>

      }

      filters={[

        {

          id: 'status',

          label: t('admin.filters.status'),

          value: filters.status,

          onChange: handleStatusChange,

          options: statusOptions,

        },

      ]}

      onQueryChange={handleQueryChange}

    >

      <DataTable

        variant="admin"

        columns={[

          {

            key: 'athlete',

            label: t('admin.columns.athlete'),

            render: (row) => <AdminIdentityCell name={row.athlete} sub={row.document} />,

          },

          { key: 'event', label: t('admin.columns.event') },

          { key: 'category', label: t('admin.columns.category') },

          {

            key: 'status',

            label: t('admin.columns.status'),

            render: (row) => <StatusBadge value={row.status} />,

          },

          {

            key: 'payment',

            label: t('admin.columns.payment'),

            render: (row) => <AdminPaymentCell amount={row.amount} status={row.paymentStatus} />,

          },

          {

            key: 'action',

            label: t('admin.columns.action'),

            render: (row) => (

              <AdminTableActions>

                <AdminIconButton

                  disabled={!canEdit || row.paymentStatus === 'aprobado'}

                  icon={BadgeCheck}

                  label={t('admin.actions.validate')}

                  onClick={() => onApprovePayment(row.paymentId)}

                  variant="celeste"

                />

              </AdminTableActions>

            ),

          },

        ]}

        rows={registrationRows}

        emptyMessage={t('admin.sections.registrations.empty')}

      />

    </AdminListSection>

  )

}


