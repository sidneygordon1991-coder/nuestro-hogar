import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, healthy, chooseFinance, uid, hh, rid, day} from './support.mjs';
const profile = {
  salary: 10000,
  incentive: 250,
  other_taxable: 0,
  personal_deductions: 0,
  igss: true,
  start_date: '2024-01-01',
  bono14_plan: null,
  aguinaldo_plan: null
};
const allowance = {
  id: rid,
  child_name: 'Sofía',
  child_user_id: null,
  amount: 100,
  frequency: 'weekly',
  start_date: day,
  save_percent: 30,
  give_percent: 10,
  goal_name: 'Bicicleta',
  goal_amount: 1000,
  active: true
};
const paid = {
  id: 'paid',
  allowance_id: rid,
  kind: 'payment',
  for_date: '2026-10-09',
  paid_on: '2026-10-09',
  spend_amount: 60,
  save_amount: 30,
  give_amount: 10
};
async function fixture(s) {
  await s.page.route('**/rest/v1/pay_profiles?**', r => r.fulfill({json: profile}));
  await s.page.route('**/rest/v1/allowances?**', r => r.fulfill({json: [allowance]}));
  await s.page.route('**/rest/v1/allowance_payments**', r => r.fulfill({json: [paid]}));
}
for (const theme of ['light', 'dark'])
  test(`v33 sueldo and mesada responsive accessibility: ${theme}`, async ({browser}) => {
    const s = await setup(browser, {rich: true, theme});
    await fixture(s);
    try {
      for (const tab of ['sueldo', 'mesada']) {
        await ready(s, tab);
        await expect(s.page.locator(tab === 'sueldo' ? '.pay-net' : '.allowance-card')).toBeVisible();
        for (const width of [320, 390, 1440]) {
          await s.page.setViewportSize({width, height: 844});
          await healthy(s);
        }
        const a = await new AxeBuilder({page: s.page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(
          a.violations
            .filter(v => ['critical', 'serious'].includes(v.impact))
            .map(v => ({id: v.id, nodes: v.nodes.map(n => n.target)}))
        ).toEqual([]);
      }
    } finally {
      await s.context.close();
    }
  });
test('private pay profile saves without creating income and failed reads cannot overwrite it', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  let stored = null;
  let fail = false;
  const writes = [];
  await s.page.route('**/rest/v1/pay_profiles?**', r => {
    if (r.request().method() === 'POST') {
      stored = r.request().postDataJSON();
      writes.push(stored);
      return r.fulfill({status: 201, json: null});
    }
    return fail ? r.fulfill({status: 500, json: {message: 'Unavailable'}}) : r.fulfill({json: stored});
  });
  try {
    await ready(s, 'sueldo');
    await s.page.getByLabel('Sueldo base mensual').fill('10000');
    await s.page.getByRole('button', {name: 'Calcular y guardar'}).click();
    await expect(s.page.locator('.pay-net')).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({household_id: hh, user_id: uid, salary: 10000});
    expect(s.calls.filter(c => /save_transaction|pay_finance/.test(c.path))).toHaveLength(0);
    fail = true;
    await ready(s, 'sueldo');
    await expect(s.page.getByText('No se pudieron cargar tus datos', {exact: true})).toBeVisible();
    await expect(s.page.getByRole('button', {name: 'Calcular y guardar'})).toHaveCount(0);
    expect(writes).toHaveLength(1);
    fail = false;
    await s.page.getByRole('button', {name: 'Reintentar', exact: true}).click();
    await expect(s.page.locator('.pay-net')).toBeVisible();
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('mesada retries a lost withdrawal response with one stable id and no household expense', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  await fixture(s);
  const rows = [paid];
  const writes = [];
  await s.page.route('**/rest/v1/allowance_payments**', r => {
    if (r.request().method() === 'POST') {
      const value = r.request().postDataJSON();
      writes.push(value);
      if (writes.length === 1) {
        rows.push(value);
        return r.fulfill({status: 500, json: {message: 'Lost response'}});
      }
      return r.fulfill({status: 409, json: {code: '23505', message: 'Already stored'}});
    }
    if (new URL(r.request().url()).searchParams.has('id')) return r.fulfill({json: rows.at(-1)});
    return r.fulfill({json: rows});
  });
  try {
    await ready(s, 'mesada');
    await s.page.getByRole('button', {name: 'Usar ahorro'}).click();
    const d = s.page.getByRole('dialog');
    await d.getByLabel('¿Cuánto?').fill('10');
    await d.getByRole('button', {name: 'Registrar retiro'}).click();
    await expect(s.page.getByRole('status').filter({hasText: 'No se pudo registrar el retiro.'})).toBeVisible();
    await d.getByRole('button', {name: 'Registrar retiro'}).click();
    await expect(d).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
    expect(rows).toHaveLength(2);
    await expect(s.page.locator('.allowance-jar--save')).toContainText('20');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('mesada read failure blocks mutations and a viewer only sees jars', async ({browser}) => {
  for (const access of ['edit', 'view']) {
    const s = await setup(browser, {rich: true, accessOverride: {finance: access}});
    await fixture(s);
    let fail = access === 'edit';
    await s.page.route('**/rest/v1/allowance_payments**', r =>
      fail ? r.fulfill({status: 500, json: {message: 'Unavailable'}}) : r.fulfill({json: [paid]})
    );
    try {
      await ready(s, 'mesada');
      if (fail) {
        await expect(s.page.getByRole('alert')).toContainText('No se pudo cargar');
        await expect(s.page.getByRole('button', {name: 'Nueva mesada'})).toHaveCount(0);
        fail = false;
        await s.page.getByRole('button', {name: 'Reintentar', exact: true}).click();
      }
      await expect(s.page.locator('.allowance-card')).toBeVisible();
      if (access === 'view')
        for (const name of ['Nueva mesada', 'Usar ahorro', 'Marcar pagada', 'Editar'])
          await expect(s.page.getByRole('button', {name, exact: true})).toHaveCount(0);
      await healthy(s);
    } finally {
      await s.context.close();
    }
  }
});
for (const currencyFail of [false, true])
  test(`USD account editing preserves its currency or blocks unsafe writes: currencyFailure=${currencyFail}`, async ({
    browser
  }) => {
    const s = await setup(browser, {rich: true});
    const writes = [];
    const account = {
      id: rid,
      name: 'Cuenta USD',
      account_type: 'savings',
      account_class: 'asset',
      opening_balance: 7600,
      is_shared: true,
      owner_user_id: null,
      active: true
    };
    await s.page.route('**/rest/v1/finance_accounts?**', r => {
      if (r.request().method() === 'PATCH') {
        writes.push(r.request().postDataJSON());
        return r.fulfill({status: 204, body: ''});
      }
      if (new URL(r.request().url()).searchParams.get('select') === 'id,currency,opening_balance_usd')
        return currencyFail
          ? r.fulfill({status: 500, json: {message: 'Unavailable'}})
          : r.fulfill({json: [{id: rid, currency: 'USD', opening_balance_usd: 1000}]});
      return r.fulfill({json: [account]});
    });
    await s.page.route('**/rest/v1/card_installments?**', r =>
      r.fulfill({status: 500, json: {message: 'Unavailable'}})
    );
    try {
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Cuentas');
      await s.page.getByRole('button', {name: 'Editar cuenta Cuenta USD'}).click();
      const d = s.page.getByRole('dialog', {name: 'Editar cuenta o deuda'});
      await d.getByLabel('Nombre', {exact: true}).fill('Ahorro USD');
      if (!currencyFail) {
        await expect(d.getByLabel('Moneda')).toHaveValue('USD');
        await expect(d.getByLabel('Saldo inicial / deuda actual')).toHaveValue('1000');
      }
      await d.getByRole('button', {name: /Guardar/}).click();
      if (currencyFail) {
        expect(writes).toHaveLength(0);
        await expect(d).toBeVisible();
        await expect(s.page.getByRole('status').filter({hasText: 'moneda'})).toBeVisible();
      } else {
        await expect(d).toHaveCount(0);
        expect(writes[0]).toMatchObject({currency: 'USD', opening_balance: 7600, opening_balance_usd: 1000});
      }
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });

test('master activity tolerates an incomplete response without breaking the control panel', async ({browser}) => {
  const s = await setup(browser, {rich: true, master: true, aal: 'aal2'});
  await s.page.route('**/rest/v1/rpc/get_platform_activity', r => r.fulfill({json: {weekly_active: []}}));
  try {
    await ready(s, 'master');
    await expect(s.page.getByRole('alert').filter({hasText: 'No se pudo consultar la actividad.'})).toBeVisible();
    await expect(s.page.locator('.master-family').getByRole('heading', {name: 'Familia QA'})).toBeVisible();
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
