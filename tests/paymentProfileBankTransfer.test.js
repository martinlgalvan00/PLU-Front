import { describe, expect, it } from 'vitest'
import {
  createSupabasePaymentProfileRepository,
  PAYMENT_PROFILE_NAME_TAKEN_CODE,
} from '../server/modules/payments/supabasePaymentProfileRepository.js'

const ORG = '00000000-0000-4000-8000-000000000001'
const NAME_INDEX = 'payment_profiles_org_name_kind_uidx'

/**
 * Doble de `payment_profiles` que SÍ hace cumplir el índice único
 * `(org, lower(trim(name)), kind) where active`. El doble genérico de
 * mercadoPagoOAuth.test.js no lo hace, y por eso ningún test atrapó que
 * guardar un evento con otro alias chocaba contra el perfil que el mismo evento
 * había creado antes (409 "No se pudo crear el perfil de cobro.").
 *
 * `beforeInsert` deja simular un guardado simultáneo: corre justo antes del
 * alta, que es la ventana entre la lectura del catálogo y la escritura.
 */
function createProfilesDouble(initial = [], { beforeInsert = null } = {}) {
  const rows = initial.map((row) => ({ ...row }))
  let seq = rows.length
  const key = (row) => `${row.organization_id}|${String(row.name).trim().toLowerCase()}|${row.kind}`
  const read = (row, column) => {
    const json = /^config->>(.+)$/.exec(column)
    return json ? (row.config?.[json[1]] ?? null) : row[column]
  }
  const conflict = (candidate, ignoreId = null) =>
    candidate.active !== false &&
    rows.some((row) => row.active !== false && row.id !== ignoreId && key(row) === key(candidate))
  const violation = () => ({
    data: null,
    error: {
      code: '23505',
      message: `duplicate key value violates unique constraint "${NAME_INDEX}"`,
      details: 'Key (organization_id, lower(TRIM(BOTH FROM name)), kind) already exists.',
    },
  })

  function builder() {
    const filters = []
    let op = 'select'
    let payload = null
    let single = null
    const run = () => {
      if (op === 'insert') {
        beforeInsert?.(rows, payload)
        const row = {
          id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
          created_at: '2026-10-13T00:00:00.000Z',
          updated_at: '2026-10-13T00:00:00.000Z',
          ...payload,
        }
        if (conflict(row)) return violation()
        rows.push(row)
        return { data: single ? row : [row], error: null }
      }
      const found = rows.filter((row) =>
        filters.every(([column, value]) => String(read(row, column)) === String(value)),
      )
      if (op === 'update') {
        for (const row of found) {
          if (conflict({ ...row, ...payload }, row.id)) return violation()
        }
        for (const row of found) Object.assign(row, payload)
      }
      return { data: single ? (found[0] ?? null) : found, error: null }
    }
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (column, value) => (filters.push([column, value]), query),
      insert: (value) => ((op = 'insert'), (payload = value), query),
      update: (value) => ((op = 'update'), (payload = value), query),
      maybeSingle: () => ((single = 'maybe'), query),
      single: () => ((single = 'one'), query),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    }
    return query
  }

  return { rows, client: { from: () => builder() } }
}

const bankRow = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  organization_id: ORG,
  name: 'Transferencia · Emanuel Cascallar',
  kind: 'bank_transfer',
  active: true,
  config: { alias: 'plu.uno', cbu: '', holder: '' },
  ...overrides,
})

function repoFor(double) {
  return createSupabasePaymentProfileRepository(double.client, { organizationId: ORG, env: {} })
}

