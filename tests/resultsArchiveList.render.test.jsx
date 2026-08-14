import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import ResultsArchiveList from '../src/components/ui/ResultsArchiveList.jsx'

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

function renderList(entries) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <ResultsArchiveList
          entries={entries}
          onNavigate={() => {}}
          onSelect={() => {}}
        />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('archivo de resultados', () => {
  it('muestra el lockup de Pitbull Classic en vez del título suelto', () => {
    renderList([
      {
        slug: 'pitbull-classic-2026',
        title: 'Pitbull Classic',
        venue: 'Maximal Strength Club',
        location: 'Buenos Aires',
        dateISO: '2026-12-12',
        resultsStatus: 'pending',
        featured: true,
      },
    ])

    expect(screen.getByRole('img', { name: 'Pitbull Classic' })).toBeTruthy()
    expect(document.querySelector('.results-archive-row--pitbull')).toBeTruthy()
    expect(document.querySelector('.results-archive-row__title.visually-hidden')?.textContent).toBe(
      'Pitbull Classic',
    )
  })
})
