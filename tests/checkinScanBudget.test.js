import { describe, expect, it, vi } from 'vitest'
import { resolveDoorScan } from '../src/services/checkinScanBudget.js'

describe('resolveDoorScan', () => {
  it('sin señal no llama a la red y usa la foto local', async () => {
    const readNetwork = vi.fn()
    const decision = await resolveDoorScan({
      online: false,
      readLocal: async () => ({ kind: 'ticket' }),
      readNetwork,
    })
    expect(decision).toEqual({ source: 'local', local: { kind: 'ticket' } })
    expect(readNetwork).not.toHaveBeenCalled()
  })

  it('si la red contesta enseguida, manda el servidor y no abre la foto', async () => {
    const readLocal = vi.fn(async () => ({ kind: 'ticket' }))
    const decision = await resolveDoorScan({
      online: true,
      budgetMs: 5_000,
      readLocal,
      readNetwork: async () => ({ outcome: 'ready' }),
    })
    expect(decision.source).toBe('network')
    expect(decision.value).toEqual({ outcome: 'ready' })
    expect(readLocal).not.toHaveBeenCalled()
  })

  it('si la red no entra en el presupuesto, muestra la foto y después la corrige', async () => {
    let finish
    const network = new Promise((resolve) => {
      finish = resolve
    })
    const onNetwork = vi.fn()
    const decision = await resolveDoorScan({
      online: true,
      budgetMs: 0,
      readLocal: async () => ({ kind: 'ticket' }),
      readNetwork: () => network,
      onNetwork,
    })

    expect(decision).toEqual({ source: 'local', local: { kind: 'ticket' } })
    finish({ outcome: 'already_used' })
    await vi.waitFor(() => expect(onNetwork).toHaveBeenCalled())
    expect(onNetwork).toHaveBeenCalledWith({
      source: 'network',
      value: { outcome: 'already_used' },
    })
  })
})
