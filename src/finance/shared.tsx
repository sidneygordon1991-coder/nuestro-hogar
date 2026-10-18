// Shared Finance helpers (moved from Finance.tsx).
import {useEffect, useId, useRef} from 'react';
import {X} from 'lucide-react';
import {formatMoney} from '../lib/money';
import {usdToQuetzales} from '../lib/currency';
import {isoDate} from '../FinanceParts';

export const entryMoney = formatMoney;

export const monthDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export const monthBounds = (d: Date) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1),
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {start: isoDate(start), end: isoDate(end)};
};

export const monthLabel = (d: Date) => {
  const text = d.toLocaleDateString('es-GT', {month: 'long', year: 'numeric'});
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const LOAD_ERROR = 'No se pudo cargar toda la información financiera.';

export function entryAmount(f: FormData, householdRate: number) {
  const amount = Number(f.get('amount'));
  if (String(f.get('currency') || 'GTQ') !== 'USD')
    return {
      amount,
      original: {
        original_currency: null as string | null,
        original_amount: null as number | null,
        exchange_rate: null as number | null
      }
    };
  const usd = Math.round(amount * 100) / 100,
    rateText = String(f.get('exchange_rate') || '')
      .trim()
      .replace(',', '.'),
    rate = Math.round((rateText ? Number(rateText) : householdRate) * 10000) / 10000;
  if (!Number.isFinite(usd) || usd <= 0 || usd > 999999999)
    throw new Error('Escribe un monto en dólares mayor que cero.');
  if (!Number.isFinite(rate) || rate < 1 || rate > 100)
    throw new Error('El tipo de cambio debe estar entre Q 1 y Q 100 por dólar.');
  return {
    amount: usdToQuetzales(usd, rate),
    original: {
      original_currency: 'USD' as string | null,
      original_amount: usd as number | null,
      exchange_rate: rate as number | null
    }
  };
}

export function Modal({title, close, children}: {title: string; close: () => void; children: any}) {
  const titleId = useId(),
    dialog = useRef<HTMLDivElement>(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    if (dialog.current && !dialog.current.contains(document.activeElement)) dialog.current.focus({preventScroll: true});
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="finance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialog}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" aria-label={'Cerrar: ' + title} onClick={close}>
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