describe('ensureBankTransferProfile — perfil automático al guardar un evento', () => {
  it('cambiar el alias de un evento que ya tiene su perfil no choca por el nombre', async () => {
    // El caso de la captura: el evento ya creó "Transferencia · <título>" con
    // otro alias, y al guardar otra vez el nombre automático es el mismo.
    const double = createProfilesDouble([bankRow()])
    const profile = await repoFor(double).ensureBankTransferProfile({
      name: 'Transferencia · Emanuel Cascallar',
      alias: 'plu.dos',
    })

    expect(profile.config.alias).toBe('plu.dos')
    expect(profile.name).toBe('Transferencia · Emanuel Cascallar · plu.dos')
    expect(double.rows).toHaveLength(2)
  })

  it('el mismo alias reusa el perfil aunque cambien las mayúsculas', async () => {
    const double = createProfilesDouble([bankRow()])
    const profile = await repoFor(double).ensureBankTransferProfile({
      name: 'Transferencia · Otro evento',
      alias: ' PLU.Uno ',
    })

    expect(profile.id).toBe('00000000-0000-4000-8000-0000000000a1')
    expect(double.rows).toHaveLength(1)
  })

  it('reusar completa CBU y titular sin pisar el alias guardado', async () => {
    const double = createProfilesDouble([bankRow()])
    const profile = await repoFor(double).ensureBankTransferProfile({
      name: 'x',
      alias: 'PLU.UNO',
      cbu: '0000003100012345678901',
      holder: 'Powerlifting United',
    })

    expect(profile.config).toMatchObject({
      alias: 'plu.uno',
      cbu: '0000003100012345678901',
      holder: 'Powerlifting United',
    })
    expect(double.rows).toHaveLength(1)
  })

  it('un perfil archivado con ese nombre no bloquea ni se reusa', async () => {
    const double = createProfilesDouble([bankRow({ active: false })])
    const profile = await repoFor(double).ensureBankTransferProfile({
      name: 'Transferencia · Emanuel Cascallar',
      alias: 'plu.uno',
    })

    expect(profile.id).not.toBe('00000000-0000-4000-8000-0000000000a1')
    expect(profile.name).toBe('Transferencia · Emanuel Cascallar')
  })

  it('varios alias sobre el mismo título terminan con nombres distintos', async () => {
    const double = createProfilesDouble()
    const repo = repoFor(double)
    const names = []
    for (const alias of ['a.uno', 'a.dos', 'a.tres']) {
      names.push(
        (await repo.ensureBankTransferProfile({ name: 'Transferencia · Evento', alias })).name,
      )
    }

    expect(new Set(names).size).toBe(3)
    expect(names[0]).toBe('Transferencia · Evento')
  })

  it('si otro guardado toma el nombre justo antes del alta, relee y reintenta', async () => {
    let injected = false
    const double = createProfilesDouble([], {
      beforeInsert: (rows) => {
        if (injected) return
        injected = true
        rows.push(
          bankRow({ id: '00000000-0000-4000-8000-0000000000b2', config: { alias: 'otro.alias' } }),
        )
      },
    })
    const profile = await repoFor(double).ensureBankTransferProfile({
      name: 'Transferencia · Emanuel Cascallar',
      alias: 'plu.carrera',
    })

    expect(profile.config.alias).toBe('plu.carrera')
    expect(profile.name).toBe('Transferencia · Emanuel Cascallar · plu.carrera')
  })

  it('el nombre nunca pasa de 120 caracteres', async () => {
    const long = `Transferencia · ${'X'.repeat(200)}`
    const double = createProfilesDouble()
    const repo = repoFor(double)
    const first = await repo.ensureBankTransferProfile({ name: long, alias: 'larga.uno' })
    const second = await repo.ensureBankTransferProfile({ name: long, alias: 'larga.dos' })

    expect(first.name.length).toBeLessThanOrEqual(120)
    expect(second.name.length).toBeLessThanOrEqual(120)
    expect(second.name).not.toBe(first.name)
  })

  it('sin alias sigue siendo un 400', async () => {
    await expect(
      repoFor(createProfilesDouble()).ensureBankTransferProfile({ name: 'x', alias: '  ' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe('alta y renombre manual: el nombre repetido se explica', () => {
  it('crear con un nombre ya usado devuelve 409 con el campo name, no el texto genérico', async () => {
    const repo = repoFor(createProfilesDouble([bankRow()]))

    await expect(
      repo.create({
        name: '  transferencia · EMANUEL cascallar ',
        kind: 'bank_transfer',
        config: { alias: 'otra.cuenta' },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Ya hay un perfil de cobro activo con ese nombre'),
      details: { code: PAYMENT_PROFILE_NAME_TAKEN_CODE, fields: { name: expect.any(String) } },
    })
  })

  it('renombrar contra otro perfil activo devuelve el mismo 409', async () => {
    const other = bankRow({
      id: '00000000-0000-4000-8000-0000000000c3',
      name: 'Otra cuenta',
      config: { alias: 'otra.cuenta' },
    })
    const repo = repoFor(createProfilesDouble([bankRow(), other]))

    await expect(
      repo.update(other.id, { name: 'Transferencia · Emanuel Cascallar' }),
    ).rejects.toMatchObject({
      status: 409,
      details: { code: PAYMENT_PROFILE_NAME_TAKEN_CODE },
    })
  })

  it('renombrar un perfil a su propio nombre no choca consigo mismo', async () => {
    const repo = repoFor(createProfilesDouble([bankRow()]))
    const updated = await repo.update('00000000-0000-4000-8000-0000000000a1', {
      name: 'Transferencia · Emanuel Cascallar',
      config: { notes: 'sin cambios de nombre' },
    })

    expect(updated.config.notes).toBe('sin cambios de nombre')
  })
})
