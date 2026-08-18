function normalizeOptionText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isActiveSelector(element) {
  if (!element) return false
  if (
    element.getAttribute('aria-checked') === 'true' ||
    element.getAttribute('aria-selected') === 'true'
  ) {
    return true
  }
  if ([...element.classList].some((name) => name === 'active' || name.startsWith('active-'))) {
    return true
  }
  return Boolean(element.querySelector?.('input:checked'))
}

export function readActivePaymentSelectorText(root) {
  if (!root?.querySelectorAll) return ''
  const selectors = [...root.querySelectorAll('[class*="mp-checkout-bricks__selector"]')]
  const active = selectors.find(isActiveSelector) ?? selectors[0]
  return (active?.textContent || '').replace(/\s+/g, ' ').trim()
}

export function resolveMercadoPagoSubmitKey(optionText) {
  const text = normalizeOptionText(optionText)
  if (!text) return 'payments.submitPay'
  if (/cr[eé]dito de mercado pago|mercado pago credit/.test(text))
    return 'payments.submitPayMpCredit'
  if (/tarjeta de d[eé]bito|debit card/.test(text)) return 'payments.submitPayDebit'
  if (/tarjeta de cr[eé]dito|credit card/.test(text)) return 'payments.submitPayCredit'
  if (/rapipago|pago f[aá]cil|ticket|efectivo|cash/.test(text)) return 'payments.submitPayTicket'
  if (/mercado pago/.test(text)) return 'payments.submitContinueMp'
  return 'payments.submitPay'
}

function setControlLabel(button, label) {
  if (button.childElementCount === 0) {
    button.textContent = label
    return true
  }

  const textNode = [...button.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  )
  if (textNode) {
    textNode.textContent = ` ${label} `
    return true
  }

  const span = [...button.querySelectorAll('span')].find((node) => node.childElementCount === 0)
  if (span) {
    span.textContent = label
    return true
  }

  return false
}

export function applyMercadoPagoSubmitLabel(root, label) {
  const button = root?.querySelector?.(
    '[data-testid="payment-form"] button[type="submit"], [data-testid="submit-wrapper"] button[type="submit"]',
  )
  if (!button || button.disabled) return false

  const current = (button.textContent || '').replace(/\s+/g, ' ').trim()
  if (current === label) return false
  if (!setControlLabel(button, label)) return false
  button.setAttribute('aria-label', label)
  return true
}

export function syncMercadoPagoSubmitLabel(root, translate) {
  const key = resolveMercadoPagoSubmitKey(readActivePaymentSelectorText(root))
  return applyMercadoPagoSubmitLabel(root, translate(key))
}
