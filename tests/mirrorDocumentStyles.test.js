import { afterEach, describe, expect, it } from 'vitest'
import { mirrorDocumentStyles } from '../src/lib/mirrorDocumentStyles.js'

const make = () => document.implementation.createHTMLDocument()
const style = (doc, css, id) => {
  const node = doc.createElement('style')
  if (id) node.id = id
  node.textContent = css
  return node
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let stop = () => {}
afterEach(() => stop())

describe('mirrorDocumentStyles', () => {
  it('copia las hojas que ya existen, en orden, e ignora el resto del head', () => {
    const source = make()
    const target = make()
    const link = source.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/assets/app.css'
    source.head.append(style(source, 'a{}', 'a'), link, source.createElement('meta'))

    stop = mirrorDocumentStyles(source, target)

    expect([...target.head.children].map((node) => node.tagName)).toEqual(['STYLE', 'LINK'])
    expect(target.head.querySelector('#a').textContent).toBe('a{}')
    expect(target.head.querySelector('link').getAttribute('href')).toBe('/assets/app.css')
  })

  it('suma las que se inyectan después y quita las que se eliminan', async () => {
    const source = make()
    const target = make()
    stop = mirrorDocumentStyles(source, target)

    const late = style(source, 'late{}', 'late')
    source.head.appendChild(late)
    await settle()
    expect(target.head.querySelector('#late')).not.toBeNull()

    late.remove()
    await settle()
    expect(target.head.querySelector('#late')).toBeNull()
  })

  it('refleja el cambio de texto de un <style> (HMR)', async () => {
    const source = make()
    const target = make()
    const node = style(source, 'old{}', 'hmr')
    source.head.appendChild(node)
    stop = mirrorDocumentStyles(source, target)

    node.textContent = 'new{}'
    await settle()
    expect(target.head.querySelector('#hmr').textContent).toBe('new{}')
  })

  it('no copia dos veces la misma hoja', async () => {
    const source = make()
    const target = make()
    const node = style(source, 'a{}', 'a')
    source.head.appendChild(node)
    stop = mirrorDocumentStyles(source, target)

    source.head.appendChild(node) // mover un nodo existente dispara "added"
    await settle()
    expect(target.head.querySelectorAll('#a')).toHaveLength(1)
  })

  it('al cortar deja el destino limpio y no sigue observando', async () => {
    const source = make()
    const target = make()
    source.head.appendChild(style(source, 'a{}', 'a'))
    const dispose = mirrorDocumentStyles(source, target)

    dispose()
    source.head.appendChild(style(source, 'b{}', 'b'))
    await settle()
    expect(target.head.children).toHaveLength(0)
  })
})
