import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAthleteCredentialQr } from '../src/hooks/useAthleteCredentialQr.js'

const peekCredentialQr = vi.fn()
const generateCredentialQr = vi.fn()

vi.mock('../src/lib/credentialQr.js', () => ({
  buildAthleteCredentialUrl: (code) => `https://plu.test/?credencial=${code}`,
  peekCredentialQr: (...args) => peekCredentialQr(...args),
  generateCredentialQr: (...args) => generateCredentialQr(...args),
}))

function Probe({ code }) {
  const { qrSrc, qrBusy } = useAthleteCredentialQr(code)
  return <output data-busy={qrBusy ? '1' : '0'}>{qrSrc ?? ''}</output>
}

describe('useAthleteCredentialQr', () => {
  afterEach(cleanup)

  beforeEach(() => {
    peekCredentialQr.mockReset()
    generateCredentialQr.mockReset()
  })

  it('no vuelve a dibujar un QR que ya está en memoria', () => {
    peekCredentialQr.mockReturnValue('data:image/png;base64,listo')

    render(<Probe code="11111111-1111-4111-8111-111111111111" />)

    expect(screen.getByRole('status').textContent).toBe('data:image/png;base64,listo')
    expect(screen.getByRole('status').dataset.busy).toBe('0')
    expect(generateCredentialQr).not.toHaveBeenCalled()
  })

  it('pide el dibujo una sola vez cuando todavía no existe', async () => {
    peekCredentialQr.mockReturnValue(null)
    generateCredentialQr.mockResolvedValue('data:image/png;base64,nuevo')

    const view = render(<Probe code="token-a" />)
    expect(screen.getByRole('status').dataset.busy).toBe('1')

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('data:image/png;base64,nuevo')
    })
    expect(generateCredentialQr).toHaveBeenCalledTimes(1)

    view.rerender(<Probe code="token-a" />)
    expect(generateCredentialQr).toHaveBeenCalledTimes(1)
  })
})
