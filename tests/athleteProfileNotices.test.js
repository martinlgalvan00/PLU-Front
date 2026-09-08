import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HttpError } from '../server/lib/errors.js'
import {
  PROFILE_NOTICE_BULK_MAX,
  resolveProfileNoticesIfComplete,
  sendProfileNotice,
  sendProfileNoticesBulk,
} from '../server/modules/athletes/profileNoticeService.js'
import {
  chunkProfileNoticeAthleteIds,
} from '../shared/profileNotice.js'
import {
  hasUnreadProfileNotice,
  isProfileComplete,
  isUnreadProfileNotice,
  visibleProfileNotice,
} from '../src/lib/athleteProfile.js'
import { REQUIRED_FOR_REGISTRATION } from '../shared/athleteProfile.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261115100000_athlete_profile_notices.sql'),
  'utf8',
)

const completeAthlete = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '1155551234',
  city: 'Banfield',
  province: 'Buenos Aires',
  gym: 'Maximal',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 90,
}

function incompleteRow(id = completeAthlete.id) {
  return {
    id,
    phone: '',
    city: '',
    province: '',
    gym: '',
    division: '',
    category: '',
    estimated_weight: null,
  }
}

describe('avisos de perfil incompleto', () => {
  it('define la tabla con un solo aviso abierto y RLS solo para service_role', () => {
    expect(migration).toContain('create table if not exists public.athlete_profile_notices')
    expect(migration).toContain('athlete_profile_notices_one_open_idx')
    expect(migration).toContain('where resolved_at is null')
    expect(migration).toContain('alter table public.athlete_profile_notices enable row level security')
    expect(migration).toContain(
      'revoke all on public.athlete_profile_notices from public, anon, authenticated',
    )
    expect(migration).toContain(
      'grant select, insert, update, delete on public.athlete_profile_notices to service_role',
    )
    expect(
      readFileSync(
        resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
        'utf8',
      ),
    ).toContain('MISSING_RELATION_CODE')
  })

  it('comparte la regla de completitud entre shared y src/lib', () => {
    expect(REQUIRED_FOR_REGISTRATION).toEqual([
      'phone',
      'city',
      'province',
      'gym',
      'division',
      'category',
      'estimatedWeight',
    ])
    expect(isProfileComplete(completeAthlete).complete).toBe(true)
    expect(isProfileComplete({ ...completeAthlete, phone: '  ' }).missing).toEqual(['phone'])
  })

  it('un aviso visible no leído marca el header; dismiss lo oculta', () => {
    const unread = {
      id: 'n1',
      readAt: null,
      dismissedAt: null,
      resolvedAt: null,
    }
    expect(isUnreadProfileNotice(unread)).toBe(true)
    expect(hasUnreadProfileNotice([unread])).toBe(true)
    expect(visibleProfileNotice([{ ...unread, readAt: '2026-09-08T12:00:00.000Z' }])?.id).toBe('n1')
    expect(visibleProfileNotice([{ ...unread, dismissedAt: '2026-09-08T12:00:00.000Z' }])).toBe(null)
  })

  it('no envía aviso si el perfil ya está completo', async () => {
    await expect(
      sendProfileNotice({
        repository: {
          findProfileCompleteness: async () => ({
            id: completeAthlete.id,
            phone: completeAthlete.phone,
            city: completeAthlete.city,
            province: completeAthlete.province,
            gym: completeAthlete.gym,
            division: completeAthlete.division,
            category: completeAthlete.category,
            estimated_weight: completeAthlete.estimatedWeight,
          }),
        },
        athleteId: completeAthlete.id,
        createdBy: 'staff',
      }),
    ).rejects.toMatchObject({ status: 409, details: { code: 'PROFILE_COMPLETE' } })
  })

  it('recalcula los campos faltantes y upsert del aviso abierto', async () => {
    const upserts = []
    const result = await sendProfileNotice({
      repository: {
        findProfileCompleteness: async () => incompleteRow(),
        upsertProfileNotice: async (payload) => {
          upserts.push(payload)
          return { id: 'notice-1', ...payload }
        },
      },
      athleteId: completeAthlete.id,
      message: 'Falta el teléfono',
      createdBy: 'usr-admin:admin@pluarg.test',
    })

    expect(result.missing).toEqual(REQUIRED_FOR_REGISTRATION)
    expect(upserts).toEqual([
      {
        athleteId: completeAthlete.id,
        missingFields: REQUIRED_FOR_REGISTRATION,
        message: 'Falta el teléfono',
        createdBy: 'usr-admin:admin@pluarg.test',
      },
    ])
  })

  it('en bulk saltea completos y respeta el tope', async () => {
    const incompleteId = '22222222-2222-4222-8222-222222222222'
    const completeId = completeAthlete.id
    const result = await sendProfileNoticesBulk({
      repository: {
        findProfileCompletenessMany: async () => [
          incompleteRow(incompleteId),
          {
            id: completeId,
            phone: completeAthlete.phone,
            city: completeAthlete.city,
            province: completeAthlete.province,
            gym: completeAthlete.gym,
            division: completeAthlete.division,
            category: completeAthlete.category,
            estimated_weight: completeAthlete.estimatedWeight,
          },
        ],
        upsertProfileNotice: async (payload) => ({ id: 'notice-bulk', ...payload }),
      },
      athleteIds: [incompleteId, completeId],
      createdBy: 'staff',
    })

    expect(result.sent).toHaveLength(1)
    expect(result.sent[0].athleteId).toBe(incompleteId)
    expect(result.skipped).toEqual([{ athleteId: completeId, reason: 'complete' }])

    await expect(
      sendProfileNoticesBulk({
        repository: { findProfileCompletenessMany: async () => [] },
        athleteIds: Array.from({ length: PROFILE_NOTICE_BULK_MAX + 1 }, (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
        createdBy: 'staff',
      }),
    ).rejects.toBeInstanceOf(HttpError)
  })

  it('parte selecciones grandes en lotes de 50', () => {
    const ids = Array.from({ length: 201 }, (_, index) => `id-${index}`)
    const chunks = chunkProfileNoticeAthleteIds(ids)
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toHaveLength(PROFILE_NOTICE_BULK_MAX)
    expect(chunks[4]).toHaveLength(1)
    expect(chunkProfileNoticeAthleteIds(ids.slice(0, 51))).toHaveLength(2)
  })

  it('resuelve avisos abiertos al completar el perfil', async () => {
    const resolved = []
    const outcome = await resolveProfileNoticesIfComplete({
      repository: {
        resolveOpenProfileNotices: async (athleteId) => {
          resolved.push(athleteId)
        },
      },
      athlete: completeAthlete,
    })
    expect(outcome.resolved).toBe(true)
    expect(resolved).toEqual([completeAthlete.id])

    const stillOpen = await resolveProfileNoticesIfComplete({
      repository: { resolveOpenProfileNotices: async () => resolved.push('no') },
      athlete: { ...completeAthlete, gym: '' },
    })
    expect(stillOpen.resolved).toBe(false)
    expect(resolved).toEqual([completeAthlete.id])
  })
})
