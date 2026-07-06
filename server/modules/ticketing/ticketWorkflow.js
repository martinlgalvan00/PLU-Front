import { randomBytes } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'

/**
 * ticketWorkflow.js — PLU ARG
 *
 * Entradas generales (espectadores) respaldadas por Postgres de verdad —
 * a diferencia del resto del dominio (atletas/membresías/inscripciones),
 * que todavía vive solo en localStorage del frontend. Acá es donde se
 * decidió pagar el costo de un backend real: es la parte del sistema que
 * necesita la garantía dura de "no se puede duplicar/reusar".
 */

// TODO: mover a un campo real en Event (ticketDayPrice / ticketBothDaysPrice)
// cuando el resto del catálogo de eventos también viva en Postgres. Por ahora
// espeja los valores de src/lib/constants.js (PRICING.ticket / ticketBothDays).
const TICKET_PRICE_BY_DAY = {
  day1: 12000,
  day2: 12000,
  both: 20000,
}

function priceForDayPass(dayPass) {
  return TICKET_PRICE_BY_DAY[dayPass] ?? 0
}

function buildTicketCode(sequence) {
  return `TCK-${String(sequence).padStart(5, '0')}`
}

/**
 * Crea una orden de entradas + un Ticket por asistente, todo en una
 * transacción. El código secuencial se calcula dentro de la transacción
 * para acotar (no eliminar del todo — haría falta una secuencia dedicada
 * de Postgres para eso) la ventana de carrera entre compras concurrentes;
 * el @unique en ticketCode igual evita que dos tickets terminen con el
 * mismo código aunque la carrera ocurra.
 */
export async function createTicketOrder({ prisma, eventSlug, attendees, buyer = {}, provider = 'mercado_pago' }) {
  if (!attendees?.length) {
    throw new HttpError(400, 'La compra necesita al menos un asistente.')
  }

  const event = await prisma.event.findUnique({ where: { slug: eventSlug } })
  if (!event) throw new HttpError(404, 'Evento no encontrado.')

  const amount = attendees.reduce((sum, attendee) => sum + priceForDayPass(attendee.dayPass), 0)

  return prisma.$transaction(async (tx) => {
    const order = await tx.ticketOrder.create({
      data: {
        eventId: event.id,
        buyerName: buyer.name ?? null,
        buyerEmail: buyer.email ?? null,
        buyerPhone: buyer.phone ?? null,
        amount,
        provider,
        status: 'creado',
        reference: `TORD-${randomBytes(6).toString('hex')}`,
      },
    })

    const startCount = await tx.ticket.count()
    const tickets = []

    for (let index = 0; index < attendees.length; index += 1) {
      const attendee = attendees[index]
      // eslint-disable-next-line no-await-in-loop -- son inserts secuenciales dentro de la misma transacción, no hay paralelismo real que ganar acá
      const ticket = await tx.ticket.create({
        data: {
          ticketCode: buildTicketCode(startCount + index + 1),
          orderId: order.id,
          eventId: event.id,
          attendeeName: attendee.fullName,
          attendeeDni: attendee.dni,
          dayPass: attendee.dayPass,
          unitPrice: priceForDayPass(attendee.dayPass),
          status: 'pendiente_pago',
        },
      })
      tickets.push(ticket)
    }

    return { order, tickets }
  })
}

/**
 * Equivalente al "Simular pago": aprueba la orden completa y todos sus
 * tickets en una sola transacción (todo o nada).
 */
export async function approveTicketOrder({ prisma, orderId }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.ticketOrder.findUnique({ where: { id: orderId } })
    if (!order) throw new HttpError(404, 'Orden no encontrada.')

    const updatedOrder = await tx.ticketOrder.update({
      where: { id: orderId },
      data: { status: 'aprobado' },
    })

    await tx.ticket.updateMany({
      where: { orderId, status: 'pendiente_pago' },
      data: { status: 'pagada' },
    })

    const tickets = await tx.ticket.findMany({ where: { orderId } })
    return { order: updatedOrder, tickets }
  })
}

/**
 * Lectura pública de solo verificación — a donde apunta el QR. No muta
 * nada, así que escanear/mirar dos veces no tiene efectos secundarios.
 */
export async function getTicketByQrToken({ prisma, qrToken }) {
  const ticket = await prisma.ticket.findUnique({
    where: { qrToken },
    include: { event: true, checkIn: true },
  })
  if (!ticket) throw new HttpError(404, 'Entrada no encontrada.')
  return ticket
}

export async function listTicketsForEvent({ prisma, eventSlug }) {
  const event = await prisma.event.findUnique({ where: { slug: eventSlug } })
  if (!event) throw new HttpError(404, 'Evento no encontrado.')

  return prisma.ticket.findMany({
    where: { eventId: event.id },
    include: { checkIn: true, event: true },
    orderBy: { createdAt: 'desc' },
  })
}
