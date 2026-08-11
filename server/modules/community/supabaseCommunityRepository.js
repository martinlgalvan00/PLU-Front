import { HttpError } from '../../lib/errors.js'

const PHOTO_BUCKET = 'athlete-photos'
const PHOTO_SIGNED_TTL_SEC = 3600

function assertSupabaseResult(result, fallback = 'No se pudo consultar la comunidad.') {
  if (result?.error) {
    throw new HttpError(502, result.error.message || fallback)
  }
  return result?.data
}

/**
 * Abrevia "Martina Rivas" → "Martina R." para el feed público.
 * Se usa como fallback de privacidad si la RPC no sanitiza.
 */
export function abbreviatePublicMemberName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Atleta'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ''}.`
}

function normalizeMember(row) {
  if (!row?.id) return null
  const photoPath = row.photoPath ?? row.photo_path ?? null
  return {
    id: String(row.id),
    name: abbreviatePublicMemberName(row.name ?? row.full_name ?? row.fullName ?? ''),
    gym: String(row.gym ?? '—').trim() || '—',
    province: String(row.province ?? '—').trim() || '—',
    affiliatedAt: row.affiliatedAt ?? row.affiliated_at ?? null,
    photoPath: photoPath ? String(photoPath) : null,
    photoUrl: null,
  }
}

async function attachSignedPhotoUrls(client, members) {
  await Promise.all(
    members.map(async (member) => {
      if (!member.photoPath) return
      try {
        const signed = assertSupabaseResult(
          await client.storage.from(PHOTO_BUCKET).createSignedUrl(member.photoPath, PHOTO_SIGNED_TTL_SEC),
          'No se pudo firmar la foto del afiliado.',
        )
        member.photoUrl = signed?.signedUrl ?? null
      } catch {
        member.photoUrl = null
      }
      delete member.photoPath
    }),
  )
  return members
}

export function createSupabaseCommunityRepository({ getSupabaseAdmin }) {
  return {
    async getSpotlight(limit = 5) {
      const client = getSupabaseAdmin?.()
      if (!client) {
        throw new HttpError(503, 'Supabase no está configurado en el servidor.')
      }

      const data = assertSupabaseResult(
        await client.rpc('public_list_community_spotlight', {
          p_limit: Number(limit) || 5,
        }),
        'No se pudo cargar el spotlight de comunidad.',
      )

      const members = Array.isArray(data?.members)
        ? data.members.map(normalizeMember).filter(Boolean)
        : []

      await attachSignedPhotoUrls(client, members)

      const stats = {
        memberCount: Number(data?.stats?.memberCount ?? members.length) || 0,
        activeGymCount: Number(data?.stats?.activeGymCount ?? 0) || 0,
        provinceCount: Number(data?.stats?.provinceCount ?? 0) || 0,
      }

      return { members, stats }
    },
  }
}
