import {useEffect, useRef, useState} from 'react';
import {amountsHidden, formatMoney} from '../lib/money';

/**
 * A money amount: tabular digits, a real minus sign, never wrapping between "Q" and the number, and masked when
 * "Ocultar montos" is on. `animate` counts up from the previous value (one short, deliberate moment for the
 * headline figures); it is skipped with reduced motion and while amounts are hidden.
 */
export default function Amount({
  value,
  animate = false,
  signed = false,
  tone,
  className = ''
}: {
  value: number;
  animate?: boolean;
  signed?: boolean;
  tone?: 'income' | 'expense' | 'negative' | 'muted';
  className?: string;
}) {
  // Mount with the real value: a temporary zero can be mistaken for an actual financial result.
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce || amountsHidden()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now(),
      initial = from.current,
      duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration),
        eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round((initial + (value - initial) * eased) * 100) / 100);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);
  const text = formatMoney(shown);
  return (
    <span
      className={'ds-amount' + (tone ? ' ds-amount--' + tone : '') + (className ? ' ' + className : '')}
      aria-label={formatMoney(value)}
    >
      {signed && value > 0 ? '+' : ''}
      {text}
    </span>
  );
}
