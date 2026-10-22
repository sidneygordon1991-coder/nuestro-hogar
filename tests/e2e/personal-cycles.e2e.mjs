import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, chooseFinance, healthy, uid} from './support.mjs';
const second = '55555555-5555-4555-8555-555555555555';
async function fixture(browser, options = {}) {
  const s = await setup(browser, {rich: true, ...options});
  await s.page.route('**/rest/v1/profiles?**', r =>
    r.fulfill({
      json: (r.request().headers().accept || '').includes('object')
        ? {id: uid, full_name: 'Andrea'}
        : [
            {id: uid, full_name: 'Andrea'},
            {id: second, full_name: 'Carlos'}
          ]
    })
  );
  const writes = [],
    queries = [];
  let fail = false;
  let plans = [
    {
      user_id: uid,
      month: '2026-10-01',
      expected_amount: 1000,
      first_half_amount: 500,
      second_half_amount: 500,
      cycle_first_day: 14,
      cycle_second_day: 29
    }
  ];
  const row = (id, date, amount, type = 'expense', budget_included = true) => ({
    id,
    transaction_date: date,
    amount,
    type,
    budget_included,
    description: id,
    category_id: 'food',
    paid_by: uid,
    account_id: null,
    is_shared: true,
    notes: null,
    recurring_transaction_id: null
  });
  const tx = [
    row('ordinary', '2026-10-15', 50),
    row('special', '2026-10-15', 200, 'expense', false),
    row('first-income', '2026-10-14', 100, 'income'),
    row('second-income', '2026-11-13', 400, 'income'),
    row('adjacent', '2026-11-14', 9999, 'income')
  ];
  await s.page.route('**/rest/v1/finance_income_plans?**', r => {
    if (r.request().method() === 'POST') {
      plans = r.request().postDataJSON();
      writes.push({kind: 'plans', value: plans});
      return r.fulfill({status: 201, body: ''});
    }
    return r.fulfill({json: plans});
  });
  await s.page.route('**/rest/v1/rpc/get_finance_cycle_defaults', r =>
    r.fulfill({json: [{user_id: second, cycle_first_day: 5, cycle_second_day: 20}]})
  );
  await s.page.route('**/rest/v1/transactions?**', r => {
    const url = new URL(r.request().url());
    if (r.request().method() === 'PATCH') {
      writes.push({kind: 'edit', value: r.request().postDataJSON()});
      return r.fulfill({status: 204, body: ''});
    }
    if (url.searchParams.getAll('transaction_date').includes('lte.2026-11-13')) {
      queries.push(url.toString());
      if (fail) return r.fulfill({status: 500, json: {message: 'Unavailable'}});
    }
    const rows = tx.filter(t =>
      url.searchParams
        .getAll('transaction_date')
        .every(f =>
          f.startsWith('gte.')
            ? t.transaction_date >= f.slice(4)
            : f.startsWith('lte.')
              ? t.transaction_date <= f.slice(4)
              : true
        )
    );
    return r.fulfill({json: rows});
  });
  await s.page.route('**/rest/v1/budget_categories?**', r =>
    r.fulfill({json: [{id: 'food', name: 'Comida', icon: 'food', budget_group: 'variable'}]})
  );
  await s.page.route('**/rest/v1/budget_allocations?**', r =>
    r.fulfill({
      json: [
        {
          id: 'allocation',
          month: '2026-10-01',
          category_id: 'food',
          planned_amount: 500,
          first_half_amount: 250,
          second_half_amount: 250
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/goal_contributions?**', r => r.fulfill({json: []}));
  await s.page.route('**/rest/v1/transaction_splits?**', r => r.fulfill({json: []}));
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r => {
    writes.push({kind: 'new', value: r.request().postDataJSON()});
    return r.fulfill({json: '77777777-1111-4111-8111-111111111111'});
  });
  await s.page.route('**/rest/v1/rpc/finance_split_weights', r =>
    r.fulfill({json: [{user_id: uid, ratio: 1, source: 'equal'}]})
  );
  return {
    ...s,
    writes,
    queries,
    setFailure: value => {
      fail = value;
    }
  };
}
for (const theme of ['light', 'dark'])
  test(`personal cycles and budget treatment work on phone and desktop: ${theme}`, async ({browser}) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Ingresos');
      await expect(s.page.getByLabel('Inicio primera quincena de Andrea')).toHaveValue('14');
      await expect(s.page.getByLabel('Inicio segunda quincena de Andrea')).toHaveValue('29');
      await expect(s.page.getByLabel('Inicio primera quincena de Carlos')).toHaveValue('5');
      await s.page.getByLabel('Inicio segunda quincena de Andrea').fill('14');
      await s.page.getByRole('button', {name: /Guardar plan de/}).click();
      await expect(s.page.getByRole('alert')).toContainText('días distintos');
      await s.page.getByLabel('Inicio segunda quincena de Andrea').fill('29');
      await s.page.getByRole('button', {name: /Guardar plan de/}).click();
      await expect(s.page.getByRole('status')).toContainText('Plan mensual guardado');
      expect(s.writes.find(x => x.kind === 'plans').value.find(p => p.user_id === uid)).toMatchObject({
        cycle_first_day: 14,
        cycle_second_day: 29
      });
      await chooseFinance(s, 'Quincenas');
      await s.page.getByLabel('Fechas del presupuesto').selectOption(uid);
      await expect(s.page.locator('.fortnight-selector').getByRole('button', {name: /Ciclo completo/})).toContainText(
        /14 oct.*13 nov/
      );
      await expect(s.page.locator('.fortnight-balance').first()).toContainText(/Q\s*150/);
      await expect(s.page.locator('.fortnight-note')).toContainText(/Fuera del presupuesto:.*Q\s*200/);
      expect(s.queries.length).toBeGreaterThan(0);
      await s.page
        .locator('.fortnight-selector')
        .getByRole('button', {name: /Segunda quincena/})
        .click();
      await expect(s.page.locator('.fortnight-balance').first()).toContainText(/Q\s*150/);
      await expect(
        s.page.locator('.fortnight-metrics').getByText('Ingreso recibido', {exact: true}).locator('..')
      ).toContainText(/Q\s*0/);
      for (const width of [320, 390, 1440]) {
        await s.page.setViewportSize({width, height: 840});
        await healthy(s);
      }
      await s.page.screenshot({path: test.info().outputPath(`cycles-${theme}.png`), fullPage: true});
      expect((await new AxeBuilder({page: s.page}).analyze()).violations).toEqual([]);
    } finally {
      await s.context.close();
    }
  });
for (const theme of ['light', 'dark'])
  test(`saving and reopening a 29–13 then 14–28 cycle retains the chosen order: ${theme}`, async ({browser}) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Ingresos');
      await s.page.getByLabel('Inicio primera quincena de Andrea').fill('29');
      await s.page.getByLabel('Inicio segunda quincena de Andrea').fill('14');
      await s.page.getByRole('button', {name: /Guardar plan de/}).click();
      await expect(s.page.getByRole('status')).toContainText('Plan mensual guardado');
      expect(s.writes.find(x => x.kind === 'plans').value.find(p => p.user_id === uid)).toMatchObject({
        cycle_first_day: 29,
        cycle_second_day: 14,
        first_half_amount: 500,
        second_half_amount: 500
      });
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Ingresos');
      await expect(s.page.getByLabel('Inicio primera quincena de Andrea')).toHaveValue('29');
      await expect(s.page.getByLabel('Inicio segunda quincena de Andrea')).toHaveValue('14');
      await chooseFinance(s, 'Quincenas');
      await s.page.getByLabel('Fechas del presupuesto').selectOption(uid);
      const selector = s.page.locator('.fortnight-selector');
      await expect(selector.getByRole('button', {name: /Ciclo completo/})).toContainText(/29 oct.*28 nov/);
      await expect(selector.getByRole('button', {name: /Primera quincena/})).toContainText(/29 oct.*13 nov/);
      await expect(selector.getByRole('button', {name: /Segunda quincena/})).toContainText(/14 nov.*28 nov/);
      for (const width of [320, 390, 1440]) {
        await s.page.setViewportSize({width, height: 840});
        await healthy(s);
      }
    } finally {
      await s.context.close();
    }
  });
