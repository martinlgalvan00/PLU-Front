import { Prisma } from '@prisma/client'
import { HttpError } from '../../lib/errors.js'

const UNIQUE_VIOLATION = 'P2002'

/**
 * checkinWorkflow.js — PLU ARG
 *
 * El check-in es la parte del sistema que de verdad tiene que resistir
 * concurrencia (dos puertas escaneando el mismo QR al mismo tiempo). La
 * garantía NO viene de "leer el estado antes de escribir" — eso tiene una
 * ventana de carrera — sino del índice único de Postgres sobre
 * CheckIn.ticketId / CheckIn.registrationId: como mucho un INSERT gana,
 * el resto choca con la restricción y se captura acá como "ya usado".
 */

export async function checkInTicket({ prisma, qrToken, scannedById, gate }) {
  const ticket = await prisma.ticket.findUnique({ where: { qrToken } })
  if (!ticket) throw new HttpError(404, 'Entrada no encontrada.')
  if (ticket.status !== 'pagada') {
    throw new HttpError(409, 'Esta entrada todavía no tiene el pago acreditado.')
  }

  try {
    const checkIn = await prisma.checkIn.create({
      data: {
        eventId: ticket.eventId,
        attendeeKind: 'spectator',
        ticketId: ticket.id,
        scannedById: scannedById ?? null,
        gate: gate ?? null,
      },
    })
    return { outcome: 'ok', ticket, checkIn }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      const existing = await prisma.checkIn.findUnique({ where: { ticketId: ticket.id } })
      throw new HttpError(409, 'Esta entrada ya fue utilizada.', {
        alreadyUsed: true,
        scannedAt: existing?.scannedAt ?? null,
      })
    }
    throw error
  }
}

export async function checkInRegistration({ prisma, registrationId, scannedById, gate }) {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } })
  if (!registration) throw new HttpError(404, 'Inscripción no encontrada.')
  if (registration.status === 'cancelada') {
    throw new HttpError(409, 'Esta inscripción está cancelada.')
  }

  try {
    const checkIn = await prisma.checkIn.create({
      data: {
        eventId: registration.eventId,
        attendeeKind: 'athlete',
        registrationId: registration.id,
        scannedById: scannedById ?? null,
        gate: gate ?? null,
      },
    })
    return { outcome: 'ok', registration, checkIn }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      const existing = await prisma.checkIn.findUnique({ where: { registrationId: registration.id } })
      throw new HttpError(409, 'Esta inscripción ya tiene un ingreso registrado.', {
        alreadyUsed: true,
        scannedAt: existing?.scannedAt ?? null,
      })
    }
    throw error
  }
}
