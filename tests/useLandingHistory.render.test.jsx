import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useLandingHistory from '../src/components/admin/event-editor/landing/useLandingHistory.js'

afterEach(() => vi.useRealTimers())

function useHarness() {
  const [draft, setDraft] = useState({
    title: 'Pitbull',
    slots: 80,
    landing: { slots: { heroTitle: '' } },
  })
  const history = useLandingHistory(draft, setDraft)
  const type = (heroTitle) =>
    history.patchDraft({ ...draft, landing: { slots: { heroTitle } } })
  return { draft, setDraft, history, type }
}

describe('useLandingHistory', () => {
  it('tipeo seguido es un solo paso; una pausa abre otro', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { result } = renderHook(useHarness)

    act(() => result.current.type('B'))
    vi.setSystemTime(10_200)
    act(() => result.current.type('Ba'))
    vi.setSystemTime(10_400)
    act(() => result.current.type('Bar'))
    vi.setSystemTime(12_000)
    act(() => result.current.type('Barbell'))

    act(() => result.current.history.undo())
    expect(result.current.draft.landing.slots.heroTitle).toBe('Bar')
    act(() => result.current.history.undo())
    expect(result.current.draft.landing.slots.heroTitle).toBe('')
    expect(result.current.history.canUndo).toBe(false)

    act(() => result.current.history.redo())
    expect(result.current.draft.landing.slots.heroTitle).toBe('Bar')
  })

  it('deshacer repone la landing sin pisar lo demás del evento', () => {
    const { result } = renderHook(useHarness)
    act(() => result.current.type('Barbell'))
    act(() => result.current.setDraft((draft) => ({ ...draft, slots: 120 })))
    act(() => result.current.history.undo())
    expect(result.current.draft.landing.slots.heroTitle).toBe('')
    expect(result.current.draft.slots).toBe(120)
  })

  it('un cambio nuevo después de deshacer descarta lo que se podía rehacer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { result } = renderHook(useHarness)
    act(() => result.current.type('A'))
    act(() => result.current.history.undo())
    expect(result.current.history.canRedo).toBe(true)
    vi.setSystemTime(5_000)
    act(() => result.current.type('B'))
    expect(result.current.history.canRedo).toBe(false)
  })
})
