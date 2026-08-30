import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    // Límite de canjes vive detrás de "Más opciones": casi ningún código lo
    // toca, así que nace cerrado.
    fireEvent.click(screen.getByText(/Más opciones/))
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

  // Precios de catálogo reales: el combo se valida contra lo que ese atleta
  // pagaría sin el código (75.000 + 45.000), que es el mismo techo que aplica
  // staff_upsert_discount_code.
  const comboConfiguration = {
    ...configuration,
    plans: configuration.plans.map((plan) =>
      plan.id === 'plan-active' ? { ...plan, price: 75000 } : plan,
    ),
    events: configuration.events.map((event) => ({ ...event, registrationPrice: 45000 })),
  }

  it('crea un combo con su afiliación e inscripción, y no manda el porcentaje', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode, configuration: comboConfiguration })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pitbull' },
    })
    // El combo es un tipo, no un alcance escondido: elegirlo acá arrastra las
    // condiciones que necesita en vez de dejarlas a cargo del operador.
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'combo' },
    })
    // El campo de porcentaje deja lugar al del precio promocional, y el
    // selector de alcance desaparece: el tipo ya lo decidió.
    expect(screen.queryByLabelText('Descuento (%)')).toBeNull()
    expect(screen.queryByLabelText('Aplica a')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '100000' },
    })
    // Con una sola afiliación de pago único vigente el panel la resuelve solo
    // y lo dice, en vez de pedir una elección que no existe.
    expect(screen.getByRole('option', { name: 'Automática — Afiliacion PLU anual' })).toBeTruthy()
    // Sin inscripción el combo no se puede canjear: el aviso lo dice antes de
    // dejar guardar.
    expect(
      screen.getByText(
        'Elegí a qué inscripción aplica el combo: el precio y el canje se resuelven contra ese torneo.',
      ),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Inscripción que empaqueta/), {
      target: { value: 'event-1' },
    })
    // Y con todo cargado, el ahorro real contra comprar por separado.
    // El separador de miles y el símbolo los pone Intl: se matchea el número.
    expect(screen.getByText(/Ahorra .*20\.000 \(17%\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PITBULL',
        kind: 'fixed_price',
        fixedPrice: 100000,
        percentOff: undefined,
        appliesTo: 'combo',
        eventId: 'event-1',
        // El séptimo dato del paquete: qué afiliación se empaqueta
        // (20260918100000).
        membershipPlanId: 'plan-active',
        // Sin precio manual cargado: transferencia y efectivo cobran lo mismo que
        // Mercado Pago. Es el default y el caso que pidió Administración.
        fixedPriceManual: undefined,
      }),
    )
  })

  // El agujero que reportó Administración: el formulario dejaba guardar un
  // combo que después el canje rechazaba, y el aviso pedía reabrir un objeto
  // que ninguna pantalla podía crear (se retiró en 20260914100000).
  it('no deja guardar un combo que cobra igual o más que comprar por separado', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode, configuration: comboConfiguration })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pitbull' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'combo' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '130000' },
    })
    fireEvent.change(screen.getByLabelText(/Inscripción que empaqueta/), {
      target: { value: 'event-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
    // Dos veces: el aviso del campo y el error del formulario, que es el mismo
    // patrón que usa el bloque de canales.
    expect(
      screen.getAllByText(
        'El precio del combo tiene que ser menor a lo que cuesta comprar afiliación e inscripción por separado.',
      ),
    ).toHaveLength(2)
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

  it('conserva $85.000 exactos en un código fijo sólo por transferencia o efectivo', async () => {
    // Regresión del código que terminó persistido en $84.999. Cerrar Mercado
    // Pago traslada el importe al campo manual; ni ese traslado ni el submit
    // pueden restar el peso que la base usa como guarda contra órdenes gratis.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'fijo-85' },
    })
    fireEvent.change(screen.getByLabelText(/^Tipo de código/), {
      target: { value: 'fixed_price' },
    })
    fireEvent.change(screen.getByLabelText(/Precio promocional por Mercado Pago/), {
      target: { value: '85000' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))

    expect(screen.getByLabelText(/Precio promocional por transferencia/).value).toBe('85000')
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FIJO-85',
        kind: 'fixed_price',
        fixedPrice: 85000,
        fixedPriceManual: 85000,
        mercadoPagoEnabled: false,
        manualChannels: ['bank_transfer', 'cash_pitbull'],
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
    // Apertura y vencimiento viven detrás de "Más opciones".
    fireEvent.click(screen.getByText(/Más opciones/))
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

    // Un solo invitado conserva el código tipeado: la exclusividad es nominal,
    // no cambia el material que se reparte.
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'Ana@PLU.ar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GYM', invitees: ['ana@plu.ar'] }),
    )
  })

  it('con varios invitados genera un código por persona, con el prefijo elegido', async () => {
    // Se aceptan los separadores que trae pegar una columna de planilla, y se
    // normaliza a minúsculas sin repetidos. Con más de uno el código no se
    // tipea: cada invitado recibe el suyo, así que la exclusividad es real y no
    // una lista compartiendo una sola llave.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Exclusiva para/), {
      target: { value: 'Ana@PLU.ar, bruno@plu.ar; ana@plu.ar' },
    })

    // El campo de código deja lugar al prefijo, y la pantalla dice cuántos sale.
    expect(screen.queryByRole('textbox', { name: /^Código/ })).toBeNull()
    fireEvent.change(screen.getByLabelText(/Prefijo/), { target: { value: 'club' } })
    expect(screen.getByText(/Se generan 2 códigos individuales/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))

    await waitFor(() => expect(onUpsertDiscountCode).toHaveBeenCalledTimes(2))
    const [first, second] = onUpsertDiscountCode.mock.calls.map(([payload]) => payload)
    expect(first.invitees).toEqual(['ana@plu.ar'])
    expect(second.invitees).toEqual(['bruno@plu.ar'])
    for (const payload of [first, second]) {
      // Dos bloques de cuatro, sin caracteres que se confundan al dictarlo, y
      // sorteados con `crypto`: el código ES el secreto de la oferta.
      expect(payload.code).toMatch(/^CLUB-[ABCDEFGHJKMNPQRTUVWXY2346789]{4}-[ABCDEFGHJKMNPQRTUVWXY2346789]{4}$/)
    }
    expect(first.code).not.toBe(second.code)
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

  it('Mercado Pago es el punto de partida: nada más tildado por defecto', async () => {
    // Un casillero por medio de pago, no un selector de "modo" que hay que leer
    // antes de saber qué destapa. Financiar sólo aparece con un canal manual
    // encendido: sin ninguno no hay nada que declarar.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'solo-mercado-pago' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })

    expect(screen.getByRole('checkbox', { name: 'Mercado Pago' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }).checked).toBe(false)
    expect(screen.queryByRole('checkbox', { name: /Habilita al avisar el pago/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SOLO-MERCADO-PAGO',
        manualChannels: [],
        mercadoPagoEnabled: true,
        financed: false,
      }),
    )
  })

  it('cobrar sí o sí a mano: destildar Mercado Pago y tildar los dos canales', async () => {
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pactado-a-mano' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PACTADO-A-MANO',
        manualChannels: ['bank_transfer', 'cash_pitbull'],
        mercadoPagoEnabled: false,
        financed: false,
      }),
    )
  })

  it('financiar aparece recién con un canal manual encendido', async () => {
    // El agujero que reportó Precios: se podía marcar financiamiento con sólo
    // Mercado Pago, y el atleta canjeaba, pagaba con la pasarela —que acredita
    // sola— y nunca delegaba nada. El casillero de financiar ni se ofrece hasta
    // que hay un canal manual que declarar.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'only-pitbull-gold' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    expect(screen.queryByRole('checkbox', { name: /Habilita al avisar el pago/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Habilita al avisar el pago/ }))
    // Y lo que hace queda dicho en el formulario, no en un tooltip.
    expect(screen.getByText(/queda habilitado en afiliación e inscripción/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ONLY-PITBULL-GOLD',
        financed: true,
        manualChannels: ['bank_transfer'],
      }),
    )
  })

  it('financiado sin canal manual no se guarda: el fieldset avisa y bloquea el envío', async () => {
    // Antes un selector de "modo" volvía inalcanzable esta combinación; con
    // casilleros directos vuelve a ser alcanzable, así que el aviso —y el
    // bloqueo al enviar— hacen el trabajo que antes hacía el selector.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-delegar' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Habilita al avisar el pago/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transferencia bancaria' }))
    expect(
      screen.getByText(/Para delegar el pago hace falta transferencia o efectivo/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
  })

  it('un código pactado a mano puede además aceptar la pasarela', async () => {
    // Es la excepción, no el punto de partida, y con casilleros directos es un
    // sólo click extra en vez de cambiar de selector y volver a tildar todo.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'como-quiera' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'COMO-QUIERA',
        manualChannels: ['cash_pitbull'],
        mercadoPagoEnabled: true,
      }),
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

  it('sólo en efectivo: se estrecha el canal sin tocar la pasarela', async () => {
    // El caso que no se podía cargar sin armar la matriz a mano: una oferta que
    // sólo cierra cobrada en efectivo y que no debe poder pagarse online.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'pactado-efectivo' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Efectivo en Pitbull' }))
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
    // El único callejón que queda alcanzable: los tres casilleros destildados.
    // Se avisa en el mismo fieldset y se bloquea al enviar.
    const onUpsertDiscountCode = vi.fn(async () => ({}))
    renderPricing({ onUpsertDiscountCode })

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Código/ }), {
      target: { value: 'sin-medios' },
    })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mercado Pago' }))
    expect(screen.getByText(/Elegí al menos un medio de pago/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Publicar código' }))
    expect(onUpsertDiscountCode).not.toHaveBeenCalled()
  })

  it('"Más opciones" nace cerrado en un código nuevo', () => {
    // Límite de canjes, ventana y descripción son los campos que casi ningún
    // código toca: un cupón nuevo no debería obligar a mirarlos.
    renderPricing()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo código' }))

    const advanced = screen.getByText(/Más opciones/).closest('details')
    expect(advanced.open).toBe(false)
  })

  it('"Más opciones" nace abierto al editar un código que ya tiene vencimiento', () => {
    // Nada de lo que el operador ya cargó puede quedar oculto al reabrir el
    // código para editarlo.
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [
          {
            id: 'coupon-with-window',
            code: 'PREVENTA-2026',
            percentOff: 15,
            appliesTo: 'membership',
            expiresAt: '2026-12-31T23:59:00.000Z',
            redeemedCount: 0,
            active: true,
          },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const advanced = screen.getByText(/Más opciones/).closest('details')
    expect(advanced.open).toBe(true)
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

/**
 * Plazo de pago del financiamiento en el panel (20260922100000).
 *
 * El servidor devuelve `financingTermDays` desde esa migración, pero
 * `mapDiscountCode` lo descartaba: `openCodeForm` leía `source.financingTermDays
 * ?? 7`, es decir SIEMPRE 7, así que abrir para editar un código de 30 días
 * mostraba 7 — y guardarlo le reescribía el plazo sin que nadie lo hubiera
 * tocado. Estos tests fijan que el plazo se lea, se muestre y se devuelva.
 */
describe('Tarifas — plazo del financiamiento', () => {
  const codigoFinanciado = {
    id: 'coupon-financiado',
    code: 'COMBO-30',
    kind: 'fixed_price',
    fixedPrice: 120000,
    appliesTo: 'combo',
    audience: 'code',
    redeemedCount: 0,
    active: true,
    manualChannels: ['bank_transfer'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 30,
  }

  it('el listado dice el plazo, no sólo que el pago se puede delegar', () => {
    renderPricing({ configuration: { ...configuration, discountCodes: [codigoFinanciado] } })

    // Es el dato que mide el riesgo de la promo: con treinta códigos en pantalla
    // no se puede abrir el formulario de cada uno para averiguarlo.
    expect(screen.getByText('Pago delegable · 30 días')).toBeTruthy()
  })

  it('editar un código financiado abre el formulario con SU plazo', async () => {
    renderPricing({ configuration: { ...configuration, discountCodes: [codigoFinanciado] } })

    // El listado tiene un solo código, así que 'Editar' es inequívoco.
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    const term = await screen.findByLabelText(/Plazo para pagar/i)
    expect(term.value).toBe('30')
  })

  it('un plazo de un día se dice en singular', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [{ ...codigoFinanciado, financingTermDays: 1 }],
      },
    })

    expect(screen.getByText('Pago delegable · 1 día')).toBeTruthy()
  })

  it('un código que no financia no anuncia ningún plazo', () => {
    renderPricing({
      configuration: {
        ...configuration,
        discountCodes: [{ ...codigoFinanciado, financed: false, financingTermDays: null }],
      },
    })

    expect(screen.queryByText(/Pago delegable/)).toBeNull()
  })
})

describe('Tarifas — precio de inscripción por torneo', () => {
  const eventoConPrecio = {
    id: 'event-1',
    slug: 'pitbull-classic',
    title: 'Pitbull Classic',
    startsAt: '2026-11-07T12:00:00.000Z',
    registrationPrice: 45000,
    registrationManualPrice: 42000,
    scheduledPrice: null,
    scheduledManualPrice: null,
    priceEffectiveAt: null,
    currency: 'ARS',
    status: 'inscripcion_abierta',
    comboOffer: null,
  }

  it('cambia el precio en el momento: precio, precio manual y sin fecha', async () => {
    const onSetEventRegistrationPrice = vi.fn(async () => ({ event: {} }))
    renderPricing({
      onSetEventRegistrationPrice,
      configuration: { ...configuration, events: [eventoConPrecio] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar precio de Pitbull Classic' }))
    const form = screen.getByRole('form', { name: 'Cambiar precio de Pitbull Classic' })
    const inputs = within(form)
    fireEvent.change(inputs.getByLabelText('Precio'), { target: { value: '52000' } })
    fireEvent.change(inputs.getByLabelText('Precio por transferencia/efectivo'), {
      target: { value: '50000' },
    })
    fireEvent.click(inputs.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSetEventRegistrationPrice).toHaveBeenCalledTimes(1))
    expect(onSetEventRegistrationPrice).toHaveBeenCalledWith('pitbull-classic', {
      price: 52000,
      manualPrice: 50000,
      effectiveAt: '',
    })
    expect(await screen.findByText('Configuración actualizada.')).toBeTruthy()
  })

  it('con fecha futura el cambio viaja programado', async () => {
    const onSetEventRegistrationPrice = vi.fn(async () => ({ event: {} }))
    renderPricing({
      onSetEventRegistrationPrice,
      configuration: { ...configuration, events: [eventoConPrecio] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar precio de Pitbull Classic' }))
    const form = screen.getByRole('form', { name: 'Cambiar precio de Pitbull Classic' })
    fireEvent.change(within(form).getByLabelText('Precio'), { target: { value: '60000' } })
    fireEvent.change(within(form).getByLabelText('Rige desde'), {
      target: { value: '2026-09-01T00:00' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(onSetEventRegistrationPrice).toHaveBeenCalledWith('pitbull-classic', {
        price: 60000,
        manualPrice: 42000,
        effectiveAt: '2026-09-01T00:00',
      }),
    )
  })

  it('un cambio pendiente se anuncia en la fila y se puede cancelar', async () => {
    const onClearEventPriceSchedule = vi.fn(async () => ({ event: {} }))
    renderPricing({
      onClearEventPriceSchedule,
      configuration: {
        ...configuration,
        events: [
          {
            ...eventoConPrecio,
            scheduledPrice: 60000,
            scheduledManualPrice: 58000,
            priceEffectiveAt: '2026-09-01T03:00:00.000Z',
          },
        ],
      },
    })

    // El estado se lee de la fila: badge de programado y el término completo.
    expect(screen.getByText('Programado')).toBeTruthy()
    expect(screen.getByText(/Desde .*: .*60\.000.*manual.*58\.000/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancelar el cambio de precio programado de Pitbull Classic',
      }),
    )
    await waitFor(() => expect(onClearEventPriceSchedule).toHaveBeenCalledWith('pitbull-classic'))
  })

  it('un torneo finalizado no se tarifa', () => {
    renderPricing({
      configuration: {
        ...configuration,
        events: [{ ...eventoConPrecio, status: 'finalizado' }],
      },
    })
    expect(screen.getByText('No hay torneos con inscripción para tarifar.')).toBeTruthy()
  })

  it('el cambio rápido de un plan publica una versión con las mismas condiciones', async () => {
    const onCreatePlanVersion = vi.fn(async () => ({}))
    renderPricing({ onCreatePlanVersion })

    // Dos planes en el fixture: se apunta por aria-label a la versión activa.
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Cambiar precio de Afiliacion PLU anual' })[0],
    )
    const form = screen.getByRole('form', { name: 'Cambiar precio de Afiliacion PLU anual' })
    fireEvent.change(within(form).getByLabelText('Precio'), { target: { value: '95000' } })
    fireEvent.change(within(form).getByLabelText('Rige desde'), {
      target: { value: '2026-09-01T00:00' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onCreatePlanVersion).toHaveBeenCalledTimes(1))
    const payload = onCreatePlanVersion.mock.calls[0][0]
    // Lo que cambia…
    expect(payload.price).toBe(95000)
    expect(payload.effectiveFrom).toBe('2026-09-01T00:00')
    // …y lo que no puede cambiar: viaja igual desde la versión de origen.
    expect(payload.sourcePlanId).toBe('plan-active')
    expect(payload.familyCode).toBe('plu-annual')
    expect(payload.billingFrequency).toBe('annual')
    expect(payload.collectionMode).toBe('one_time')
  })
})
