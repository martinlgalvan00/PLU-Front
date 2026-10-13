import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentProofsPanel from '../src/components/admin/PaymentProofsPanel.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Archivo de comprobantes en Cobros: lo que va a la papelera se avisa antes,
 * activar una política que puede llevarse comprobantes sin copia pide una
 * segunda confirmación, y la papelera permite restaurar o eliminar para siempre.
 */

const fetchArchive = vi.hoisted(() => vi.fn())
const fetchForecast = vi.hoisted(() => vi.fn())
const saveRetention = vi.hoisted(() => vi.fn())
const downloadZip = vi.hoisted(() => vi.fn())
const downloadAll = vi.hoisted(() => vi.fn())
const fetchTrash = vi.hoisted(() => vi.fn())
const restoreFile = vi.hoisted(() => vi.fn())
const purgeFile = vi.hoisted(() => vi.fn())
const emptyTrash = vi.hoisted(() => vi.fn())

vi.mock('../src/services/paymentProofsAdminService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchProofArchive: fetchArchive,
  fetchProofForecast: fetchForecast,
  saveProofRetention: saveRetention,
  downloadProofsZip: downloadZip,
  downloadAllProofs: downloadAll,
  downloadProofIndex: vi.fn(),
  fetchProofTrash: fetchTrash,
  restoreProofFile: restoreFile,
  purgeProofFile: purgeFile,
  emptyProofTrash: emptyTrash,
}))

const SUMMARY = { onServer: 12, notDownloaded: 5, downloaded: 7, deleted: 3 }
const NO_FORECAST = {
  count: 0,
  notDownloaded: 0,
  dueNow: 0,
  windowDays: 7,
  nextDueAt: null,
}

function archive(settings = {}, forecast = null, trash = {}) {
  return {
    summary: SUMMARY,
    settings: {
      mode: 'keep',
      days: 30,
      graceDays: 30,
      updatedBy: null,
      updatedAt: null,
      ...settings,
    },
    forecast,
    trash: { count: 0, dueForPurge: 0, graceDays: 30, ...trash },
  }
}

const trashItem = (id, patch = {}) => ({
  id,
  source: 'athlete',
  reference: `RORD-${id}`,
  person: 'Ana Pérez',
  reason: 'manual',
  deletedAt: '2026-10-10T12:00:00.000Z',
  purgeAt: '2999-01-01T00:00:00.000Z',
  exportedAt: null,
  restorable: true,
  ...patch,
})

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <PaymentProofsPanel canEdit {...props} />
    </I18nProvider>,
  )
}

/** Los chips de plazo y de período repiten valores: se consulta cada grupo por nombre. */
const retentionGroup = () => within(screen.getByRole('radiogroup', { name: 'Plazo' }))
const graceGroup = () => within(screen.getByRole('radiogroup', { name: 'Período de la papelera' }))

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  fetchArchive.mockResolvedValue(archive())
  fetchForecast.mockResolvedValue(NO_FORECAST)
  saveRetention.mockResolvedValue({})
  downloadZip.mockResolvedValue({ count: 5, remaining: 0 })
  downloadAll.mockResolvedValue({ count: 230, batches: 3 })
  fetchTrash.mockResolvedValue({ items: [], total: 0, graceDays: 30 })
  restoreFile.mockResolvedValue({ restored: true })
  purgeFile.mockResolvedValue(undefined)
  emptyTrash.mockResolvedValue({ purged: 0, failed: 0 })
})

