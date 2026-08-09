export function findRegistrationPayment(payments, registration) {
  if (registration.paymentOrderId) {
    const exact = payments.find((item) => item.id === registration.paymentOrderId)
    if (exact) return exact
  }
  return payments.find((item) =>
    item.athleteId === registration.athleteId &&
    (registration.event ? item.event === registration.event : true))
}
