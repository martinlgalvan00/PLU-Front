import { useEffect, useState } from 'react'
import { mapApiTicket, listMyTickets } from '../services/ticketApi.js'
import { isDemoSession } from '../services/demoAthleteSeed.js'

function purchaseEvent(order) {
  return {
    slug: order?.eventSlug ?? null,
    title: order?.eventTitle ?? null,
    date: order?.eventStartsAt ?? null,
    venue: order?.eventVenue ?? null,
  }
}

export function walletsFromMine(mine) {
  const buyer = (mine?.orders ?? []).map((item, index) => ({
    key: `buyer-${item.order?.reference ?? index}`,
    order: item.order,
    event: purchaseEvent(item.order),
    tickets: (item.tickets ?? []).map((ticket) => mapApiTicket(ticket, purchaseEvent(item.order))),
  }))
  const groups = new Map()
  for (const item of mine?.attendeeTickets ?? []) {
    const ref = item.order?.reference ?? item.ticket?.id
    const key = `attendee-${ref}`
    const group = groups.get(key) ?? {
      key,
      order: item.order,
      event: purchaseEvent(item.order),
      tickets: [],
    }
    group.tickets.push(mapApiTicket(item.ticket, purchaseEvent(item.order)))
    groups.set(key, group)
  }
  return [...buyer, ...groups.values()]
}

export function useAccountTickets(session) {
  const enabled = Boolean(session) && !isDemoSession(session)
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', wallets: [] })

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', wallets: [] })
      return undefined
    }
    let cancelled = false
    setState({ status: 'loading', wallets: [] })
    listMyTickets()
      .then((mine) => {
        if (!cancelled) setState({ status: 'ready', wallets: walletsFromMine(mine) })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', wallets: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, session?.role, session?.athleteId, session?.email])

  return state
}
