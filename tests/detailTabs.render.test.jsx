import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import DetailTabs from '../src/components/admin/DetailTabs.jsx'

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(cleanup)

describe('DetailTabs — overflow', () => {
  const OriginalObserver = globalThis.ResizeObserver

  afterEach(() => {
    globalThis.ResizeObserver = OriginalObserver
  })

  it('marca overflow cuando el tablist no entra', async () => {
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback
      }

      observe(element) {
        Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 938 })
        Object.defineProperty(element, 'clientWidth', { configurable: true, value: 685 })
        this.callback()
      }

      disconnect() {}
    }

    const { container } = render(
      <DetailTabs
        variant="editorial"
        activeTab="role-1"
        onChange={() => {}}
        tabs={[
          { id: 'role-1', label: 'Super Admin', count: 2 },
          { id: 'role-2', label: 'Administrador', count: 1 },
          { id: 'role-3', label: 'Economia', count: 0 },
        ]}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.detail-tabs.is-overflowing')).toBeTruthy()
    })
  })
})
