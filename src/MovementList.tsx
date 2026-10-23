import {ArrowDownLeft, ArrowUpRight} from 'lucide-react';
import type {CashMovement} from './lib/cashFlow';
import {formatMoney} from './lib/money';

export default function MovementList({
  rows,
  categories = [],
  empty = 'No hay ingresos o gastos registrados ese día en esta vista.'
}: {
  rows: CashMovement[];
  categories?: {id: string; name?: string}[];
  empty?: string;
}) {
  if (!rows.length) return <p className="movement-empty">{empty}</p>;
  return (
    <>
      <ul className="movement-peek">
        {rows.slice(0, 5).map(row => {
          const income = row.type === 'income',
            name =
              row.description || categories.find(c => c.id === row.category_id)?.name || (income ? 'Ingreso' : 'Gasto');
          return (
            <li key={row.id}>
              <span className={'movement-peek-icon ' + (income ? 'income' : 'expense')} aria-hidden="true">
                {income ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
              </span>
              <span>
                <strong>{name}</strong>
                <small>
                  {row.transaction_date.slice(8) + '/' + row.transaction_date.slice(5, 7)} ·{' '}
                  {income
                    ? 'Ingreso registrado'
                    : row.budget_included === false
                      ? 'Fuera del presupuesto'
                      : 'Gasto registrado'}
                </small>
              </span>
              <b>
                {income ? '+ ' : '− '}
                {formatMoney(Number(row.amount))}
              </b>
            </li>
          );
        })}
      </ul>
      {rows.length > 5 && <p className="movement-empty">Y {rows.length - 5} movimientos más en este rango.</p>}
    </>
  );
}
