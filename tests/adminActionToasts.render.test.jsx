import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../src/lib/adminToast.js'

afterEach(cleanup)

const AdminActionToasts = (await import('../src/components/admin/AdminActionToasts.jsx')).default
const TableSkeleton = (await import('../src/components/ui/TableSkeleton.jsx')).default

function wrap(ui) {
  return <I18nProvider>{ui}</I18nProvider>
}

// El bus dispara un CustomEvent nativo: sin act() el re-render queda fuera
// del ciclo de testing-library y el query no ve el toast.
function emit(fn, message) {
  act(() => {
    fn(message)
  })
}

describe('toasts operativos del panel', () => {
  it('no renderiza nada hasta que se dispara una notificación', () => {
    const { container } = render(wrap(<AdminActionToasts />))
    expect(container.querySelector('.admin-toasts')).toBeNull()
  })

  it('confirma una acción exitosa con role=status', () => {
    render(wrap(<AdminActionToasts />))
    emit(notifySuccess, 'Pago aprobado')

    expect(screen.getByRole('status').textContent).toMatch(/pago aprobado/i)
  })

  it('marca los errores como alerta asertiva', () => {
    render(wrap(<AdminActionToasts />))
    emit(notifyError, 'La acción no se pudo completar')

    expect(screen.getByRole('alert').textContent).toMatch(/no se pudo completar/i)
  })

  it('se cierra desde el botón sin esperar el auto-dismiss', async () => {
    render(wrap(<AdminActionToasts />))
    emit(notifySuccess, 'Egreso registrado')

    fireEvent.click(screen.getByRole('button', { name: /cerrar notificación/i }))

    await waitFor(() => {
      expect(screen.queryByText('Egreso registrado')).toBeNull()
    })
  })

  it('mantiene a lo sumo tres notificaciones visibles', () => {
    render(wrap(<AdminActionToasts />))
    emit(notifySuccess, 'uno')
    emit(notifySuccess, 'dos')
    emit(notifySuccess, 'tres')
    emit(notifySuccess, 'cuatro')

    expect(screen.queryByText('uno')).toBeNull()
    expect(screen.getByText('dos')).toBeTruthy()
    expect(screen.getByText('cuatro')).toBeTruthy()
  })
})

describe('skeleton de tabla', () => {
  it('anuncia el estado de carga sin contenido legible', () => {
    render(wrap(<TableSkeleton rows={4} columns={6} />))

    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-busy')).toBe('true')
    const bars = status.querySelectorAll('.table-skeleton__label, .table-skeleton__cell')
    expect(bars.length).toBe((4 + 1) * 6)
    // Fuera del label accesible no hay texto: el skeleton es solo geometría.
    const visible = [...status.querySelectorAll('p')].filter((node) => !node.className.includes('visually-hidden'))
    expect(visible).toEqual([])
  })
})
