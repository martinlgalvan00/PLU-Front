import { apiGet, apiRequest } from '../lib/api.js'

function mapGate(row) {
  if (!row) return null
  return {
    id: row.id,
    scope: row.scope,
    eventSlug: row.event_slug ?? row.eventSlug ?? null,
    eventTitle: row.event_title ?? row.eventTitle ?? null,
    label: row.label,
    active: row.active === true,
    startsAt: row.starts_at ?? row.startsAt ?? null,
    endsAt: row.ends_at ?? row.endsAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export async function fetchRegistrationAccessConfiguration() {
  const result = await apiGet('/api/registration-access')
  return {
    membershipGate: mapGate(result.membershipGate),
    eventGates: (result.eventGates ?? []).map(mapGate),
  }
}

export async function saveRegistrationAccessGate(gate) {
  const body = {
    scope: gate.scope,
    label: String(gate.label ?? '').trim(),
    active: gate.active !== false,
    startsAt: gate.startsAt ? new Date(gate.startsAt).toISOString() : '',
    endsAt: gate.endsAt ? new Date(gate.endsAt).toISOString() : '',
  }
  if (gate.scope === 'registration' && gate.eventSlug) {
    body.eventSlug = String(gate.eventSlug).trim()
  }
  if (gate.code) {
    body.code = String(gate.code).trim()
  }

  const result = await apiRequest('/api/registration-access', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return mapGate(result.gate)
}
