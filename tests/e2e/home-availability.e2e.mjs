import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, healthy, uid, hh} from './support.mjs';
const partner = '55555555-5555-4555-8555-555555555555',
  bank = '90000000-0000-4000-8000-000000000001',
  cash = '90000000-0000-4000-8000-000000000002',
  card = '90000000-0000-4000-8000-000000000003';
const month = '2026-10-01';
async function fixture(browser, {theme = 'light', cross = false, partial = false, reversed = false} = {}) {
  const s = await setup(browser, {rich: true, theme});
  let failAccounts = false,
    failCycle = false;
  const tx = (id, date, amount, type, account_id, budget_included = true) => ({
    id,
    description: id,
    transaction_date: date,
    amount,
    type,
    account_id,
    budget_included,
    paid_by: uid,
    is_shared: true,
    category_id: 'food'
  });
  const transactions = [
    tx('early', '2026-10-05', 1000, 'income', bank),
    tx('salary-a', '2026-10-14', 2500, 'income', bank),
    {...tx('salary-b', '2026-10-15', 1500, 'income', bank), paid_by: partner},
    tx('credit purchase', '2026-10-16', 600, 'expense', card),
    tx('existing cash', '2026-10-16', 100, 'expense', cash, false),
    tx('future', '2026-10-29', 99999, 'income', bank)
  ];
  const prior = [
    tx('prior-income', '2026-09-30', 500, 'income', bank),
    tx('prior-expense', '2026-09-30', 50, 'expense', card)
  ];
  const plans = [
    {
      user_id: uid,
      month,
      expected_amount: 6000,
      first_half_amount: 3000,
      second_half_amount: 3000,
      cycle_first_day: reversed ? 29 : cross ? 20 : 14,
      cycle_second_day: reversed ? 14 : cross ? 30 : 29
    },
    {
      user_id: partner,
      month,
      expected_amount: 4000,
      first_half_amount: partial ? null : 2000,
      second_half_amount: 2000,
      cycle_first_day: 1,
      cycle_second_day: 16
    }
  ];
  await s.page.route('**/rest/v1/rpc/get_home_finance_source', r =>
    r.fulfill({
      json: {
        transactions,
        categories: [{id: 'food', name: 'Comida', budget_group: 'variable'}],
        allocations: [],
        contributions: [],
        recurring: [],
        occurrences: [],
        member_settings: [],
        goals: [],
        goal_contributions: [],
        plans,
        members: [{user_id: uid}, {user_id: partner}],
        splits: [],
        settlements: [],
        private: []
      }
    })
  );
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      status: failAccounts ? 500 : 200,
      json: failAccounts
        ? {message: 'Unavailable'}
        : [
            {
              id: bank,
              name: 'Banco',
              account_type: 'checking',
              account_class: 'asset',
              opening_balance: 1000,
              active: true
            },
            {
              id: cash,
              name: 'Efectivo',
              account_type: 'cash',
              account_class: 'asset',
              opening_balance: 200,
              active: true
            },
            {
              id: card,
              name: 'Tarjeta',
              account_type: 'credit',
              account_class: 'liability',
              opening_balance: 0,
              credit_limit: 10000,
              active: true
            },
            {
              id: 'investment',
              name: 'Inversión',
              account_type: 'investment',
              account_class: 'asset',
              opening_balance: 9000,
              active: true
            }
          ]
    })
  );
  await s.page.route('**/rest/v1/transactions?**', r => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get('account_id') === 'not.is.null') return r.fulfill({json: [...transactions, ...(cross ? prior : [])]});
    const from = q
        .getAll('transaction_date')
        .find(v => v.startsWith('gte.'))
        ?.slice(4),
      to = q
        .getAll('transaction_date')
        .find(v => v.startsWith('lte.'))
        ?.slice(4);
    if (failCycle && from?.startsWith('2026-09')) return r.fulfill({status: 500, json: {message: 'Cycle unavailable'}});
    return r.fulfill({
      json: [...transactions, ...(cross ? prior : [])].filter(
        t => (!from || t.transaction_date >= from) && (!to || t.transaction_date <= to)
      )
    });
  });
  await s.page.route('**/rest/v1/finance_income_plans?**', r =>
    r.fulfill({
      json: plans.map(p => ({...p, month: new URL(r.request().url()).searchParams.get('month')?.slice(3) || month}))
    })
  );
  await s.page.route('**/rest/v1/finance_transfers?**', r =>
    r.fulfill({
      json: [
        {from_account_id: bank, to_account_id: cash, amount: 50, transfer_date: '2026-10-16'},
        {from_account_id: bank, to_account_id: card, amount: 300, transfer_date: '2026-10-16'}
      ]
    })
  );
  return {
    ...s,
    setAccountFailure: v => {
      failAccounts = v;
    },
    setCycleFailure: v => {
      failCycle = v;
    }
  };
}
for (const theme of ['light', 'dark'])
  test(`real account balances and income budget stay independent: ${theme}`, async ({browser}) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, '');
      const hero = s.page.locator('.home-hero'),
        budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
      await expect(hero.locator('.home-liquid-total')).toContainText('5,800');
      await expect(hero.locator('.home-hero-minis')).toContainText('5,650');
      await expect(hero.locator('.home-hero-minis')).toContainText('150');
      await expect(budget).toContainText('14 oct');
      await expect(budget.locator('.home-budget-remaining')).toContainText('3,400');
      await expect(budget).toContainText('Pagado fuera del presupuesto: Q 100');
      await budget.getByLabel('Base de ingresos del presupuesto').selectOption('expected');
      await expect(budget.locator('.home-budget-remaining')).toContainText('4,400');
      await expect(budget).toContainText('Proyección según el plan guardado');
      await budget.getByRole('button', {name: 'Mes', exact: true}).click();
      await expect(budget.locator('.home-budget-remaining')).toContainText('9,400');
      await budget.getByLabel('Base de ingresos del presupuesto').selectOption('received');
      await expect(budget.locator('.home-budget-remaining')).toContainText('4,400');
      await budget.getByRole('button', {name: '2.ª quincena', exact: true}).click();
      await expect(budget).toContainText('13 nov');
      await expect(budget.locator('.home-budget-remaining')).toHaveText(/Q\s*0(?:\.00)?$/);
      await expect(hero.locator('.home-liquid-total')).toContainText('5,800');
      await budget.getByRole('button', {name: '1.ª quincena', exact: true}).click();
      for (const width of [320, 390, 768, 1440]) {
        await s.page.setViewportSize({width, height: 844});
        await healthy(s);
      }
      await s.page.setViewportSize({width: 390, height: 844});
      await s.page.evaluate(() => window.scrollTo(0, 0));
      await s.page.screenshot({path: test.info().outputPath(`availability-${theme}.png`), fullPage: true});
      expect(
        (await new AxeBuilder({page: s.page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations
      ).toEqual([]);
    } finally {
      await s.context.close();
    }
  });
