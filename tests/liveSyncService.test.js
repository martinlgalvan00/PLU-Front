import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeBroadcastChannel {
  static instances = []

  constructor(name) {
    this.name = name
    this.onmessage = null
    this.postMessage = vi.fn()
    FakeBroadcastChannel.instances.push(this)
  }
}

afterEach(() => {
  FakeBroadcastChannel.instances = []
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('liveSyncService', () => {
  it('publica sólo una señal opaca y entrega señales remotas a sus listeners', async () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const sync = await import('../src/services/liveSyncService.js')
    const listener = vi.fn()
    const unsubscribe = sync.subscribeLiveSync(listener)

    sync.publishAthleteSnapshotInvalidation()
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({
      type: 'athlete-snapshot-invalidated',
    })

    FakeBroadcastChannel.instances[0].onmessage({
      data: { type: 'event-registration-invalidated', eventSlug: 'pitbull-classic-2026' },
    })
    expect(listener).toHaveBeenCalledWith({
      type: 'event-registration-invalidated', eventSlug: 'pitbull-classic-2026' },
    )
    unsubscribe()
  })
})
