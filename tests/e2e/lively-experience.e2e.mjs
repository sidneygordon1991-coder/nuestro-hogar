import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, healthy, uid, hh, rid} from './support.mjs';
const goalId = '77777777-1111-4111-8111-111111111111',
  bank = '90000000-0000-4000-8000-000000000001';
const food = '66666666-1111-4111-8111-111111111111',
  house = '66666666-2222-4222-8222-222222222222';
async function fixture(browser, options = {}) {
  const s = await setup(browser, {rich: true, ...options}),
    writes = [];
  const goal = {
    id: goalId,
    name: 'Viaje en familia',
    target_amount: 1000,
    target_date: '2027-06-30',
    icon: 'travel',
    active: true
  };
  const categories = [
    {id: food, name: 'Alimentación', icon: 'food', budget_group: 'variable'},
    {id: house, name: 'Casa y servicios', icon: 'home', budget_group: 'fixed'}
  ];
  const tx = (id, date, amount, type, category_id, description) => ({
    id,
    transaction_date: date,
    amount,
    type,
    category_id,
    description,
    account_id: bank,
    paid_by: uid,
    is_shared: true,
    budget_included: true
  });
  const transactions = [
    tx('salary', '2026-10-05', 1000, 'income', null, 'Salario'),
    tx('food', '2026-10-15', 120, 'expense', food, 'Supermercado'),
    tx('light', '2026-10-16', 80, 'expense', house, 'Luz'),
    tx('future', '2026-10-30', 9999, 'income', null, 'Sueldo futuro')
  ];
  const contributions = [
    {id: 'goal-contribution', goal_id: goalId, amount: 250, contribution_date: '2026-10-10', created_by: uid}
  ];
  const plans = [
    {
      user_id: uid,
      month: '2026-10-01',
      expected_amount: 1000,
      first_half_amount: 500,
      second_half_amount: 500,
      cycle_first_day: 1,
      cycle_second_day: 16
    }
  ];
  const allocations = categories.map(c => ({
    category_id: c.id,
    month: '2026-10-01',
    planned_amount: 400,
    first_half_amount: 200,
    second_half_amount: 200
  }));
  await s.page.route('**/rest/v1/rpc/get_home_finance_source', r =>
    r.fulfill({
      json: {
        transactions,
        categories,
        allocations,
        contributions,
        recurring: [],
        occurrences: [],
        member_settings: [],
        goals: [goal],
        goal_contributions: contributions,
        plans,
        members: [{user_id: uid, full_name: 'Persona'}],
        splits: [],
        settlements: [],
        private: []
      }
    })
  );
  await s.page.route('**/rest/v1/savings_goals?**', r => r.fulfill({json: [goal]}));
  await s.page.route('**/rest/v1/goal_contributions?**', r => r.fulfill({json: contributions}));
  await s.page.route('**/rest/v1/budget_categories?**', r => r.fulfill({json: categories}));
  await s.page.route('**/rest/v1/budget_allocations?**', r => r.fulfill({json: allocations}));
  await s.page.route('**/rest/v1/finance_income_plans?**', r => r.fulfill({json: plans}));
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      json: [
        {
          id: bank,
          name: 'Banco principal',
          account_type: 'checking',
          account_class: 'asset',
          active: true,
          opening_balance: 100,
          is_shared: true
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/transactions?**', r => {
    const filters = new URL(r.request().url()).searchParams.getAll('transaction_date');
    return r.fulfill({
      json: transactions.filter(t =>
        filters.every(f =>
          f.startsWith('gte.')
            ? t.transaction_date >= f.slice(4)
            : f.startsWith('lte.')
              ? t.transaction_date <= f.slice(4)
              : true
        )
      )
    });
  });
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r => {
    writes.push(r.request().postDataJSON());
    return r.fulfill({json: rid});
  });
  return {...s, writes};
}
async function accessible(page) {
  const r = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    r.violations
      .filter(v => ['critical', 'serious'].includes(v.impact))
      .map(v => ({id: v.id, nodes: v.nodes.map(n => n.target)}))
  ).toEqual([]);
}
for (const theme of ['light', 'dark']) {
  test(`touchable financial details and honest progress on phone and desktop: ${theme}`, async ({browser}) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, '');
      const budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
      await budget.getByRole('button', {name: 'Mes', exact: true}).click();
      await expect(budget.locator('.home-budget-remaining')).toContainText('800');
      await expect(budget.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
      await expect(s.page.locator('.home-goal .goal-milestone-badge')).toHaveText('25% alcanzado');
      await expect(s.page.locator('.home-goal .goal-next-milestone')).toContainText('250');
      await s.page.getByRole('button', {name: 'Explorar gastos de Casa y servicios', exact: true}).click();
      const category = s.page.getByRole('region', {name: 'Movimientos de Casa y servicios'});
      await expect(category).toContainText('Luz');
      await expect(category).toContainText('80');
      await s.page.locator('.chart-inspector>summary').click();
      const inspector = s.page.locator('.chart-inspector');
      await expect(inspector.locator('.chart-selected-value')).toContainText('Registrado');
      await expect(inspector.locator('.movement-peek')).toContainText('Luz');
      await inspector.getByRole('slider').focus();
      await inspector.getByRole('slider').press('End');
      await expect(inspector.locator('.chart-selected-value')).toContainText('Proyectado');
      await expect(inspector).toContainText('aún no son movimientos registrados');
      await expect(inspector).not.toContainText('Sueldo futuro');
      await inspector.locator('summary').click();
      const svg = s.page.locator('.home-chart>svg'),
        box = await svg.boundingBox();
      await svg.click({position: {x: box.width - 20, y: 30}});
      await expect(inspector).toHaveAttribute('open', '');
      for (const width of [320, 390, 1440]) {
        await s.page.setViewportSize({width, height: 844});
        await healthy(s);
      }
      await s.page.setViewportSize({width: 390, height: 844});
      await accessible(s.page);
      await s.page.screenshot({path: test.info().outputPath('home-' + theme + '.png'), fullPage: true});
      expect(s.writes).toHaveLength(0);
    } finally {
      await s.context.close();
    }
  });
  test(`visual choices update actual fields, retain privacy and save once: ${theme}`, async ({browser}) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, '');
      await s.page.evaluate(() => window.dispatchEvent(new CustomEvent('nh:quick-add')));
      const d = s.page.getByRole('dialog');
      await d
        .getByRole('button', {name: /^Gasto/})
        .first()
        .click();
      await d.getByLabel('Monto', {exact: true}).fill('150');
      const category = d.getByRole('button', {name: /^Elegir categoría:/});
      await category.click();
      await d.getByLabel('Buscar categoría').fill('alimenta');
      await d.getByLabel('Buscar categoría').press('Escape');
      await expect(d).toBeVisible();
      await expect(category).toBeFocused();
      await expect(category).toHaveAttribute('aria-expanded', 'false');
      await category.click();
      await d.getByLabel('Buscar categoría').fill('alimenta');
      await d
        .getByRole('group', {name: 'Opciones de categoría'})
        .getByRole('button', {name: 'Alimentación', exact: true})
        .click();
      await expect(d.getByLabel('Categoría', {exact: true})).toHaveValue(food);
      await d.getByRole('button', {name: /^Elegir cuenta:/}).click();
      await d
        .getByRole('group', {name: 'Opciones de cuenta'})
        .getByRole('button', {name: /Banco principal/})
        .click();
      await expect(d.getByLabel('Cuenta', {exact: true})).toHaveValue(bank);
      await d.getByRole('button', {name: 'Solo yo', exact: true}).click();
      await expect(d.getByRole('button', {name: /^Elegir cuenta:/})).toHaveCount(0);
      await d.getByRole('button', {name: 'Compartido', exact: true}).click();
      await d.getByRole('button', {name: /^Elegir cuenta:/}).click();
      for (const width of [320, 390, 1440]) {
        await s.page.setViewportSize({width, height: 844});
        await healthy(s);
      }
      await accessible(s.page);
      await d
        .getByRole('group', {name: 'Opciones de cuenta'})
        .getByRole('button', {name: /Banco principal/})
        .click();
      await s.page.setViewportSize({width: 390, height: 844});
      await s.page.screenshot({path: test.info().outputPath('quick-' + theme + '.png'), fullPage: true});
      await d.getByRole('button', {name: 'Guardar gasto', exact: true}).click();
      await expect(d.locator('.quick-entry-success')).toContainText('Registrado');
      await expect(d.locator('.quick-entry-success')).toContainText('Cuenta: Banco principal');
      expect(s.writes).toHaveLength(1);
      expect(s.writes[0].p_values).toMatchObject({amount: 150, category_id: food, account_id: bank, is_shared: true});
    } finally {
      await s.context.close();
    }
  });
}
test('a goal photo is local, survives reload, can be removed and never writes financial data', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, '');
    const goal = s.page.locator('.home-goal');
    await goal.getByLabel('Personalizar imagen de Viaje en familia', {exact: true}).click();
    await goal.getByLabel('Foto de Viaje en familia', {exact: true}).setInputFiles('public/icon-192.png');
    await expect(goal.getByRole('img', {name: 'Imagen elegida para Viaje en familia'})).toBeVisible();
    expect(
      await s.page.evaluate(
        ({uid, hh, id}) =>
          localStorage.getItem('nh:goal-photo:' + uid + ':' + hh + ':' + id)?.startsWith('data:image/jpeg;base64,'),
        {uid, hh, id: goalId}
      )
    ).toBe(true);
    await s.page.reload();
    await expect(goal.getByRole('img', {name: 'Imagen elegida para Viaje en familia'})).toBeVisible();
    await goal.getByLabel('Personalizar imagen de Viaje en familia', {exact: true}).click();
    await goal.getByRole('button', {name: 'Quitar foto', exact: true}).click();
    await expect(goal.getByRole('img', {name: 'Imagen elegida para Viaje en familia'})).toHaveCount(0);
    await expect(goal.locator('.goal-art')).toBeVisible();
    expect(s.writes).toHaveLength(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('reduced motion disables new interface animations', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await s.page.emulateMedia({reducedMotion: 'reduce'});
    await ready(s, '');
    await s.page.getByRole('button', {name: 'Explorar gastos de Casa y servicios', exact: true}).click();
    expect(await s.page.locator('.home-category-detail').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    expect(
      await s.page
        .locator('.home-budget-bar i')
        .first()
        .evaluate(e => Number.parseFloat(getComputedStyle(e).transitionDuration))
    ).toBeLessThanOrEqual(0.001);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
