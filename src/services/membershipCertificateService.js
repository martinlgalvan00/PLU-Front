import { apiGet } from '../lib/api.js'

export function fetchMembershipCertificate() {
  return apiGet('/api/athletes/me/membership-certificate')
}
