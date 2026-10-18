import {describe, expect, it} from 'vitest';
import {detectSubscriptions} from './subscriptions';
import {forecast90, usualFlows} from './forecast';
import {weekStart, weeklySummary} from './weekly';
import {rolloverCarry, zeroBased} from './zeroBased';
import {answerQuestion, type QContext} from './localQuestions';
import {normalizeFeatures} from './features';

const today = '2026-10-18';
const fmt = (n: number) => 'Q' + n.toFixed(2);

describe('optional features', () => {
  it('are off unless the person turned them on', () => {
    expect(normalizeFeatures({voice: true, forecast: 'yes', other: true})).toEqual({
      voice: true,
      questions: false,
      weekly: false,
      forecast: false,
      subscriptions: false,
      zeroBased: false
    });
  });
});

describe('subscription detection', () => {
  const tx = (description: string, amount: number, transaction_date: string) => ({
    description,
    amount,
    type: 'expense',
    transaction_date
  });
  it('finds monthly charges, notices a raise and skips planned ones', () => {
    const rows = [
      tx('Netflix', 99, '2026-07-10'),
      tx('Netflix', 99, '2026-08-10'),
      tx('Netflix', 115, '2026-09-10'),
      tx('Netflix', 115, '2026-10-10'),
      tx('Gimnasio Zona 10', 300, '2026-08-02'),
      tx('Gimnasio Zona 10', 300, '2026-09-01'),
      tx('Gimnasio Zona 10', 300, '2026-10-02'),
      tx('Supermercado', 820, '2026-08-05'),
      tx('Supermercado', 640, '2026-08-19'),
      tx('Supermercado', 1200, '2026-09-04'),
      tx('Supermercado', 300, '2026-10-03'),
      tx('Claro hogar', 350, '2026-09-20'),
      tx('Claro hogar', 350, '2026-10-20')
    ];
    const subs = detectSubscriptions(rows, ['Pago Claro hogar'], today);
    expect(subs.map(s => s.description)).toEqual(['Gimnasio Zona 10', 'Netflix']);
    const netflix = subs.find(s => s.description === 'Netflix')!;
    expect(netflix).toMatchObject({amount: 115, yearly: 1380, priceChange: 16, nextDate: '2026-11-10', dueDay: 10});
    expect(detectSubscriptions(rows.slice(0, 4), [], '2027-02-01')).toEqual([]);
  });
});

describe('90-day forecast', () => {
  const recurring = [
    {id: 'rent', description: 'Renta', amount: 3000, type: 'expense', due_day: 1},
    {id: 'salary', description: 'Salario', amount: 8000, type: 'income', due_day: 30},
    {id: 'light', description: 'Luz', amount: 350, type: 'expense', due_day: 20}
  ];
  it('derives usual variable spending and other income', () => {
    const history = [
      {amount: 3000 + 2760, type: 'expense', transaction_date: '2026-07-10'},
      {amount: 3000 + 2760, type: 'expense', transaction_date: '2026-08-10'},
      {amount: 3000 + 2760 + 1050, type: 'expense', transaction_date: '2026-09-10'},
      {amount: 9000, type: 'income', transaction_date: '2026-09-30'},
      {amount: 8000, type: 'income', transaction_date: '2026-08-30'},
      {amount: 8000, type: 'income', transaction_date: '2026-07-30'}
    ];
    const u = usualFlows(history, recurring, today);
    // Spent 18,330 − fixed (3,350 × 3) = 8,280 over 92 days (Jul–Sep); income 25,000 − 8,000 × 3 = 1,000 / 3.
    expect(u.dailyVariable).toBe(90);
    expect(u.monthlyOtherIncome).toBe(333.33);
  });
  it('projects the balance with fixed items on their days and finds the low point', () => {
    const f = forecast90(1000, today, {
      recurring,
      paidThisMonth: new Set(['rent']),
      dailyVariable: 50,
      monthlyOtherIncome: 0
    });
    expect(f.points).toHaveLength(91);
    // Oct 19: light (due the 20th, not paid) is still ahead; Oct 20: −350; Oct 30: +8,000; Nov 1: −3,000.
    expect(f.events.slice(0, 3).map(e => [e.date, e.amount])).toEqual([
      ['2026-10-20', -350],
      ['2026-10-30', 8000],
      ['2026-11-01', -3000]
    ]);
    expect(f.low).toEqual({date: '2026-10-29', balance: 1000 - 350 - 50 * 11});
    expect(f.firstNegative).toBeNull();
    const tight = forecast90(100, today, {
      recurring,
      paidThisMonth: new Set(['rent']),
      dailyVariable: 50,
      monthlyOtherIncome: 0
    });
    expect(tight.firstNegative).toBe('2026-10-20');
  });
});

