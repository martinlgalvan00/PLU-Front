import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())
const apiGet = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/api.js', () => ({ apiGet, apiRequest }))

const {
  downloadAllProofs,
  downloadProofsZip,
  emptyProofTrash,
  fetchProofArchive,
  fetchProofTrash,
  proofTrashFileUrl,
  purgeProofFile,
  restoreProofFile,
  saveProofRetention,
} = await import('../src/services/paymentProofsAdminService.js')

const reply = (count, next = '') => ({
  blob: new Blob(['zip']),
  headers: new Headers({
    'X-Export-Count': String(count),
    'X-Export-Remaining': '0',
    'X-Export-Next': next,
  }),
})

let click

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  click.mockRestore()
  vi.clearAllMocks()
})

describe('paymentProofsAdminService — descarga', () => {
  it('con pendientes no manda cursor', async () => {
    apiRequest.mockResolvedValueOnce(reply(5))
    const result = await downloadProofsZip('pending')
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ scope: 'pending' })
    expect(result).toEqual({ count: 5, remaining: 0, next: null })
  })

  it('"todo" encadena tandas con el cursor del servidor hasta que viene vacío', async () => {
    apiRequest
      .mockResolvedValueOnce(reply(100, '2026-10-01T00:00:00.000Z'))
      .mockResolvedValueOnce(reply(100, '2026-10-05T00:00:00.000Z'))
      .mockResolvedValueOnce(reply(30))
    const seen = []
    const result = await downloadAllProofs({ onBatch: (n) => seen.push(n) })

    expect(result).toEqual({ count: 230, batches: 3 })
    expect(seen).toEqual([1, 2, 3])
    const bodies = apiRequest.mock.calls.map(([, init]) => JSON.parse(init.body))
    expect(bodies).toEqual([
      { scope: 'all' },
      { scope: 'all', after: '2026-10-01T00:00:00.000Z' },
      { scope: 'all', after: '2026-10-05T00:00:00.000Z' },
    ])
  })
})

describe('paymentProofsAdminService — política y papelera', () => {
  it('el período de la papelera sólo viaja si se indica, para no pisar el guardado', async () => {
    apiRequest.mockResolvedValue({ settings: { mode: 'keep', days: 30, graceDays: 45 } })
    await saveProofRetention({ mode: 'keep', days: 30 })
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ mode: 'keep', days: 30 })

    const saved = await saveProofRetention({ mode: 'after_days', days: 14, graceDays: 45 })
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({
      mode: 'after_days',
      days: 14,
      graceDays: 45,
    })
    expect(saved).toMatchObject({ mode: 'keep', graceDays: 45 })
  })

  it('un resumen incompleto o raro se lee como conservar, sin inventar cifras', async () => {
    apiGet.mockResolvedValueOnce({
      settings: { mode: 'borrar_ya', days: 0, graceDays: 99999 },
      summary: { onServer: 'x' },
      trash: { count: -4 },
    })
    const archive = await fetchProofArchive()
    expect(archive.settings).toMatchObject({ mode: 'keep', days: 30, graceDays: 30 })
    expect(archive.summary).toEqual({ onServer: 0, notDownloaded: 0, downloaded: 0, deleted: 0 })
    expect(archive.trash).toMatchObject({ count: 0, dueForPurge: 0, graceDays: 30 })
    expect(archive.forecast).toBeNull()
  })

  it('la papelera se pide paginada y descarta lo que no trae identificador', async () => {
    apiGet.mockResolvedValueOnce({
      items: [
        { id: 'f1', source: 'ticket', person: 'Marcos', reason: 'orphan', restorable: true },
        { id: 'f2', source: 'rara', reason: null, restorable: 'sí' },
        { source: 'athlete' },
      ],
      total: 7,
      graceDays: 15,
    })
    const result = await fetchProofTrash({ limit: 20, offset: 40 })

    expect(apiGet.mock.calls[0][0]).toBe('/api/payment-proofs/trash?limit=20&offset=40')
    expect(result.total).toBe(7)
    expect(result.graceDays).toBe(15)
    expect(result.items.map((item) => item.id)).toEqual(['f1', 'f2'])
    expect(result.items[0]).toMatchObject({ source: 'ticket', person: 'Marcos', restorable: true })
    // Un dato dudoso nunca habilita restaurar: sólo `true` exacto.
    expect(result.items[1]).toMatchObject({ source: 'athlete', reason: 'manual', restorable: false })
  })

  it('restaurar y eliminar apuntan al archivo, con el id escapado', async () => {
    apiRequest.mockResolvedValueOnce({ restored: true }).mockResolvedValueOnce({ purged: true })
    expect(await restoreProofFile('a/b')).toEqual({ restored: true })
    await purgeProofFile('a/b')

    expect(apiRequest.mock.calls[0][0]).toBe('/api/payment-proofs/trash/a%2Fb/restore')
    expect(apiRequest.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(apiRequest.mock.calls[1][0]).toBe('/api/payment-proofs/trash/a%2Fb')
    expect(apiRequest.mock.calls[1][1]).toMatchObject({ method: 'DELETE' })
  })

  it('vaciar manda la confirmación explícita que exige el servidor', async () => {
    apiRequest.mockResolvedValueOnce({ purged: 4, failed: 1 })
    expect(await emptyProofTrash()).toEqual({ purged: 4, failed: 1 })
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ confirm: true })
  })

  it('la dirección para ver un archivo de la papelera es la del endpoint', () => {
    expect(proofTrashFileUrl('f1')).toMatch(/\/api\/payment-proofs\/trash\/f1\/file$/)
  })
})