test('home automatically selects 14–28 as the second half when the first starts on 29', async ({browser}) => {
  const s = await fixture(browser, {reversed: true});
  try {
    await ready(s, '');
    const budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
    await expect(budget.getByRole('button', {name: '2.ª quincena', exact: true})).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(budget).toContainText('14 oct');
    await expect(budget).toContainText('28 oct');
    await expect(budget.locator('.home-budget-remaining')).toContainText('3,400');
    await budget.getByRole('button', {name: '1.ª quincena', exact: true}).click();
    await expect(budget).toContainText('29 sept');
    await expect(budget).toContainText('13 oct');
    await expect(budget.locator('.home-budget-remaining')).toContainText('1,000');
    await budget.getByRole('button', {name: 'Mes', exact: true}).click();
    await expect(budget.locator('.home-budget-remaining')).toContainText('4,400');
    await expect(s.page.locator('.home-liquid-total')).toContainText('5,800');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('an account read failure hides cash only; incomplete expected income never becomes a zero plan', async ({
  browser
}) => {
  const s = await fixture(browser, {partial: true});
  s.setAccountFailure(true);
  try {
    await ready(s, '');
    const budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
    await expect(s.page.locator('.home-liquid-total')).toHaveText('Q —');
    await expect(budget.locator('.home-budget-remaining')).toContainText('3,400');
    await budget.getByLabel('Base de ingresos del presupuesto').selectOption('expected');
    await expect(budget.locator('.home-budget-remaining')).toHaveText('Q —');
    await expect(budget).toContainText('Completa los ingresos esperados');
    await expect(budget).not.toContainText('Ingresos por recibir:');
    await expect(s.page.locator('.home-chart')).toBeVisible();
    s.setAccountFailure(false);
    await s.page.getByRole('button', {name: 'Reintentar cuentas', exact: true}).click();
    await expect(s.page.locator('.home-liquid-total')).toContainText('5,800');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('a fortnight crossing the month loads its actual history and fails visibly before retry', async ({browser}) => {
  const s = await fixture(browser, {cross: true});
  s.setCycleFailure(true);
  try {
    await ready(s, '');
    const budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
    await expect(budget.getByRole('alert')).toContainText('No pudimos verificar este período');
    await expect(budget.locator('.home-budget-remaining')).toHaveText('Q —');
    await expect(s.page.locator('.home-liquid-total')).toContainText('6,300');
    s.setCycleFailure(false);
    await budget.getByRole('button', {name: 'Reintentar período', exact: true}).click();
    await expect(budget).toContainText('30 sept');
    await expect(budget).toContainText('19 oct');
    await expect(budget.locator('.home-budget-remaining')).toContainText('4,850');
    await budget.getByRole('button', {name: 'Mes', exact: true}).click();
    await expect(budget.locator('.home-budget-remaining')).toContainText('4,400');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