describe('weekly summary', () => {
  it('compares this week with the same days of normal weeks', () => {
    expect(weekStart(today)).toBe('2026-10-12');
    const tx = (d: string, amount: number, category_id = 'food') => ({
      transaction_date: d,
      amount,
      type: 'expense',
      category_id,
      description: 'x'
    });
    const rows = [
      tx('2026-10-13', 300),
      tx('2026-10-15', 900, 'fun'),
      tx('2026-10-06', 400),
      tx('2026-09-29', 400),
      tx('2026-09-22', 400),
      tx('2026-09-15', 400),
      tx('2026-09-20', 5000) // a Sunday: outside Monday→Sunday of that week? it is inside (Sep 14–20)
    ];
    const s = weeklySummary(
      rows,
      today,
      [{date: '2026-10-20', description: 'Luz', amount: 350}],
      id => (id === 'fun' ? 'Diversión' : 'Comida'),
      fmt
    );
    expect(s.spent).toBe(1200);
    expect(s.usual).toBe(1650);
    expect(s.change).toBe(-27);
    expect(s.upcomingTotal).toBe(350);
    expect(s.sentence).toContain('menos que una semana normal');
    expect(s.biggest).toEqual({description: 'x', amount: 900});
  });
});

describe('zero-based budget with rollover', () => {
  it('carries unspent money forward and resets after a month without plan', () => {
    const months = [
      {month: '2026-08', planned: {food: 2000, fun: 500}, spent: {food: 1800, fun: 700}},
      {month: '2026-09', planned: {food: 2000, fun: 500}, spent: {food: 2100}},
      {month: '2026-10', planned: {food: 2000}, spent: {}}
    ];
    expect(rolloverCarry(months, ['food', 'fun'])).toEqual({food: 100, fun: 500});
    expect(zeroBased(5000, {food: 2000, fun: 500}, {food: 100})).toEqual({
      assigned: 2500,
      toAssign: 2500,
      carried: 100,
      state: 'unassigned'
    });
    expect(zeroBased(2500, {food: 2000, fun: 500}).state).toBe('balanced');
    expect(zeroBased(2000, {food: 2000, fun: 500}).toAssign).toBe(-500);
  });
});

describe('quick local questions', () => {
  const ctx: QContext = {
    today,
    format: fmt,
    categories: [
      {id: 'food', name: 'Alimentación'},
      {id: 'home', name: 'Casa y servicios'}
    ],
    planned: {food: 2000},
    txs: [
      {amount: 500, type: 'expense', transaction_date: '2026-10-03', category_id: 'food', description: 'Súper'},
      {amount: 250, type: 'expense', transaction_date: '2026-10-12', category_id: 'food', description: 'Pollo'},
      {amount: 350, type: 'expense', transaction_date: '2026-10-05', category_id: 'home', description: 'Luz'},
      {amount: 900, type: 'expense', transaction_date: '2026-09-05', category_id: 'food', description: 'Súper'},
      {amount: 6000, type: 'income', transaction_date: '2026-10-15', description: 'Salario'},
      {amount: 5000, type: 'income', transaction_date: '2026-09-15', description: 'Salario'}
    ],
    recurring: [{description: 'Luz EEGSA', amount: 350, type: 'expense', due_day: 20}],
    goals: [
      {name: 'Viaje', target_amount: 15000, saved: 4000},
      {name: 'Emergencias', target_amount: 10000, saved: 2500}
    ]
  };
  it('answers spending, remaining, due dates, savings and income', () => {
    expect(answerQuestion('¿Cuánto gasté en comida este mes?', ctx)?.answer).toBe(
      'En comida gastaron Q750.00 este mes.'
    );
    expect(answerQuestion('cuanto gastamos el mes pasado', ctx)?.answer).toBe('Gastaron Q900.00 el mes pasado.');
    expect(answerQuestion('¿Cuánto me queda para el súper?', ctx)?.answer).toBe(
      'Te quedan Q1250.00 de Q2000.00 en alimentación.'
    );
    expect(answerQuestion('¿Cuándo pago la luz?', ctx)?.answer).toBe(
      'Luz EEGSA: el martes, 20 de octubre, unos Q350.00.'
    );
    expect(answerQuestion('¿Cuánto llevamos ahorrado?', ctx)?.answer).toBe('Llevan Q6500.00 ahorrados en 2 metas.');
    expect(answerQuestion('cuanto llevamos ahorrado para el viaje', ctx)?.answer).toBe(
      'Para Viaje llevan Q4000.00 de Q15000.00.'
    );
    expect(answerQuestion('¿En qué gastamos más?', ctx)?.answer).toBe(
      'Este mes, lo que más pesa es alimentación: Q750.00.'
    );
    expect(answerQuestion('¿Cuánto entró el mes pasado?', ctx)?.answer).toBe('Entraron Q5000.00 el mes pasado.');
    expect(answerQuestion('hola', ctx)).toBeNull();
  });
});
