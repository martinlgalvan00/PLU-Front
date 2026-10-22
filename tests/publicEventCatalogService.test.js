import { describe, expect, it } from 'vitest'
import { isPublicCatalogEvent } from '../server/services/publicEventCatalogService.js'

describe('isPublicCatalogEvent', () => {
  it('no expone Submission cuando su landing esta apagada', () => {
    expect(
      isPublicCatalogEvent({
        rules: { landing: { templateId: 'submission', publicVisible: false } },
      }),
    ).toBe(false)
  })

  it('conserva visibles los eventos existentes y Submission encendida', () => {
    expect(isPublicCatalogEvent({ rules: {} })).toBe(true)
    expect(
      isPublicCatalogEvent({
        rules: { landing: { templateId: 'submission', publicVisible: true } },
      }),
    ).toBe(true)
  })
})
