import {useEffect, useRef} from 'react';
import {ChevronDown} from 'lucide-react';
import ModuleIcon from './ModuleIcon';
import type {FinanceSection} from './lib/financeNavigation';
const main = [
  ['summary', 'Resumen'],
  ['fortnight', 'Quincenas'],
  ['income', 'Ingresos'],
  ['budget', 'Presupuesto'],
  ['transactions', 'Movimientos']
] as const;
const more = [
  ['recurring', 'Recurrentes'],
  ['comparison', 'Comparación'],
  ['contributions', 'Aportes'],
  ['goals', 'Metas'],
  ['networth', 'Patrimonio'],
  ['accounts', 'Cuentas']
] as const;
export default function FinanceNavigation({
  active,
  onSelect
}: {
  active: FinanceSection;
  onSelect: (section: FinanceSection) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (details.current && !root.current?.contains(e.target as Node)) details.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function select(section: FinanceSection) {
    if (details.current) details.current.open = false;
    onSelect(section);
  }
  const additional = more.find(([key]) => key === active);
  return (
    <div
      ref={root}
      className="finance-workspace-nav"
      onKeyDown={e => {
        if (e.key === 'Escape' && details.current?.open) {
          details.current.open = false;
          details.current.querySelector('summary')?.focus();
        }
      }}
    >
      <div className="finance-nav-label">
        <ModuleIcon name="finance" size={16} />
        <span>Tu espacio financiero</span>
      </div>
      <div className="finance-tabs" role="group" aria-label="Secciones de Finanzas">
        {main.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={active === key}
            className={active === key ? 'active' : ''}
            onClick={() => select(key)}
          >
            {label}
          </button>
        ))}
        <details ref={details} className={'finance-more ' + (additional ? 'has-active' : '')}>
          <summary>
            {additional ? additional[1] : 'Más'} <ChevronDown size={14} />
          </summary>
          <div className="finance-more-options" role="group" aria-label="Más secciones financieras">
            {more.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={active === key}
                className={active === key ? 'active' : ''}
                onClick={() => select(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
