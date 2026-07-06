export function getFormOptions(t) {
  return {
    sex: [
      ['Masculino', t('formOptions.sex.male')],
      ['Femenino', t('formOptions.sex.female')],
    ],
    division: ['Open', 'Junior', 'Sub-Junior', 'Master I', 'Master II'],
    category: ['Raw', 'Classic Raw', 'Equipped'],
    paymentMethod: [
      ['mercado_pago', t('formOptions.payment.mercadoPago')],
      ['manual_link', t('formOptions.payment.manualLink')],
    ],
  }
}
