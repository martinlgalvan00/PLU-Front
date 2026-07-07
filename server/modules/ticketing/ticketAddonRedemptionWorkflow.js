import { HttpError } from '../../lib/errors.js'

function normalizeAddons(addons) {
  return Array.isArray(addons) ? addons : []
}

/**
 * Marca un beneficio opcional de una entrada como canjeado en el venue.
 */
export async function redeemTicketAddon({ prisma, qrToken, addonId }) {
  if (!addonId?.trim()) throw new HttpError(400, 'Falta el beneficio a canjear.')

  const ticket = await prisma.ticket.findUnique({
    where: { qrToken },
    include: { checkIn: true, event: true },
  })
  if (!ticket) throw new HttpError(404, 'Entrada no encontrada.')
  if (!['pagada', 'usada'].includes(ticket.status)) {
    throw new HttpError(409, 'Esta entrada todavía no tiene el pago acreditado.')
  }

  const addons = normalizeAddons(ticket.addons)
  const index = addons.findIndex((item) => item.id === addonId)
  if (index === -1) throw new HttpError(404, 'Beneficio no encontrado en esta entrada.')
  if (addons[index].redeemedAt) {
    throw new HttpError(409, 'Este beneficio ya fue canjeado.', { alreadyRedeemed: true })
  }

  const redeemedAt = new Date().toISOString()
  const updatedAddons = addons.map((item, itemIndex) =>
    itemIndex === index ? { ...item, redeemedAt } : item,
  )

  const updatedTicket = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { addons: updatedAddons },
    include: { checkIn: true, event: true },
  })

  return { ticket: updatedTicket }
}
