import { apiGet } from '../lib/api.js'

export async function fetchRegistrationAccessRequirements({ eventSlug } = {}) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : ''
  const result = await apiGet(`/api/athletes/me/registration-access-requirements${query}`)
  return {
    membership: result?.membership === true,
    registration: result?.registration === true,
    membershipEnabled: result?.membershipEnabled !== false,
    registrationEnabled: result?.registrationEnabled !== false,
  }
}
