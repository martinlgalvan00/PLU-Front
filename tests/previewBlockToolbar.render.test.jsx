import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PreviewBlockToolbar from '../src/components/admin/event-editor/landing/PreviewBlockToolbar.jsx'

/**
 * Barra sobre el bloque elegido en la vista previa del editor visual. Se prueba
 * contra el documento de jsdom con los bloques dibujados como en la landing.
 */

const LABELS = {
  'admin.eventEditor.landingBlockType_text': 'Texto',
  'admin.eventEditor.landingBlockType_cta': 'Botón',
  'admin.eventEditor.landingBlockType_faq': 'Preguntas frecuentes',
  'admin.eventEditor.landingBlockType_experience': 'Experiencia',
  'admin.eventEditor.landingBlockType_weighIns': 'Pesajes',
}
const t = (key, params = {}) => {
  if (LABELS[key]) return LABELS[key]
  const name = params.name ?? ''
  return (
    {
      'admin.eventEditor.landingPreviewToolbar': `Acciones de ${name}`,
      'admin.eventEditor.landingPreviewDrag': `Arrastrar ${name}`,
      'admin.eventEditor.landingBlockMoveUp': `Subir ${name}`,
      'admin.eventEditor.landingBlockMoveDown': `Bajar ${name}`,
      'admin.eventEditor.landingPreviewHide': `Ocultar ${name}`,
      'admin.eventEditor.landingBlockRemove': `Eliminar ${name}`,
    }[key] ?? key
  )
}

const blocks = [
  { id: 'hero', type: 'hero', visible: true },
  { id: 'text-1', type: 'text', visible: true, props: { title: 'Formato' } },
  { id: 'experience', type: 'experience', visible: true },
  { id: 'faq', type: 'faq', visible: false },
  { id: 'cta-1', type: 'cta', visible: true, props: { label: 'Ir' } },
  { id: 'weighIns', type: 'weighIns', visible: true },
]

beforeEach(() => {
  document.body.innerHTML = blocks
    .filter((block) => block.visible)
    .map((block) => `<section id="bloque-${block.id}">${block.id}</section>`)
    .join('')
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function renderToolbar(selectedId, onChange = vi.fn()) {
  render(
    <PreviewBlockToolbar
      blocks={blocks}
      doc={document}
      selectedId={selectedId}
      t={t}
      onChange={onChange}
    />,
  )
  return onChange
}

const ids = (list) => list.map((block) => block.id)

describe('barra sobre el bloque en la vista previa', () => {
  it('un bloque propio se puede arrastrar, mover, ocultar y quitar', () => {
    renderToolbar('cta-1')
    expect(screen.getByRole('toolbar', { name: 'Acciones de Botón 1' })).toBeTruthy()
    for (const name of [
      'Arrastrar Botón 1',
      'Subir Botón 1',
      'Bajar Botón 1',
      'Ocultar Botón 1',
      'Eliminar Botón 1',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('un integrado se oculta pero no se quita', () => {
    renderToolbar('experience')
    expect(screen.getByRole('button', { name: 'Ocultar Experiencia' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull()
  })

  it('subir salta los bloques ocultos: cambia lo que se ve', () => {
    const onChange = renderToolbar('cta-1')
    fireEvent.click(screen.getByRole('button', { name: 'Subir Botón 1' }))
    expect(ids(onChange.mock.calls[0][0])).toEqual([
      'hero',
      'text-1',
      'cta-1',
      'experience',
      'faq',
      'weighIns',
    ])
  })

  it('el primero después de la portada no sube y el último no baja', () => {
    renderToolbar('text-1')
    expect(screen.getByRole('button', { name: 'Subir Texto 1' }).disabled).toBe(true)
    cleanup()
    renderToolbar('weighIns')
    expect(screen.getByRole('button', { name: 'Bajar Pesajes' }).disabled).toBe(true)
  })

  it('ocultar un integrado también apaga su módulo público', () => {
    const onChange = renderToolbar('weighIns')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Pesajes' }))
    const [next, surface] = onChange.mock.calls[0]
    expect(next.find((block) => block.id === 'weighIns').visible).toBe(false)
    expect(surface).toEqual({ key: 'weighIns', visible: false })
  })

  it('quitar saca el bloque propio de la lista', () => {
    const onChange = renderToolbar('text-1')
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Texto 1' }))
    expect(ids(onChange.mock.calls[0][0])).not.toContain('text-1')
  })

  it('sobre la portada o sin bloque elegido no hay barra', () => {
    renderToolbar('hero')
    expect(screen.queryByRole('toolbar')).toBeNull()
    cleanup()
    renderToolbar(null)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})