describe('PaymentProofsPanel', () => {
  it('conservando todo no hay nada que avisar', async () => {
    renderPanel()
    expect(await screen.findByText('Comprobantes')).toBeTruthy()
    expect(screen.queryByText(/Van a la papelera en los próximos/)).toBeNull()
  })

  it('avisa qué va a la papelera pronto y cuánto no tiene copia', async () => {
    fetchArchive.mockResolvedValue(
      archive(
        { mode: 'after_days', days: 10 },
        { count: 4, notDownloaded: 3, dueNow: 1, windowDays: 7, nextDueAt: null },
      ),
    )
    renderPanel()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Van a la papelera en los próximos 7 días: 4.')
    expect(alert.textContent).toContain('Ya vencidos, van en la próxima limpieza: 1.')
    expect(alert.textContent).toContain('Sin descargar: 3.')
  })

  it('con todo respaldado el aviso no es una alerta', async () => {
    fetchArchive.mockResolvedValue(
      archive(
        { mode: 'after_export', days: 7 },
        { count: 2, notDownloaded: 0, dueNow: 0, windowDays: 7, nextDueAt: null },
      ),
    )
    renderPanel()
    const note = await screen.findByText(/Van a la papelera en los próximos 7 días: 2/)
    expect(note.closest('[role="alert"]')).toBeNull()
  })

  it('las cifras incluyen cuántos hay en la papelera', async () => {
    fetchArchive.mockResolvedValue(archive({}, null, { count: 6 }))
    renderPanel()
    const label = await screen.findByText('En la papelera')
    expect(label.previousElementSibling?.textContent).toBe('6')
  })

  it('descargar el ZIP muestra el resultado y vuelve a leer el estado', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Descargar 5 comprobantes/ }))
    expect(await screen.findByText(/Descargaste 5 comprobantes/)).toBeTruthy()
    expect(downloadZip).toHaveBeenCalledWith('pending')
    expect(fetchArchive).toHaveBeenCalledTimes(2)
  })

  it('volver a descargar todo encadena las tandas y las cuenta', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Volver a descargar todo' }))
    expect(await screen.findByText('Descargaste 230 comprobantes en 3 tandas.')).toBeTruthy()
    expect(downloadAll).toHaveBeenCalledTimes(1)
    expect(fetchArchive).toHaveBeenCalledTimes(2)
  })

  it('elegir un plazo habitual y guardar la papelera después de descargar no pide confirmación', async () => {
    renderPanel()
    fireEvent.click(await screen.findByLabelText(/Papelera después de descargarlos/))
    fireEvent.click(retentionGroup().getByLabelText('7 días'))
    // La vista previa se pide con el borrador, no con lo guardado.
    await waitFor(() =>
      expect(fetchForecast).toHaveBeenCalledWith({ mode: 'after_export', days: 7 }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    await waitFor(() =>
      expect(saveRetention).toHaveBeenCalledWith({ mode: 'after_export', days: 7, graceDays: 30 }),
    )
  })

  it('la papelera a los N días de aprobar exige confirmar antes de guardar', async () => {
    fetchForecast.mockResolvedValue({
      count: 6,
      notDownloaded: 4,
      dueNow: 0,
      windowDays: 7,
      nextDueAt: null,
    })
    renderPanel()
    fireEvent.click(await screen.findByLabelText(/Papelera a los N días de aprobar/))
    fireEvent.click(retentionGroup().getByLabelText('10 días'))
    await screen.findByText(/Con esta configuración/)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    expect(saveRetention).not.toHaveBeenCalled()
    // El aviso dice cuánto tiempo hay para recuperar antes de perder lo no descargado.
    await screen.findByText(/Se pueden recuperar durante 30 días/)

    fireEvent.click(screen.getByRole('button', { name: 'Sí, activar' }))
    await waitFor(() =>
      expect(saveRetention).toHaveBeenCalledWith({ mode: 'after_days', days: 10, graceDays: 30 }),
    )
  })

  it('cancelar la confirmación no guarda nada, y cambiar el borrador la descarta', async () => {
    renderPanel()
    fireEvent.click(await screen.findByLabelText(/Papelera a los N días de aprobar/))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(saveRetention).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    await screen.findByRole('button', { name: 'Sí, activar' })
    fireEvent.click(retentionGroup().getByLabelText('90 días'))
    expect(screen.queryByRole('button', { name: 'Sí, activar' })).toBeNull()
  })

  it('"Otro" abre el campo de días y valida el rango', async () => {
    renderPanel()
    fireEvent.click(await screen.findByLabelText(/Papelera después de descargarlos/))
    fireEvent.click(retentionGroup().getByLabelText('Otro'))
    const input = screen.getByLabelText('Cantidad de días')
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Guardar política' }).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '21' } })
    expect(screen.getByRole('button', { name: 'Guardar política' }).disabled).toBe(false)
  })

  it('sin permiso de aprobar, la política es de sólo lectura', async () => {
    renderPanel({ canEdit: false })
    expect(await screen.findByText(/Sólo quien puede aprobar pagos cambia/)).toBeTruthy()
    // El bloqueo lo hereda del fieldset: se consulta por :disabled, no por la propiedad.
    expect(screen.getByLabelText(/Conservarlos siempre/).matches(':disabled')).toBe(true)
  })

  it('un rol sin acceso a pagos no ve la sección', async () => {
    fetchArchive.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
    const { container } = renderPanel()
    await waitFor(() => expect(fetchArchive).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('section')).toBeNull())
  })
})

