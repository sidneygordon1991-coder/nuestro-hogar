import {describe, expect, it} from 'vitest';
import {DEFAULT_USD_RATE, formatEntryAmount, formatUsd, usdRate, usdToQuetzales} from './currency';
describe('quetzales and dollars', () => {
  it('converts dollars to quetzales once, rounded to cents', () => {
    expect(usdToQuetzales(50, 7.75)).toBe(387.5);
    expect(usdToQuetzales(19.99, 7.7123)).toBe(154.17);
  });
  it('formats dollar entries next to their quetzal value', () => {
    expect(formatUsd(50)).toBe('US$ 50');
    expect(formatUsd(12.5)).toBe('US$ 12.50');
    expect(formatEntryAmount(387.5, {original_currency: 'USD', original_amount: 50})).toBe('US$ 50 · Q 387.50');
    expect(formatEntryAmount(100)).toBe('Q 100');
  });
  it('falls back to the default rate for missing or absurd values', () => {
    expect(usdRate(null)).toBe(DEFAULT_USD_RATE);
    expect(usdRate('7.8')).toBe(7.8);
    expect(usdRate(-1)).toBe(DEFAULT_USD_RATE);
  });
});

it('rounds dollar half-cents exactly as PostgreSQL numeric', () => {
  expect(usdToQuetzales(1, 1.005)).toBe(1.01);
  expect(usdToQuetzales(50, 7.75)).toBe(387.5);
});

import {usdAccountBalance} from './currency';
describe('dollar accounts', () => {
  it("keeps the real dollar balance and values it at today's rate", () => {
    const account = {id: 'usd', account_class: 'asset', opening_balance: 7750, opening_balance_usd: 1000};
    const movements = [
      {
        account_id: 'usd',
        type: 'income',
        amount: 1550,
        transaction_date: '2026-10-01',
        original_currency: 'USD',
        original_amount: 200,
        exchange_rate: 7.75
      },
      {account_id: 'usd', type: 'expense', amount: 780, transaction_date: '2026-10-02'},
      {account_id: 'other', type: 'expense', amount: 999, transaction_date: '2026-10-02'},
      {account_id: 'usd', type: 'expense', amount: 78, transaction_date: '2026-11-02'}
    ];
    const transfers = [{from_account_id: 'usd', to_account_id: 'q', amount: 390, transfer_date: '2026-10-03'}];
    const b = usdAccountBalance(account, movements, transfers, 7.8, '2026-10-31');
    expect(b.usd).toBe(1050); // 1000 + 200 - Q780/7.8 - Q390/7.8
    expect(b.quetzales).toBe(8190);
    expect(usdAccountBalance({...account, opening_balance_usd: null}, [], [], 7.75, '2026-10-31').usd).toBe(1000);
  });
});

it('labels dollar balances as estimates when original currency or historical transfer FX is missing', () => {
  const a = {id: 'usd', account_class: 'asset', opening_balance: 775, opening_balance_usd: 100};
  expect(usdAccountBalance(a, [], [], 7.75, '2026-10-31').estimated).toBe(false);
  expect(
    usdAccountBalance(
      a,
      [
        {
          account_id: 'usd',
          amount: 77.5,
          type: 'expense',
          transaction_date: '2026-10-01',
          original_currency: 'USD',
          original_amount: 10
        }
      ],
      [],
      8,
      '2026-10-31'
    )
  ).toMatchObject({usd: 90, estimated: false});
  expect(
    usdAccountBalance(
      a,
      [{account_id: 'usd', amount: 77.5, type: 'expense', transaction_date: '2026-10-01'}],
      [],
      8,
      '2026-10-31'
    ).estimated
  ).toBe(true);
  expect(
    usdAccountBalance(
      a,
      [],
      [{from_account_id: 'usd', to_account_id: 'q', amount: 77.5, transfer_date: '2026-10-01'}],
      8,
      '2026-10-31'
    ).estimated
  ).toBe(true);
});
