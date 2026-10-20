import {test, expect} from '@playwright/test';
import {setup, ready, healthy, uid, day, monthStart} from './support.mjs';

test('the v31 summary uses its complete server read and never substitutes legacy figures after failure', async ({
  browser
}) => {
  const s = await setup(browser, {rich: true});
  let mode = 'valid';
  const source = {
    transactions: [
      {
        id: 'v31-income',
        description: 'Ingreso QA',
        amount: 1234.56,
        type: 'income',
        transaction_date: day,
        paid_by: uid,
        is_shared: true,
        category_id: null
      }
    ],
    categories: [],
    allocations: [],
    contributions: [],
    recurring: [],
    occurrences: [],
    member_settings: [{user_id: uid, monthly_income: 0, first_pay_day: 10, second_pay_day: 25}],
    goals: [],
    goal_contributions: [],
    plans: [
      {user_id: uid, month: monthStart, expected_amount: 2000, first_half_amount: 1000, second_half_amount: 1000}
    ],
    members: [{user_id: uid}],
    splits: [],
    settlements: [],
    private: [],
    settings: {usd_rate: 7.75}
  };
  await s.page.route('**/rest/v1/rpc/get_home_finance_source', r => {
    const body = {...source};
    if (mode === 'malformed') delete body.allocations;
    return r.fulfill({
      status: mode === 'failed' ? 500 : 200,
      json: mode === 'failed' ? {message: 'Summary unavailable'} : body
    });
  });
  try {
    await ready(s, '');
    await s.page
      .getByRole('group', {name: 'Período del presupuesto disponible'})
      .getByRole('button', {name: 'Mes', exact: true})
      .click();
    await expect(s.page.locator('.home-budget-remaining')).toContainText('1,234.56');
    await expect(s.page.locator('.home-liquid-total')).toContainText('Q 0');
    mode = 'failed';
    await s.page.getByRole('button', {name: 'Actualizar resumen', exact: true}).click();
    await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar el resumen');
    await expect(s.page.locator('.home-hero')).toHaveCount(0);
    mode = 'malformed';
    await s.page.getByRole('alert').getByRole('button', {name: 'Reintentar', exact: true}).click();
    await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar el resumen');
    await expect(s.page.locator('.home-hero')).toHaveCount(0);
    mode = 'valid';
    await s.page.getByRole('alert').getByRole('button', {name: 'Reintentar', exact: true}).click();
    await s.page
      .getByRole('group', {name: 'Período del presupuesto disponible'})
      .getByRole('button', {name: 'Mes', exact: true})
      .click();
    await expect(s.page.locator('.home-budget-remaining')).toContainText('1,234.56');
    await expect(s.page.locator('.home-liquid-total')).toContainText('Q 0');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
