import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutocompleteField } from '../src/components/ui/FormFields.jsx'

afterEach(cleanup)

describe('AutocompleteField', () => {
  it('muestra opciones filtradas y permite seleccionar con click', () => {
    const onChange = vi.fn((event) => {
      // Simula controlled input del formulario de registro.
      currentValue = event.target.value
      rerender(
        <AutocompleteField
          label="Gimnasio"
          name="gym"
          value={currentValue}
          options={['Pitbull Barbell Club', 'Maximal Power']}
          onChange={onChange}
        />,
      )
    })
    let currentValue = ''
    const { rerender } = render(
      <AutocompleteField
        label="Gimnasio"
        name="gym"
        value={currentValue}
        options={['Pitbull Barbell Club', 'Maximal Power']}
        onChange={onChange}
      />,
    )

    const input = screen.getByRole('combobox', { name: /gimnasio/i })
    fireEvent.change(input, { target: { value: 'Pit' } })

    expect(currentValue).toBe('Pit')
    expect(screen.getByRole('option', { name: 'Pitbull Barbell Club' })).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('option', { name: 'Pitbull Barbell Club' }))

    expect(currentValue).toBe('Pitbull Barbell Club')
  })

  it('en blur resuelve a la opción canónica única por core', () => {
    const onChange = vi.fn()
    const onBlur = vi.fn()
    render(
      <AutocompleteField
        label="Gimnasio"
        name="gym"
        value="Pitbull"
        options={['Pitbull Barbell Club', 'Maximal Power']}
        onChange={onChange}
        onBlur={onBlur}
      />,
    )

    const input = screen.getByRole('combobox', { name: /gimnasio/i })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: 'Pitbull Barbell Club' }),
      }),
    )
    expect(onBlur).toHaveBeenCalled()
  })
})
