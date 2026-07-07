/**
 * Beneficios / add-ons opcionales en la compra de entradas de espectador.
 * Se configuran por evento en admin y se canjean en el venue (buffet, merch, etc.).
 */

export function generateTicketAddonId() {
  return `addon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createEmptyTicketAddon(overrides = {}) {
  return {
    id: generateTicketAddonId(),
    label: '',
    description: '',
    price: 0,
    redeemLabel: '',
    enabled: true,
    sortOrder: 0,
    ...overrides,
  }
}

export function normalizeTicketAddon(raw = {}, index = 0) {
  return {
    id: String(raw.id ?? generateTicketAddonId()),
    label: String(raw.label ?? '').trim(),
    description: String(raw.description ?? '').trim(),
    price: Math.max(0, Number(raw.price) || 0),
    redeemLabel: String(raw.redeemLabel ?? '').trim(),
    enabled: raw.enabled !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index,
  }
}

export function normalizeTicketAddons(addons) {
  if (!Array.isArray(addons)) return []
  return addons
    .map((addon, index) => normalizeTicketAddon(addon, index))
    .filter((addon) => addon.label.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
}

export function getEnabledTicketAddons(addons) {
  return normalizeTicketAddons(addons).filter((addon) => addon.enabled)
}

export function findTicketAddon(catalog, addonId) {
  return getEnabledTicketAddons(catalog).find((addon) => addon.id === addonId) ?? null
}

export function buildTicketAddonSnapshot(catalog, addonIds = []) {
  const ids = Array.isArray(addonIds) ? addonIds : []
  return ids
    .map((addonId) => {
      const addon = findTicketAddon(catalog, addonId)
      if (!addon) return null
      return {
        id: addon.id,
        label: addon.label,
        price: addon.price,
        redeemLabel: addon.redeemLabel,
        redeemedAt: null,
      }
    })
    .filter(Boolean)
}

export function ticketAddonsTotal(catalog, addonIds = []) {
  return buildTicketAddonSnapshot(catalog, addonIds).reduce((sum, addon) => sum + addon.price, 0)
}

export function attendeeTicketTotal(attendee, pricing, catalog, priceForDayPass) {
  const passPrice = priceForDayPass(attendee.dayPass, pricing)
  const extras = ticketAddonsTotal(catalog, attendee.addonIds)
  return passPrice + extras
}

export function orderTicketTotal(attendees, pricing, catalog, priceForDayPass) {
  return attendees.reduce((sum, attendee) => sum + attendeeTicketTotal(attendee, pricing, catalog, priceForDayPass), 0)
}

export function toggleAttendeeAddon(attendee, addonId) {
  const current = Array.isArray(attendee?.addonIds) ? attendee.addonIds : []
  const has = current.includes(addonId)
  return {
    ...attendee,
    addonIds: has ? current.filter((id) => id !== addonId) : [...current, addonId],
  }
}

export function pendingTicketAddons(ticket) {
  return (ticket?.addons ?? []).filter((addon) => addon?.label && !addon?.redeemedAt)
}

export function redeemedTicketAddons(ticket) {
  return (ticket?.addons ?? []).filter((addon) => addon?.label && addon?.redeemedAt)
}

export function canRedeemTicketAddons(ticket) {
  if (!ticket) return false
  if (ticket.status === 'pendiente_pago' || ticket.status === 'cancelada') return false
  return pendingTicketAddons(ticket).length > 0
}

function isPaidTicketForAddons(ticket) {
  return ticket?.status === 'pagada' || ticket?.status === 'usada' || Boolean(ticket?.checkedInAt)
}

/**
 * Reporte operativo de beneficios vendidos / canjeados / pendientes por evento.
 */
export function buildEventTicketAddonReport(tickets, eventSlug, catalog = []) {
  const eventTickets = (tickets ?? []).filter((ticket) => ticket.eventSlug === eventSlug)
  const paidTickets = eventTickets.filter(isPaidTicketForAddons)
  const normalizedCatalog = normalizeTicketAddons(catalog)

  const byAddon = new Map()
  for (const addon of normalizedCatalog) {
    byAddon.set(addon.id, {
      id: addon.id,
      label: addon.label,
      price: addon.price,
      sold: 0,
      redeemed: 0,
      pending: 0,
      revenue: 0,
    })
  }

  const pendingTickets = []

  for (const ticket of paidTickets) {
    const addons = Array.isArray(ticket.addons) ? ticket.addons : []
    const ticketPending = []

    for (const addon of addons) {
      if (!addon?.id && !addon?.label) continue

      const key = addon.id || addon.label
      if (!byAddon.has(key)) {
        byAddon.set(key, {
          id: addon.id || key,
          label: addon.label || String(key),
          price: Number(addon.price) || 0,
          sold: 0,
          redeemed: 0,
          pending: 0,
          revenue: 0,
        })
      }

      const row = byAddon.get(key)
      const unitPrice = Number(addon.price) || row.price || 0
      row.sold += 1
      row.revenue += unitPrice

      if (addon.redeemedAt) {
        row.redeemed += 1
      } else {
        row.pending += 1
        ticketPending.push({ id: addon.id, label: addon.label })
      }
    }

    if (ticketPending.length > 0) {
      pendingTickets.push({
        id: ticket.id,
        attendeeName: ticket.attendeeName,
        attendeeDni: ticket.attendeeDni,
        ticketCode: ticket.ticketCode,
        addons: ticketPending,
      })
    }
  }

  const rows = [...byAddon.values()]
    .filter((row) => row.sold > 0 || normalizedCatalog.some((addon) => addon.id === row.id))
    .sort(
      (a, b) =>
        b.pending - a.pending ||
        b.sold - a.sold ||
        a.label.localeCompare(b.label, 'es'),
    )

  const totals = rows.reduce(
    (acc, row) => ({
      sold: acc.sold + row.sold,
      redeemed: acc.redeemed + row.redeemed,
      pending: acc.pending + row.pending,
      revenue: acc.revenue + row.revenue,
    }),
    { sold: 0, redeemed: 0, pending: 0, revenue: 0 },
  )

  return {
    hasCatalog: normalizedCatalog.length > 0,
    hasActivity: totals.sold > 0,
    ...totals,
    rows,
    pendingTickets,
  }
}
