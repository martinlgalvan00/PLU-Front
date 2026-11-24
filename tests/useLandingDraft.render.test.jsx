import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import useLandingDraft from '../src/components/admin/event-editor/landing/useLandingDraft.js'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'

const EVENT = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus',
  location: 'Berazategui',
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  landing: {
    templateId: 'builder',
    publicVisible: true,
    slots: { heroTitle: 'Original' },
    layout: { blocks: [{ id: 'hero', type: 'hero' }, { id: 'text-1', type: 'text', props: { title: 'A' } }] },
  },
}

function useHarness() {
  const [draft, setDraft] = useState(() => buildAdminEventDraft(EVENT))
  return { draft, landingDraft: useLandingDraft(draft, setDraft) }
}

describe('useLandingDraft', () => {
  it('un parche que llega tarde (subida de imagen) no revierte lo editado mientras tanto', () => {
    const { result } = renderHook(useHarness)
    // El callback se toma antes de editar, como el de una subida en curso.
    const lateApplyBlocks = result.current.landingDraft.applyBlocks
    const lateBlocks = result.current.landingDraft.currentBlocks

    act(() => result.current.landingDraft.patchSlot('heroTitle', 'Editado durante la subida'))
    act(() => lateApplyBlocks(lateBlocks().map((block) => ({ ...block, visible: true }))))

    expect(result.current.draft.landing.slots.heroTitle).toBe('Editado durante la subida')
  })

  it('los bloques "de ahora" reflejan un cambio hecho después de tomar el callback', () => {
    const { result } = renderHook(useHarness)
    const currentBlocks = result.current.landingDraft.currentBlocks
    act(() =>
      result.current.landingDraft.applyBlocks(
        result.current.landingDraft.landing.layout.blocks.filter((block) => block.id !== 'text-1'),
      ),
    )
    expect(currentBlocks().map((block) => block.id)).toEqual(['hero'])
  })
})
