import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useScrolled } from '../src/hooks/useMotion.js'

function Probe({ threshold = 20 }) {
  const scrolled = useScrolled(threshold)
  return <div data-testid="scrolled">{String(scrolled)}</div>
}

describe('useScrolled — motion tier low', () => {
  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.motionTier
  })

  it('sigue midiendo scroll sin tirar', async () => {
    document.documentElement.dataset.motionTier = 'low'
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 })
    render(<Probe />)
    expect(screen.getByTestId('scrolled').textContent).toBe('true')

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(screen.getByTestId('scrolled').textContent).toBe('false')
  })
})
