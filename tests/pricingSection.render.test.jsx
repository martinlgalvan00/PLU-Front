import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PricingSection from '../src/pages/admin/PricingSection.jsx'
import { generateCredentialQr } from '../src/lib/credentialQr.js'

vi.mock('../src/lib/credentialQr.js', () => ({
  generateCredentialQr: vi.fn(async () => 'data:image/png;base64,promotion-qr'),
}))

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

it('copia el código con fallback, descarga su QR y expone un canje real tras validar', async () => {
  const writeText = vi.fn(async () => {
    throw new Error('Clipboard permission denied')
  })
  const execCommand = vi.fn(() => true)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const onSimulatePromotionCode = vi.fn(async () => ({
    simulation: {
      destination: { kind: 'account_offer' },
      checks: { active: true, withinWindow: true },
    },
  }))

  renderPricing({
    onSimulatePromotionCode,
    configuration: {
      ...configuration,
      discountCodes: [
        {
          id: 'coupon-actions',
          code: 'ONLY-PITBULL',
          kind: 'offer',
          fixedPrice: 120000,
          appliesTo: 'combo',
          redeemedCount: 0,
          active: true,
        },
      ],
    },
  })

  // Lo que se reparte es el código, no un enlace: no existe una página pública
  // que abra un canje. Se canjea desde el campo de Afiliación o Inscripción.
  expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBe(null)

  fireEvent.click(screen.getByRole('button', { name: 'Copiar código ONLY-PITBULL' }))
  expect(writeText).toHaveBeenCalledWith('ONLY-PITBULL')
  expect(await screen.findByText('Copiado')).toBeTruthy()
  expect(execCommand).toHaveBeenCalledWith('copy')

  // Y el QR codifica el código pelado, porque su destino es el botón de escaneo
  // de esos campos.
  fireEvent.click(screen.getByRole('button', { name: 'Descargar QR' }))
  expect(generateCredentialQr).toHaveBeenCalledWith('ONLY-PITBULL')
  expect(await screen.findByText('QR descargado')).toBeTruthy()
  expect(anchorClick).toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Probar flujo' }))
  expect(onSimulatePromotionCode).toHaveBeenCalledWith('coupon-actions')
  expect(await screen.findByText('Recorrido verificado')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Abrir canje en otra pestaña' })).toBe(null)
  expect(
    screen.getByText('Se canjea desde el campo de código de Afiliación o Inscripción.'),
  ).toBeTruthy()
  anchorClick.mockRestore()
})

afterEach(cleanup)

const configuration = {
  availability: { editable: true, reason: null },
  plans: [
    {
      id: 'plan-active',
      familyCode: 'plu-annual',
      version: 6,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 1,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-14T00:00:00.000Z',
      retiredAt: null,
      active: true,
    },
    {
      id: 'plan-inactive',
      familyCode: 'plu-annual',
      version: 5,
      name: 'Afiliacion PLU anual',
      description: '',
      price: 75000,
      currency: 'ARS',
      billingFrequency: 'annual',
      collectionMode: 'one_time',
      intervalCount: 1,
      graceDays: 0,
      effectiveFrom: '2026-08-13T00:00:00.000Z',
      retiredAt: '2026-08-14T00:00:00.000Z',
      active: false,
    },
  ],
  events: [
    {
      id: 'event-1',
      slug: 'pitbull-classic',
      title: 'Pitbull Classic',
      registrationPrice: 1,
      currency: 'ARS',
      comboOffer: null,
    },
  ],
}

function renderPricing(props = {}) {
  return render(
    <I18nProvider>
      <PricingSection
        canEdit
        configuration={configuration}
        onCreatePlanVersion={vi.fn(async () => ({}))}
        onRefresh={vi.fn()}
        onSaveComboOffer={vi.fn(async () => ({}))}
        onSetPlanActive={vi.fn(async () => ({}))}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('Tarifas — alta de planes y combo', () => {
  it('abre el formulario de plan nuevo desde el CTA principal', () => {
    renderPricing()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }))
    expect(screen.getByRole('heading', { name: 'Publicar plan' })).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/)).toBeTruthy()
    expect(screen.getByLabelText(/^Precio$/)).toBeTruthy()
  })

  it('publica una versión nueva en vez de editar el monto cobrado', () => {
    renderPricing()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nueva versión' })[0])
    expect(
      screen.getByRole('heading', { name: 'Nueva versión de Afiliacion PLU anual' }),
    ).toBeTruthy()
    expect(screen.getByLabelText(/Familia del plan/).disabled).toBe(true)
  })

  it('resume la oferta combo y abre su edición bajo demanda', () => {
    renderPricing()
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Oferta combo' })).toBeTruthy()
    expect(screen.getByText('Pitbull Classic')).toBeTruthy()
    expect(screen.queryByLabelText('Evento')).toBeNull()

    const disclosure = screen.getByRole('button', { name: /Editar oferta/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(disclosure)

    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Evento')).toBeTruthy()
    expect(screen.getByLabelText('Plan incluido')).toBeTruthy()
    expect(screen.getByLabelText('Precio combo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Guardar oferta' })).toBeTruthy()
  })

  it('conserva el borrador del combo ante una sincronización mientras se edita', () => {
    const view = renderPricing({
      configuration: {
        ...configuration,
        events: [
          {
            ...configuration.events[0],
            comboOffer: { membershipPlanId: 'plan-active', price: 1, active: true },
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /Editar oferta/ }))
    const price = screen.getByLabelText('Precio combo')
    fireEvent.change(price, { target: { value: '999' } })

    // La API entrega objetos nuevos en cada refresh, aun sin cambios para este
    // combo. Esa actualización no debe pisar el trabajo sin guardar.
    view.rerender(
      <I18nProvider>
        <PricingSection
          canEdit
          configuration={{
            ...configuration,
            events: [
              {
                ...configuration.events[0],
                comboOffer: { membershipPlanId: 'plan-active', price: 1, active: true },
              },
            ],
          }}
          onCreatePlanVersion={vi.fn(async () => ({}))}
          onRefresh={vi.fn()}
          onSaveComboOffer={vi.fn(async () => ({}))}
          onSetPlanActive={vi.fn(async () => ({}))}
          onSetPlanRetirement={vi.fn(async () => ({}))}
        />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('Precio combo')).toHaveProperty('value', '999')
  })

  it('separa habilitación de los tres estados de visibilidad del combo', () => {
    renderPricing({
      configuration: {
        ...configuration,
        events: [
          {
            ...configuration.events[0],
            comboOffer: {
              membershipPlanId: 'plan-active',
              price: 1,
              active: true,
              audience: 'code',
              accessCode: 'ONLY-PITBULL',
            },
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /Editar oferta/ }))
    const visibility = screen.getByRole('group', { name: 'Visibilidad comercial' })
    expect(within(visibility).getByRole('radio', { name: /Pública/ })).toBeTruthy()
    expect(within(visibility).getByRole('radio', { name: /Restringida/ }).checked).toBe(true)
    expect(within(visibility).getByRole('radio', { name: /Privada/ })).toBeTruthy()

    fireEvent.click(within(visibility).getByRole('radio', { name: /Privada/ }))
    expect(screen.queryByLabelText('Código de acceso')).toBeNull()
    expect(screen.getByText(/Al guardar como privada/)).toBeTruthy()
  })

  it('expone financiamiento solo para un combo con codigo y lo envia al guardar', async () => {
    const onSaveComboOffer = vi.fn(async () => ({}))
    renderPricing({
      onSaveComboOffer,
      configuration: {
        ...configuration,
        events: [
          {
            ...configuration.events[0],
            comboOffer: {
              membershipPlanId: 'plan-active',
              price: 1,
              active: true,
              audience: 'code',
              accessCode: 'ONLY-PITBULL',
              financed: false,
            },
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /Editar oferta/ }))
    const financing = screen.getByRole('checkbox', {
      name: /Permitir financiamiento con este código/,
    })
    fireEvent.click(financing)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar oferta' }))

    expect(onSaveComboOffer).toHaveBeenCalledWith(
      'pitbull-classic',
      expect.objectContaining({ audience: 'code', financed: true }),
    )

    const visibility = screen.getByRole('group', { name: 'Visibilidad comercial' })
    fireEvent.click(within(visibility).getByRole('radio', { name: /Pública/ }))
    expect(
      screen.queryByRole('checkbox', { name: /Permitir financiamiento con este código/ }),
    ).toBeNull()
  })

  it('explica el recorrido secreto y sólo lista combos restringidos', async () => {
    renderPricing({
      configuration: {
        ...configuration,
        plans: [{ ...configuration.plans[0], price: 75000 }, configuration.plans[1]],
        events: [
          {
            ...configuration.events[0],
            registrationPrice: 75000,
            comboOffer: {
              membershipPlanId: 'plan-active',
              price: 140000,
              active: true,
              audience: 'code',
              accessCode: 'ONLY-PITBULL',
            },
          },
          {
            id: 'event-private',
            slug: 'evento-privado',
            title: 'Evento privado',
            registrationPrice: 75000,
            comboOffer: { price: 130000, active: true, audience: 'private' },
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), { target: { value: 'offer' } })
    expect(screen.getByLabelText(/^Tipo de código/).value).toBe('offer')
    expect(
      screen.getByRole('option', { name: 'Oferta exclusiva · afiliación + inscripción' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Página privada de la oferta' })).toBeTruthy()
    expect(screen.getByLabelText('Aplica a').value).toBe('combo')
    expect(screen.getByLabelText(/Quién accede/).value).toBe('code')
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/Precio de la oferta por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(await screen.findByLabelText(/Inscripción de la oferta/), {
      target: { value: 'event-1' },
    })

    expect(screen.getByRole('heading', { name: 'Página privada de la oferta' })).toBeTruthy()
    expect(screen.getByText('ONLY-PITBULL')).toBeTruthy()
    expect(screen.getAllByText(/Pitbull Classic ·/).length).toBeGreaterThan(0)
    expect(screen.getByText('Mi cuenta · Oferta exclusiva · Procesar pago')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Evento privado/ })).toBeNull()
  })

  it('permite crear un código que aplique a afiliaciones e inscripciones', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.getByRole('heading', { name: 'Nuevo código' })).toBeTruthy()
    expect(screen.queryByText('Todavía no hay códigos cargados.')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'club-25' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'both' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Límite de canjes/ }), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CLUB-25',
        kind: 'percent',
        percentOff: 25,
        fixedPrice: undefined,
        appliesTo: 'both',
        maxRedemptions: 12,
      }),
    )
  })

  it('crea una promo de precio fijo para el combo y no manda el porcentaje', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    // El campo de porcentaje deja lugar al del precio promocional.
    expect(screen.queryByLabelText('Descuento (%)')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText('Aplica a'), { target: { value: 'combo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PITBULL',
        kind: 'fixed_price',
        fixedPrice: 120000,
        percentOff: undefined,
        appliesTo: 'combo',
        // Sin precio manual cargado: transferencia y efectivo cobran lo mismo que
        // Mercado Pago. Es el default y el caso que pidió Administración.
        fixedPriceManual: undefined,
      }),
    )
  })

  it('deja pactar el mismo importe en Mercado Pago y en transferencia', async () => {
    // El precio del canal manual no tiene por qué ser menor: cargar $120.000 en
    // los dos campos tiene que guardarse tal cual, sin que nada lo rechace.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pacto' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por transferencia/), {
      target: { value: '120000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTO',
        kind: 'fixed_price',
        fixedPrice: 120000,
        fixedPriceManual: 120000,
      }),
    )
  })

  it('un precio manual mayor que el de Mercado Pago tambien se guarda', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'caro' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '120000' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por transferencia/), {
      target: { value: '135000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        fixedPrice: 120000,
        fixedPriceManual: 135000,
      }),
    )
  })

  it('el precio promocional por canal no existe en una promo de porcentaje', () => {
    renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.queryByLabelText(/Precio promocional por transferencia/)).toBeNull()

    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    expect(screen.getByLabelText(/Precio promocional por transferencia/)).toBeTruthy()
  })

  it('programa la apertura y rechaza una ventana invertida', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'preventa' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/^Apertura/), { target: { value: '2026-09-10T00:00' } })
    fireEvent.change(screen.getByLabelText(/^Vencimiento/), {
      target: { value: '2026-09-01T00:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(
      screen.getByText('El cierre de la promoción tiene que ser posterior a su apertura.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^Vencimiento/), {
      target: { value: '2026-09-30T00:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PREVENTA',
        startsAt: '2026-09-10T00:00',
        expiresAt: '2026-09-30T00:00',
      }),
    )
  })

  it('convierte la lista de invitados en exclusividad y rechaza un email invalido', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), { target: { value: 'gym' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'ana@plu.ar\nno-es-un-mail' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    expect(screen.getByText('no-es-un-mail no es una dirección de correo válida.')).toBeTruthy()

    // Se aceptan los separadores que trae pegar una columna de planilla, y se
    // normaliza a minúsculas sin repetidos.
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'Ana@PLU.ar, bruno@plu.ar; ana@plu.ar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'GYM',
        invitees: ['ana@plu.ar', 'bruno@plu.ar'],
      }),
    )
  })

  it('crea un código de acceso al combo, sin descuento', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'combo-secreto' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), { target: { value: 'access' } })

    // Ni porcentaje ni precio promocional: un acceso no descuenta nada.
    expect(screen.queryByLabelText('Descuento (%)')).toBeNull()
    expect(screen.queryByLabelText(/Precio promocional por Mercado Pago/)).toBeNull()
    // El alcance se cae solo a combo, el único donde un acceso tiene sentido.
    expect(screen.getByLabelText('Aplica a').value).toBe('combo')
    expect(screen.queryByRole('option', { name: 'Afiliación' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Inscripción' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Afiliación e inscripción' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'COMBO-SECRETO',
        kind: 'access',
        percentOff: undefined,
        fixedPrice: undefined,
        appliesTo: 'combo',
      }),
    )
  })

  it('no ofrece el alcance combinado para una promo de precio fijo', () => {
    renderPricing()

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    expect(screen.getByRole('option', { name: 'Afiliación e inscripción' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    expect(screen.queryByRole('option', { name: 'Afiliación e inscripción' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Combo (afiliación + inscripción)' })).toBeTruthy()
  })

  it('deja elegir qué canales manuales habilita el código', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'solo-efectivo' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    // Mercado Pago ahora se lista y viene marcado: es el default histórico,
    // pero se puede apagar (ver 20260908100000).
    expect(screen.getByRole('checkbox', { name: 'Mercado Pago' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SOLO-EFECTIVO',
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: true,
      }),
    )
  })

  it('financiar un código abre los canales que el atleta puede declarar', async () => {
    // El agujero que reportó Precios: se podía marcar financiamiento con sólo
    // Mercado Pago, y el atleta canjeaba, pagaba con la pasarela —que acredita
    // sola— y nunca delegaba nada. Marcarlo ahora abre transferencia y efectivo.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull-gold' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Permitir delegar el pago/ }))

    expect(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ONLY-PITBULL-GOLD',
        financed: true,
        manualChannels: ['bank_transfer', 'cash_pitbull'],
      }),
    )
  })

  it('quitar el último canal manual apaga el financiamiento en vez de dejarlo inerte', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-delegar' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    const financing = screen.getByRole('checkbox', { name: /Permitir delegar el pago/ })
    fireEvent.click(financing)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))

    expect(financing.checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SIN-DELEGAR', financed: false, manualChannels: [] }),
    )
  })

  it('no habilita ningún canal manual por defecto', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'solo-mp' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SOLO-MP', manualChannels: [], mercadoPagoEnabled: true }),
    )
  })

  it('deja cerrar Mercado Pago para un código pactado en efectivo', async () => {
    // El caso que no se podía cargar: una oferta a un precio que sólo cierra
    // cobrada en efectivo, y que no debe poder pagarse con la pasarela.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pactado-efectivo' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTADO-EFECTIVO',
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: false,
      }),
    )
  })

  it('no guarda un código sin ningún medio de pago', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-medios' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    // El aviso aparece en el mismo fieldset, antes de intentar enviar.
    expect(screen.getByText(/Elegí al menos un medio de pago/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
  })

  it('la fila dice qué es lo único con lo que se puede pagar', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-cash',
            code: 'PACTADO-EFECTIVO',
            percentOff: 10,
            appliesTo: 'membership',
            manualChannels: ['cash_pitbull'],
            mercadoPagoEnabled: false,
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Sólo efectivo')).toBeTruthy()
    expect(screen.queryByText('Habilita efectivo')).toBeNull()
  })

  it('resume en la fila qué canales destraba el código', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-transfer',
            code: 'SOLO-TRANSFER',
            percentOff: 10,
            appliesTo: 'membership',
            manualChannels: ['bank_transfer'],
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Habilita transferencia')).toBeTruthy()
    expect(screen.queryByText('Habilita transferencia y efectivo')).toBeNull()
  })

  it('muestra el importe de la promo en la fila, no un porcentaje', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-pitbull',
            code: 'PITBULL',
            kind: 'fixed_price',
            percentOff: 0,
            fixedPrice: 120000,
            appliesTo: 'combo',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    expect(screen.getByText('Combo (afiliación + inscripción)')).toBeTruthy()
    expect(screen.getByText(/120\.000/)).toBeTruthy()
    expect(screen.queryByText('−0%')).toBeNull()
  })

  it('muestra los canjes restantes y desactiva el control al agotar el cupón', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-first-ten',
            code: 'PRIMEROS-10',
            percentOff: 20,
            appliesTo: 'both',
            maxRedemptions: 10,
            redeemedCount: 10,
            active: false,
          },
        ],
      },
    })

    expect(screen.getByText('0 disponibles')).toBeTruthy()
    expect(screen.getByText('Agotado')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '0 de 10 cupos disponibles' })).toHaveProperty(
      'value',
      0,
    )
    // Agotada queda en "Deshabilitada" y las dos opciones abiertas fuera de
    // alcance: reabrirla sin ampliar el cupo no habilita nada y la RPC la
    // rechaza, así que el panel no ofrece el click.
    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción PRIMEROS-10' })
    expect(within(states).getByRole('radio', { name: 'Deshabilitada' }).checked).toBe(true)
    expect(within(states).getByRole('radio', { name: 'Para todos' }).disabled).toBe(true)
    expect(within(states).getByRole('radio', { name: 'Con código' }).disabled).toBe(true)
    expect(
      screen.getByText(
        'Agotó su cupo y se cerró sola. Ampliá el límite de canjes para volver a habilitarla.',
      ),
    ).toBeTruthy()
  })

  it('cambia la promoción a pública desde la fila', async () => {
    const onSetDiscountCodeState = vi.fn(async () => ({}))
    renderPricing({
      onSetDiscountCodeState,
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-open',
            code: 'VERANO',
            percentOff: 15,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
            audience: 'code',
          },
        ],
      },
    })

    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción VERANO' })
    expect(within(states).getByRole('radio', { name: 'Con código' }).checked).toBe(true)

    fireEvent.click(within(states).getByRole('radio', { name: 'Para todos' }))
    await screen.findByText('Configuración actualizada.')

    expect(onSetDiscountCodeState).toHaveBeenCalledWith('coupon-open', 'public')
  })

  it('marca la promoción que se aplica sola', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-public',
            code: 'TODOS',
            percentOff: 10,
            appliesTo: 'both',
            redeemedCount: 0,
            active: true,
            audience: 'public',
          },
        ],
      },
    })

    expect(screen.getByText('Se aplica sola')).toBeTruthy()
    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción TODOS' })
    expect(within(states).getByRole('radio', { name: 'Para todos' }).checked).toBe(true)
  })

  // El error de cambiar el estado se mostraba dentro del formulario de edición,
  // que en este flujo está cerrado: el rechazo quedaba invisible y el control
  // volvía solo a su lugar sin explicar nada.
  it('muestra en la propia fila el rechazo al cambiar de estado', async () => {
    const onSetDiscountCodeState = vi.fn(async () => ({
      error: 'La promoción agotó su cupo (10 de 10).',
    }))
    renderPricing({
      onSetDiscountCodeState,
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-rejected',
            code: 'RECHAZO',
            percentOff: 15,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
            audience: 'code',
          },
        ],
      },
    })

    const states = screen.getByRole('radiogroup', { name: 'Estado de la promoción RECHAZO' })
    fireEvent.click(within(states).getByRole('radio', { name: 'Deshabilitada' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'La promoción agotó su cupo (10 de 10).',
    )
  })

  it('copia el código y confirma la acción en la misma fila', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-copy',
            code: 'CLUB-25',
            percentOff: 25,
            appliesTo: 'membership',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copiar código CLUB-25' }))

    expect(writeText).toHaveBeenCalledWith('CLUB-25')
    expect(await screen.findByText('Copiado')).toBeTruthy()
  })

  it('presenta el estado vacío de suscripciones y conserva la actualización accesible', () => {
    renderPricing()

    expect(screen.getByText('Todavía no hay suscripciones activas.')).toBeTruthy()
    expect(screen.getByText(/Las afiliaciones recurrentes van a aparecer acá/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })
})
