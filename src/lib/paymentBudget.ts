/** A purchase uses either existing money or credit. This default is saved once, never inferred for historical rows. */
export type PaymentAccount = {id: string; name: string; account_type?: string; account_class?: string};
export type PaymentBudgetMode = 'auto' | 'true' | 'false';
export function defaultPaymentBudget(account?: PaymentAccount) {
  if (!account) return true;
  if (!account.account_type || !['asset', 'liability'].includes(account.account_class || ''))
    throw new Error('No pudimos verificar el tipo de cuenta. Recarga las cuentas antes de usar la regla automática.');
  return !(account.account_class === 'asset' && ['cash', 'checking', 'savings'].includes(account.account_type));
}
export function resolvePaymentBudget(mode: string, account?: PaymentAccount) {
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  if (mode !== 'auto') throw new Error('Selecciona cómo afecta este gasto al presupuesto.');
  return defaultPaymentBudget(account);
}
export function paymentBudgetIncluded(form: FormData, accounts: PaymentAccount[]) {
  if (form.get('type') !== 'expense') return true;
  const mode = String(form.get('budget_included') || 'auto');
  const id = String(form.get('account_id') || '');
  const account = accounts.find(a => a.id === id);
  if (id && !account) throw new Error('La cuenta seleccionada no está disponible. Recarga las cuentas.');
  return resolvePaymentBudget(mode, account);
}
export function paymentEffect(account: PaymentAccount | undefined, type: string, included: boolean | null) {
  if (!account)
    return 'Sin cuenta asignada: no se ajusta ningún saldo individual. Selecciona una cuenta de efectivo, débito o ahorro para usar dinero existente.';
  if (!['asset', 'liability'].includes(account.account_class || ''))
    return 'El tipo de cuenta no está verificado; recarga las cuentas para comprobar el efecto en su saldo.';
  if (account.account_class === 'liability') {
    if (type === 'income')
      return 'Un ingreso aquí reduce la deuda. Si estás abonando desde tu banco o efectivo, usa Transferir / pagar deuda; ese pago no es un ingreso nuevo.';
    return `Aumenta la deuda de ${account.name}; tu dinero disponible no sale al comprar. ${included === false ? 'Este gasto queda fuera del presupuesto.' : 'Consume el presupuesto de la quincena de la compra.'} Al pagar la tarjeta usa una transferencia para no duplicar el gasto.`;
  }
  if (type === 'income') return `El ingreso aumenta el saldo de ${account.name}.`;
  return `Descuenta de ${account.name}. ${included === null ? 'Verifica el tipo de cuenta antes de guardar.' : included ? 'También consume el presupuesto por tu elección.' : 'Usa saldo existente y deja el presupuesto sin consumir.'}`;
}
