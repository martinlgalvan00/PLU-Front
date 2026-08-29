import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DateTimeLocalInput from '../src/components/ui/DateTimeLocalInput.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => cleanup())

function renderField(value = '2026-09-03T07:48', onChange = () => {}) {
  return render(
    <I18nProvider>
      <label htmlFor="reg-opens">
        Abre la inscripción
        <DateTimeLocalInput
          id="reg-opens"
          name="registrationOpensAt"
          data-field="registrationOpensAt"
          value={value}
          onChange={onChange}
        />
      </label>
    </I18nProvider>,
  )
}

describe('DateTimeLocalInput', () => {
  it('muestra día/mes/año, no mes/día', () => {
    renderField()
    expect(screen.getByLabelText('Abre la inscripción').value).toBe('03/09/2026')
    expect(screen.getByLabelText('Hora').value).toBe('07:48')
  })

  it('emite YYYY-MM-DDTHH:mm al completar fecha y hora', () => {
    const onChange = vi.fn()
    renderField('', onChange)

    fireEvent.change(screen.getByLabelText('Abre la inscripción'), {
      target: { value: '03092026' },
    })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '0748' } })

    expect(onChange).toHaveBeenCalledWith({
      target: { name: 'registrationOpensAt', value: '2026-09-03T07:48' },
    })
  })

  it('al borrar la fecha para retippear, conserva la hora y emite la fecha nueva', () => {
    const onChange = vi.fn()
    renderField('2026-09-03T07:48', onChange)

    fireEvent.change(screen.getByLabelText('Abre la inscripción'), {
      target: { value: '' },
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Hora').value).toBe('07:48')

    fireEvent.change(screen.getByLabelText('Abre la inscripción'), {
      target: { value: '15092026' },
    })
    expect(onChange).toHaveBeenCalledWith({
      target: { name: 'registrationOpensAt', value: '2026-09-15T07:48' },
    })
  })

  it('vaciar fecha y hora sí limpia el valor', () => {
    const onChange = vi.fn()
    renderField('2026-09-03T07:48', onChange)

    fireEvent.change(screen.getByLabelText('Abre la inscripción'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({
      target: { name: 'registrationOpensAt', value: '' },
    })
  })
})
