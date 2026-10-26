import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventLandingPreviewDialog from '../src/components/admin/event-editor/landing/PreviewDialog.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

// El renderer se carga diferido y arrastra páginas pesadas la primera vez.
const SLOW = { timeout: 15000 }

/** La landing se dibuja dentro del iframe de la vista previa, no en el documento del panel. */
const frameDoc = () => document.querySelector('iframe').contentDocument
const inFrame = () => within(frameDoc().body)

const BASE = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  description: 'El nuevo encuentro de fuerza de PLU ARG.',
  startsAt: '2027-03-06T10:00:00-03:00',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'proximamente',
}

const visible = { ...BASE, landing: { templateId: 'submission', publicVisible: true, slots: {} } }
const hidden = { ...BASE, landing: { templateId: 'submission', publicVisible: false, slots: {} } }

// El panel pasa `t` desde el provider de i18n del admin.
function Harness({ event, onClose = () => {} }) {
  return (
    <I18nProvider>
      <Dialog event={event} onClose={onClose} />
    </I18nProvider>
  )
}

function Dialog({ event, onClose }) {
  const { t } = useI18n()
  return <EventLandingPreviewDialog event={event} t={t} onClose={onClose} />
}

describe('EventLandingPreviewDialog', { timeout: 30000 }, () => {
  it('se abre como diálogo modal y muestra la landing del borrador', async () => {
    render(<Harness event={visible} />)

    expect(screen.getByRole('dialog', { name: /vista previa de la landing/i })).toBeTruthy()
    expect(await inFrame().findByRole('heading', { name: 'Barbell Submission' }, SLOW)).toBeTruthy()
    // Encendida: no hay selector de versiones.
    expect(screen.queryByRole('group', { name: /qué versión ver/i })).toBeNull()
  })

  it('con el interruptor apagado muestra "en construcción" y deja ver la landing publicada', async () => {
    render(<Harness event={hidden} />)

    expect((await inFrame().findByRole('status', {}, SLOW)).textContent).toMatch(/plataforma en construcción/i)

    fireEvent.click(screen.getByRole('button', { name: /con la landing publicada/i }))
    expect(await inFrame().findByText('Virtus Fitness', {}, SLOW)).toBeTruthy()
    expect(inFrame().queryByText(/plataforma en construcción/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /como la ve el público/i }))
    expect(await inFrame().findByText(/plataforma en construcción/i, {}, SLOW)).toBeTruthy()
  })

  it('cierra con Escape y con el botón, y devuelve el foco', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const { unmount } = render(<Harness event={visible} onClose={onClose} />)
    await inFrame().findByRole('heading', { name: 'Barbell Submission' }, SLOW)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /^cerrar$/i }))
    expect(onClose).toHaveBeenCalledTimes(2)

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('los links a otras rutas no sacan al staff del panel', async () => {
    render(<Harness event={visible} />)
    await inFrame().findByRole('heading', { name: 'Barbell Submission' }, SLOW)

    // Los links viven en el documento del iframe, dentro de lo que renderiza React.
    const shell = frameDoc().querySelector('main')
    const external = frameDoc().createElement('a')
    external.setAttribute('href', '/calendario')
    shell.appendChild(external)
    const anchor = frameDoc().createElement('a')
    anchor.setAttribute('href', '#submission-information')
    shell.appendChild(anchor)

    expect(fireEvent.click(external)).toBe(false) // preventDefault
    expect(fireEvent.click(anchor)).toBe(true)
  })

  it('el borrador manda: muestra el título sin guardar', async () => {
    render(<Harness event={{ ...visible, landing: { ...visible.landing, slots: { heroTitle: 'Título nuevo' } } }} />)
    expect(await inFrame().findByRole('heading', { name: 'Título nuevo' }, SLOW)).toBeTruthy()
  })

  it('cambia el ancho del marco según el dispositivo', async () => {
    render(<Harness event={visible} />)
    await inFrame().findByRole('heading', { name: 'Barbell Submission' }, SLOW)
    const frame = document.querySelector('iframe')

    expect(frame.style.width).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /^móvil$/i }))
    expect(frame.style.width).toBe('390px')
    expect(document.querySelector('.admin-landing-preview__stage').className).toMatch(/is-framed/)
    fireEvent.click(screen.getByRole('button', { name: /^tablet$/i }))
    expect(frame.style.width).toBe('768px')
    fireEvent.click(screen.getByRole('button', { name: /^escritorio$/i }))
    expect(frame.style.width).toBe('')
  })

  it('el iframe lleva los estilos y el tema del panel, y los mantiene al día', async () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const style = document.createElement('style')
    style.id = 'estilo-del-panel'
    style.textContent = '.x { color: red }'
    document.head.appendChild(style)

    render(<Harness event={visible} />)
    await inFrame().findByRole('heading', { name: 'Barbell Submission' }, SLOW)

    expect(frameDoc().documentElement.getAttribute('data-theme')).toBe('light')
    expect(frameDoc().head.querySelector('#estilo-del-panel')?.textContent).toBe('.x { color: red }')

    // Un CSS que se inyecta después (chunk perezoso) también llega al marco.
    const late = document.createElement('style')
    late.id = 'estilo-tardio'
    document.head.appendChild(late)
    await vi.waitFor(() => expect(frameDoc().head.querySelector('#estilo-tardio')).not.toBeNull())

    cleanup()
    style.remove()
    late.remove()
    document.documentElement.removeAttribute('data-theme')
  })
})