describe('PaymentProofsPanel — período de la papelera', () => {
  it('se cambia aparte de la política y se guarda junto', async () => {
    renderPanel()
    await screen.findByText('Comprobantes')
    fireEvent.click(graceGroup().getByLabelText('60 días'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    await waitFor(() =>
      expect(saveRetention).toHaveBeenCalledWith({ mode: 'keep', days: 30, graceDays: 60 }),
    )
  })

  it('acortarlo con archivos en la papelera pide confirmar y avisa qué pasa', async () => {
    fetchArchive.mockResolvedValue(archive({ graceDays: 60 }, null, { count: 4 }))
    renderPanel()
    await screen.findByText('Comprobantes')
    fireEvent.click(graceGroup().getByLabelText('7 días'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))

    expect(saveRetention).not.toHaveBeenCalled()
    await screen.findByText(/se eliminan para siempre en la próxima limpieza/)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, activar' }))
    await waitFor(() =>
      expect(saveRetention).toHaveBeenCalledWith({ mode: 'keep', days: 30, graceDays: 7 }),
    )
  })

  it('alargarlo, o acortarlo con la papelera vacía, se guarda sin confirmar', async () => {
    fetchArchive.mockResolvedValue(archive({ graceDays: 60 }, null, { count: 0 }))
    renderPanel()
    await screen.findByText('Comprobantes')
    fireEvent.click(graceGroup().getByLabelText('7 días'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar política' }))
    await waitFor(() => expect(saveRetention).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Sí, activar' })).toBeNull()
  })

  it('un valor fuera de rango en "Otro" bloquea el guardado', async () => {
    renderPanel()
    await screen.findByText('Comprobantes')
    fireEvent.click(graceGroup().getByLabelText('Otro'))
    fireEvent.change(screen.getByLabelText('Cantidad de días en la papelera'), {
      target: { value: '0' },
    })
    expect(screen.getByRole('button', { name: 'Guardar política' }).disabled).toBe(true)
  })
})

describe('PaymentProofsPanel — papelera', () => {
  async function openTrash(items, props = {}, trash = {}) {
    fetchArchive.mockResolvedValue(archive({}, null, { count: items.length, ...trash }))
    fetchTrash.mockResolvedValue({ items, total: items.length, graceDays: 30 })
    renderPanel(props)
    fireEvent.click(await screen.findByRole('button', { name: /Ver papelera \(\d+\)/ }))
    await waitFor(() => expect(fetchTrash).toHaveBeenCalled())
  }

  it('no consulta la papelera hasta que se abre', async () => {
    renderPanel()
    await screen.findByText('Comprobantes')
    expect(fetchTrash).not.toHaveBeenCalled()
  })

  it('muestra a quién corresponde cada archivo, por qué está ahí y cuándo se elimina', async () => {
    await openTrash([
      trashItem('a1', { reason: 'superseded', exportedAt: '2026-10-11T00:00:00.000Z' }),
    ])
    expect(await screen.findByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText(/Atleta · RORD-a1 · Reemplazado por otro comprobante/)).toBeTruthy()
    expect(screen.getByText(/Se elimina el .* · Descargado/)).toBeTruthy()
  })

  it('una lista vacía lo dice', async () => {
    await openTrash([])
    expect(await screen.findByText('La papelera está vacía.')).toBeTruthy()
  })

  it('restaurar es directo, avisa y vuelve a leer las cifras sin pisar el borrador', async () => {
    await openTrash([trashItem('a1')])
    // Una política a medio editar no se pierde al restaurar.
    fireEvent.click(screen.getByLabelText(/Papelera después de descargarlos/))

    fireEvent.click(await screen.findByRole('button', { name: /Restaurar/ }))
    expect(await screen.findByText('Comprobante restaurado.')).toBeTruthy()
    expect(restoreFile).toHaveBeenCalledWith('a1')
    expect(fetchArchive).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText(/Papelera después de descargarlos/).checked).toBe(true)
  })

  it('un archivo que no se puede restaurar no ofrece el botón y dice por qué', async () => {
    await openTrash([trashItem('a1', { restorable: false })])
    expect((await screen.findByRole('button', { name: /Restaurar/ })).disabled).toBe(true)
    expect(screen.getByText(/No se puede restaurar: la orden ya no existe/)).toBeTruthy()
  })

  it('si la base rechaza la restauración se muestra el motivo', async () => {
    restoreFile.mockRejectedValue(new Error('La orden ya tiene otro comprobante.'))
    await openTrash([trashItem('a1')])
    fireEvent.click(await screen.findByRole('button', { name: /Restaurar/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('otro comprobante')
  })

  it('eliminar para siempre pide una segunda confirmación y se puede cancelar', async () => {
    await openTrash([trashItem('a1')])
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar ahora' }))
    expect(purgeFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Eliminar ahora' })).toBeTruthy()
    expect(purgeFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ahora' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar para siempre' }))
    await waitFor(() => expect(purgeFile).toHaveBeenCalledWith('a1'))
    expect(await screen.findByText('Comprobante eliminado.')).toBeTruthy()
  })

  it('vaciar la papelera pide confirmar con la cantidad y cuenta lo eliminado', async () => {
    emptyTrash.mockResolvedValue({ purged: 2, failed: 0 })
    await openTrash([trashItem('a1'), trashItem('a2')])
    fireEvent.click(await screen.findByRole('button', { name: 'Vaciar papelera' }))
    expect(emptyTrash).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('No se puede deshacer')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 2 para siempre' }))
    await waitFor(() => expect(emptyTrash).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Se eliminaron 2 comprobantes de la papelera.')).toBeTruthy()
  })

  it('si algunos no se pudieron eliminar, lo dice en vez de dar todo por hecho', async () => {
    emptyTrash.mockResolvedValue({ purged: 1, failed: 1 })
    await openTrash([trashItem('a1'), trashItem('a2')])
    fireEvent.click(await screen.findByRole('button', { name: 'Vaciar papelera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 2 para siempre' }))
    expect(await screen.findByText(/1 no se pudieron borrar/)).toBeTruthy()
  })

  it('sin permiso de aprobar se puede ver el archivo pero no restaurar ni eliminar', async () => {
    await openTrash([trashItem('a1')], { canEdit: false })
    await screen.findByText('Ana Pérez')
    expect(screen.getByRole('link', { name: /Ver archivo/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Restaurar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar ahora' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vaciar papelera' })).toBeNull()
  })

  it('"ver más" agrega la página siguiente a lo ya cargado', async () => {
    fetchArchive.mockResolvedValue(archive({}, null, { count: 3 }))
    fetchTrash
      .mockResolvedValueOnce({ items: [trashItem('a1'), trashItem('a2')], total: 3, graceDays: 30 })
      .mockResolvedValueOnce({ items: [trashItem('a3')], total: 3, graceDays: 30 })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Ver papelera/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver más' }))

    await waitFor(() => expect(screen.getAllByText('Ana Pérez')).toHaveLength(3))
    expect(fetchTrash).toHaveBeenLastCalledWith({ limit: 20, offset: 2 })
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull()
  })
})
