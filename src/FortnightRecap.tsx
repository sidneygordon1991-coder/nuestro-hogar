import {useEffect, useMemo, useRef, useState} from 'react';
import {Download, PartyPopper, Share2, X} from 'lucide-react';
import {fetchAllRows, pagedResult} from './lib/paging';
import {supabase} from './lib/supabase';
import {formatMoney as money} from './lib/money';
import {halfOf} from './lib/financePeriods';
import {fortnightRecap, periodTotals, recapText, type PeriodTotals} from './lib/recap';
import type {CashFlowSource} from './lib/cashFlow';

const previousMonthHalf = (month: string) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1),
    y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, '0'),
    last = new Date(y, d.getMonth() + 1, 0).getDate();
  return {start: `${y}-${m}-16`, end: `${y}-${m}-${last}`};
};

/** While the first fortnight is in progress, the previous one is read only for the same number of days. */
function sameDays(start: string, end: string, today: string) {
  const day = Number(today.slice(8));
  if (day >= 15) return end;
  const d = new Date(start + 'T12:00');
  d.setDate(d.getDate() + day - 1);
  const iso =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return iso < end ? iso : end;
}

/** Shareable summary of the fortnight (text via the share sheet, or an image to save). */
export default function FortnightRecap({
  source,
  householdId,
  householdName,
  goal,
  period,
  onClose
}: {
  source: CashFlowSource;
  householdId: string;
  householdName: string;
  goal?: {name: string; progress: number} | null;
  period?: 'first' | 'second';
  onClose: () => void;
}) {
  const half = period || (halfOf(source.today) as 'first' | 'second');
  const [previous, setPrevious] = useState<PeriodTotals | null | undefined>(half === 'second' ? null : undefined),
    [status, setStatus] = useState('');
  const dialog = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (half === 'second') return;
    let live = true;
    const range = previousMonthHalf(source.month);
    Promise.all([
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('transactions')
            .select('id,type,amount,transaction_date,category_id,paid_by')
            .eq('household_id', householdId)
            .gte('transaction_date', range.start)
            .lte('transaction_date', range.end)
            .order('id')
            .range(from, to)
        )
      ),
      pagedResult(() =>
        fetchAllRows((from, to) =>
          supabase
            .from('goal_contributions')
            .select('amount,contribution_date')
            .eq('household_id', householdId)
            .gte('contribution_date', range.start)
            .lte('contribution_date', range.end)
            .order('id')
            .range(from, to)
        )
      )
    ]).then(([t, g]) => {
      if (!live) return;
      setPrevious(
        t.error || g.error
          ? null
          : periodTotals(
              (t.data || []) as any[],
              (g.data || []) as any[],
              range.start,
              sameDays(range.start, range.end, source.today),
              source.today,
              new Set(
                (source.categories as {id: string; budget_group?: string}[])
                  .filter(c => c.budget_group === 'saving')
                  .map(c => c.id)
              )
            )
      );
    });
    return () => {
      live = false;
    };
  }, [half, householdId, source.month, source.today]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      before?.focus?.();
    };
  }, []);
  const recap = useMemo(
    () => (previous === undefined ? null : fortnightRecap(source, previous, half)),
    [source, previous, half]
  );
  const highlights = recap
    ? [...recap.highlights, ...(goal ? [goal.name + ' al ' + Math.floor(goal.progress) + '%'] : [])]
    : [];
  async function share() {
    if (!recap) return;
    const text = recapText({...recap, highlights}, householdName);
    try {
      if (navigator.share) {
        await navigator.share({title: recap.title, text});
        setStatus('');
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus('Resumen copiado. Pégalo donde quieras compartirlo.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setStatus('No pudimos compartir. Usa "Guardar imagen".');
    }
  }
  function saveImage() {
    if (!recap) return;
    const css = getComputedStyle(dialog.current || document.documentElement),
      v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const c = canvas.getContext('2d');
    if (!c) return;
    const g = c.createLinearGradient(0, 0, 1080, 1350);
    g.addColorStop(0, v('--nh-hero-start', '#0b3f38'));
    g.addColorStop(1, v('--nh-hero-end', '#135a4f'));
    c.fillStyle = g;
    c.fillRect(0, 0, 1080, 1350);
    const ink = v('--nh-hero-text', '#ffffff');
    c.fillStyle = ink;
    c.font = '600 44px system-ui,sans-serif';
    c.fillText(householdName, 80, 140);
    c.font = '700 64px system-ui,sans-serif';
    wrap(c, recap.title, 80, 250, 920, 76);
    c.font = '500 40px system-ui,sans-serif';
    [
      ['Ingresos', recap.income],
      ['Gastos', recap.expense],
      ['Ahorro', recap.saving]
    ].forEach(([label, value], i) => {
      c.globalAlpha = 0.8;
      c.fillText(String(label), 80, 470 + i * 120);
      c.globalAlpha = 1;
      c.font = '700 56px system-ui,sans-serif';
      c.fillText(money(Number(value)), 460, 470 + i * 120);
      c.font = '500 40px system-ui,sans-serif';
    });
    c.font = '500 38px system-ui,sans-serif';
    let y = 900;
    for (const h of highlights.slice(0, 5)) {
      y = wrap(c, '• ' + h, 80, y, 920, 52) + 18;
    }
    c.globalAlpha = 0.75;
    c.font = '500 32px system-ui,sans-serif';
    c.fillText('Nuestro Hogar', 80, 1270);
    c.globalAlpha = 1;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'resumen-quincena-' + recap.start + '.png';
    a.click();
    setStatus('Imagen guardada.');
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="finance-modal recap-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recap-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Resumen</p>
            <h3 id="recap-title">{recap?.title || 'Tu quincena'}</h3>
          </div>
          <button type="button" aria-label="Cerrar resumen" onClick={onClose}>
            <X />
          </button>
        </div>
        {!recap ? (
          <p className="home-caption" role="status">
            Preparando tu resumen…
          </p>
        ) : (
          <>
            <div className="recap-card">
              <span className="recap-icon" aria-hidden="true">
                <PartyPopper />
              </span>
              <div className="recap-stats">
                <div>
                  <small>Ingresos</small>
                  <strong>{money(recap.income)}</strong>
                </div>
                <div>
                  <small>Gastos</small>
                  <strong>{money(recap.expense)}</strong>
                </div>
                <div>
                  <small>Ahorro</small>
                  <strong>{money(recap.saving)}</strong>
                </div>
              </div>
              <ul>
                {highlights.map(h => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {previous === null && half === 'first' && (
                <p className="recap-note">Sin datos de la quincena anterior para comparar.</p>
              )}
            </div>
            <div className="recap-actions">
              <button type="button" className="finance-primary" onClick={share}>
                <Share2 size={17} aria-hidden="true" /> Compartir
              </button>
              <button type="button" className="recap-secondary" onClick={saveImage}>
                <Download size={17} aria-hidden="true" /> Guardar imagen
              </button>
            </div>
            {status && (
              <p className="home-caption" role="status">
                {status}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  let row = '';
  for (const word of text.split(' ')) {
    const test = row ? row + ' ' + word : word;
    if (c.measureText(test).width > max && row) {
      c.fillText(row, x, y);
      row = word;
      y += line;
    } else row = test;
  }
  if (row) c.fillText(row, x, y);
  return y + line;
}
