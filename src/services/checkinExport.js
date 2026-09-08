import { getStatusMeta } from '../lib/status.js'
import { checkinTypeLabel } from './checkinScanService.js'
import { formatCheckinRowDay } from './checkinWorkspaceService.js'
import { createSpreadsheet } from './exportService.js'

export function buildCheckinListExportRows(rows, { eventDays = [], t } = {}) {
  return rows.map((row) => ({
    [t('admin.columns.attendee')]: row.name ?? '',
    [t('admin.columns.document')]: row.document ?? '',
    [t('admin.checkin.type')]: checkinTypeLabel(row, t),
    [t('admin.columns.category')]: row.meta ?? '',
    [t('admin.checkin.dayLabel')]: formatCheckinRowDay(row, eventDays, t),
    [t('admin.columns.status')]: getStatusMeta(row.status, t).label,
    [t('admin.checkinApp.admitted')]: row.checkedInAt ?? '',
  }))
}

export function downloadCheckinListExcel({
  rows,
  eventDays = [],
  eventSlug,
  sheetName,
  t,
} = {}) {
  const data = buildCheckinListExportRows(rows, { eventDays, t })
  const slug = String(eventSlug || 'evento')
    .replaceAll(/[^a-z0-9-]+/gi, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase()
  return createSpreadsheet(
    `lista-ingreso-${slug || 'evento'}.xls`,
    data,
    sheetName ?? t('admin.checkinApp.title'),
  )
}