test('special funding can be selected on create and edited without changing the account', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Agregar', exact: true}).click();
    const dialog = s.page.getByRole('dialog', {name: 'Nuevo movimiento'});
    await dialog.getByLabel('Descripción', {exact: true}).fill('Compra extraordinaria');
    await dialog.locator('[name="amount"]').fill('100');
    await dialog.getByLabel('Tratamiento del gasto').selectOption('false');
    await dialog.getByRole('button', {name: 'Guardar movimiento', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    expect(s.writes.find(x => x.kind === 'new').value.p_values).toMatchObject({amount: 100, budget_included: false});
    await s.page
      .locator('.transaction-row')
      .filter({hasText: 'special'})
      .getByRole('button', {name: 'Editar movimiento', exact: true})
      .click();
    const edit = s.page.getByRole('dialog', {name: 'Editar movimiento'});
    await expect(edit.getByLabel('Tratamiento del gasto')).toHaveValue('false');
    await edit.getByLabel('Tratamiento del gasto').selectOption('true');
    await edit.getByRole('button', {name: 'Guardar cambios', exact: true}).click();
    await expect(edit).toHaveCount(0);
    expect(s.writes.find(x => x.kind === 'edit').value).toMatchObject({
      budget_included: true,
      amount: 200,
      account_id: null
    });
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('a failed cycle read never shows a zero balance and can be retried', async ({browser}) => {
  const s = await fixture(browser);
  s.setFailure(true);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Quincenas');
    await s.page.getByLabel('Fechas del presupuesto').selectOption(uid);
    await expect(s.page.getByRole('alert').first()).toContainText('No pudimos verificar');
    await expect(s.page.locator('.fortnight-balance')).toHaveCount(0);
    s.setFailure(false);
    await s.page.getByRole('button', {name: 'Reintentar', exact: true}).click();
    await expect(s.page.locator('.fortnight-balance')).toBeVisible();
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
