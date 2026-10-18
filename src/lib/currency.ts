import {amountsHidden, formatMoney} from './money';

/** Fallback rate when a household has not saved its own (quetzales per US dollar). */
export const DEFAULT_USD_RATE = 7.75;
export type OriginalAmount = {
  original_currency?: string | null;
  original_amount?: number | string | null;
  exchange_rate?: number | string | null;
};

export function usdRate(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : DEFAULT_USD_RATE;
}
/** Every movement is stored in quetzales; a dollar entry converts once, rounded to cents. */
export function usdToQuetzales(usd: number, rate: number) {
  if (!Number.isFinite(usd) || !Number.isFinite(rate)) return Number.NaN;
  const sign = usd < 0 ? -1 : 1,
    amount = BigInt(Math.round(Math.abs(usd) * 100)),
    units = BigInt(Math.round(rate * 10000));
  return (sign * Number((amount * units + 5000n) / 10000n)) / 100;
}
const usd = new Intl.NumberFormat('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2});
export function formatUsd(value: number) {
  if (amountsHidden()) return 'US$\u00a0•••••';
  const abs = Math.abs(Math.round(value * 100)) / 100;
  return (
    (value < 0 && abs > 0 ? '−' : '') +
    'US$ ' +
    (Number.isInteger(abs)
      ? usd.format(abs)
      : abs.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}))
  );
}
/** "US$ 50 · Q 387.50" for dollar entries, "Q 387.50" otherwise. */
export function formatEntryAmount(amount: number, entry: OriginalAmount = {}) {
  return entry.original_currency === 'USD' && Number(entry.original_amount) > 0
    ? formatUsd(Number(entry.original_amount)) + ' · ' + formatMoney(amount)
    : formatMoney(amount);
}

export type AccountCurrency = 'GTQ' | 'USD';
type UsdAccount = {
  id: string;
  account_class: string;
  opening_balance: number | string;
  opening_balance_usd?: number | string | null;
};
type UsdMovement = OriginalAmount & {
  account_id: string | null;
  type: string;
  amount: number | string;
  transaction_date: string;
};
type UsdTransfer = {from_account_id: string; to_account_id: string; amount: number | string; transfer_date: string};

/**
 * Dollar balance of an account; estimated when native amounts are unavailable. Every amount is stored in quetzales; dollar entries keep the dollars
 * they were, and quetzal entries (and transfers) are estimated at the saved rate. The quetzal value of the account
 * at today's rate can differ from its quetzal book balance: that difference is the exchange gain or loss.
 */
export function usdAccountBalance(
  account: UsdAccount,
  movements: UsdMovement[],
  transfers: UsdTransfer[],
  rate: number,
  cutoff: string
) {
  const sign = account.account_class === 'liability' ? -1 : 1;
  const toUsdCents = (q: number | string) => Math.round((Number(q) * 100) / rate);
  let cents =
    account.opening_balance_usd != null && account.opening_balance_usd !== ''
      ? Math.round(Number(account.opening_balance_usd) * 100)
      : toUsdCents(account.opening_balance);
  let estimated = account.opening_balance_usd == null || account.opening_balance_usd === '';
  for (const t of movements) {
    if (t.account_id !== account.id || t.transaction_date > cutoff || !['income', 'expense'].includes(t.type)) continue;
    const usd =
      t.original_currency === 'USD' && Number(t.original_amount) > 0
        ? Math.round(Number(t.original_amount) * 100)
        : toUsdCents(t.amount);
    if (!(t.original_currency === 'USD' && Number(t.original_amount) > 0)) estimated = true;
    cents += usd * sign * (t.type === 'income' ? 1 : -1);
  }
  for (const t of transfers) {
    if (t.transfer_date > cutoff) continue;
    if (t.to_account_id === account.id || t.from_account_id === account.id) estimated = true;
    if (t.to_account_id === account.id) cents += toUsdCents(t.amount) * sign;
    if (t.from_account_id === account.id) cents -= toUsdCents(t.amount) * sign;
  }
  return {usd: cents / 100, quetzales: usdToQuetzales(cents / 100, rate), estimated};
}
