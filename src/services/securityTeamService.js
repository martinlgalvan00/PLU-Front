export const SECURITY_TEAM_MAX = 50

const EMAIL_RE = /^\S+@\S+\.\S+$/

export function createSecurityTeamMember(id, values = {}) {
  return {
    id,
    name: values.name ?? '',
    email: values.email ?? '',
  }
}

function deriveNameFromEmail(email) {
  const localPart = email.split('@')[0] ?? ''
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

export function normalizeSecurityTeamMember(member) {
  const email = member.email.trim().toLowerCase()
  const name = member.name.trim() || deriveNameFromEmail(email)
  return { name, email }
}

export function validateSecurityTeamMembers(members) {
  const errors = {}
  const seenEmails = new Set()
  const normalized = members.map(normalizeSecurityTeamMember)

  normalized.forEach((member, index) => {
    const row = members[index]
    const rowErrors = {}

    if (member.name.length < 3) rowErrors.name = 'name'
    if (!EMAIL_RE.test(member.email)) rowErrors.email = 'email'
    if (EMAIL_RE.test(member.email) && seenEmails.has(member.email)) rowErrors.email = 'duplicate'
    if (EMAIL_RE.test(member.email)) seenEmails.add(member.email)

    if (Object.keys(rowErrors).length) errors[row.id] = rowErrors
  })

  return {
    errors,
    isValid: members.length > 0 && Object.keys(errors).length === 0,
    members: normalized,
  }
}

export function parseSecurityTeamImport(raw) {
  const seen = new Set()
  const members = []
  const invalid = []

  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const parts = line.split(/[\t,;]/).map((part) => part.trim()).filter(Boolean)
      const emailPart = parts.find((part) => EMAIL_RE.test(part.toLowerCase()))
      const email = emailPart?.toLowerCase() ?? ''

      if (!email) {
        invalid.push({ line: index + 1, value: line })
        return
      }

      if (seen.has(email)) return
      seen.add(email)

      const namePart = parts.find((part) => part !== emailPart) ?? ''
      members.push(normalizeSecurityTeamMember({ name: namePart, email }))
    })

  return { members, invalid }
}

export function formatSecurityAccessList(created) {
  return created
    .map((item) => {
      const access = item.accessUrl || item.tempPassword || ''
      return `${item.user.name} · ${item.user.email}\n${access}`
    })
    .join('\n\n')
}
