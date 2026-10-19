import {useEffect, useRef, useState} from 'react';
import {CreditCard, Wallet} from 'lucide-react';
import {defaultPaymentBudget, paymentEffect, type PaymentAccount, type PaymentBudgetMode} from './lib/paymentBudget';
import './styles/modules/payment-budget.css';

/** Reads the actual form controls so recovered drafts and ordinary inputs use the same rule. */
export default function PaymentBudgetField({
  accounts,
  initial = 'auto',
  disabled = false
}: {
  accounts: PaymentAccount[];
  initial?: PaymentBudgetMode;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({account: '', type: 'expense', mode: initial as string});
  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form) return;
    const sync = () => {
      const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value;
      const next = {
        account: value('account_id') || '',
        type: value('type') || 'expense',
        mode: value('budget_included') || initial
      };
      setState(current =>
        current.account === next.account && current.type === next.type && current.mode === next.mode ? current : next
      );
    };
    const reset = () => queueMicrotask(sync);
    sync();
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.addEventListener('nh:form-restored', sync);
    form.addEventListener('reset', reset);
    return () => {
      form.removeEventListener('input', sync);
      form.removeEventListener('change', sync);
      form.removeEventListener('nh:form-restored', sync);
      form.removeEventListener('reset', reset);
    };
  }, [accounts, initial]);
  const account = accounts.find(a => a.id === state.account);
  const credit = account?.account_class === 'liability';
  return (
    <div ref={root} className={'payment-budget-field ' + (credit ? 'is-credit' : 'is-balance')}>
      {state.type === 'expense' && (
        <label>
          Tratamiento del gasto
          <select name="budget_included" defaultValue={initial} disabled={disabled}>
            <option value="auto">Automático · todo gasto descuenta del presupuesto</option>
            <option value="true">Incluir en el presupuesto</option>
            <option value="false">Excepción · dejar fuera del presupuesto</option>
          </select>
        </label>
      )}
      <PaymentBudgetHint account={account} type={state.type} mode={state.mode} />
      {initial !== 'auto' && (
        <small>Se conserva la clasificación guardada. Elige Automático para recalcularla según la cuenta.</small>
      )}
    </div>
  );
}

export function PaymentBudgetHint({
  account,
  type = 'expense',
  mode = 'auto'
}: {
  account?: PaymentAccount;
  type?: string;
  mode?: string;
}) {
  let included: boolean | null = null,
    error = '';
  try {
    included = mode === 'false' ? false : mode === 'true' ? true : defaultPaymentBudget(account);
  } catch (e) {
    error = (e as Error).message;
  }
  const credit = account?.account_class === 'liability';
  return (
    <div className="payment-budget-effect" role="note" aria-label="Efecto del pago" aria-live="polite">
      {credit ? <CreditCard size={20} aria-hidden="true" /> : <Wallet size={20} aria-hidden="true" />}
      <div>
        <strong>
          {type === 'income'
            ? 'Efecto en la cuenta'
            : credit
              ? 'Crédito · deuda por pagar'
              : account
                ? 'Dinero existente'
                : 'Selecciona de dónde pagas'}
        </strong>
        <p>{error || paymentEffect(account, type, included)}</p>
        {type === 'expense' && !account && included === true && (
          <small>
            Por ahora se incluye en el presupuesto. El límite de la tarjeta nunca se suma a tu dinero disponible.
          </small>
        )}
      </div>
    </div>
  );
}
