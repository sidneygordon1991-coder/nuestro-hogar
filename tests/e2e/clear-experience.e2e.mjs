import {test, expect} from '@playwright/test';
import {setup, ready, healthy, rid, uid} from './support.mjs';
const bank = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'Cuenta de prueba',
  account_type: 'checking',
  account_class: 'asset',
  active: true,
  opening_balance: 100
};
for (const theme of ['light', 'dark'])
  test(`the period budget leads the phone home with distinct recorded money: ${theme}`, async ({browser}) => {
    const s = await setup(browser, {rich: true, theme});
    try {
      await ready(s, '');
      const budget = s.page.getByRole('region', {name: 'Presupuesto restante', exact: true});
      await expect(budget.locator('.home-budget-remaining')).toContainText('Q');
      const a = await budget.locator('.home-budget-remaining').boundingBox(),
        b = await s.page.locator('.home-liquid-total').boundingBox();
      expect(a.y).toBeLessThan(b.y);
      expect(a.y + a.height).toBeLessThan(700);
      await expect(s.page.locator('.home-overview-details')).not.toHaveAttribute('open', '');
      await s.page.screenshot({path: test.info().outputPath(`home-${theme}.png`), fullPage: true});
      await healthy(s);
      await ready(s, 'presupuesto');
      await expect(s.page.locator('.finance-tabs>button')).toHaveCount(3);
      await s.page.locator('.finance-more>summary').click();
      await s.page
        .getByRole('group', {name: 'Más secciones financieras', exact: true})
        .getByRole('button', {name: 'Ingresos', exact: true})
        .click();
      await expect(s.page.getByRole('heading', {name: 'Lo que esperamos recibir'})).toBeVisible();
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });

test('quick entry remembers confirmed category and account and preserves a failed draft', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  let fail = false;
  await s.page.route('**/rest/v1/finance_accounts?**', r => r.fulfill({json: [bank]}));
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r =>
    r.fulfill({status: fail ? 500 : 200, json: fail ? {message: 'No se confirmó el movimiento'} : rid})
  );
  try {
    await ready(s, '');
    await s.page.evaluate(() => window.dispatchEvent(new CustomEvent('nh:quick-add')));
    const d = s.page.getByRole('dialog');
    await d
      .getByRole('button', {name: /^Gasto/})
      .first()
      .click();
    await d.getByLabel('Monto', {exact: true}).fill('42.5');
    await d.locator('select[name=category_id]').selectOption('66666666-1111-4111-8111-111111111111');
    await d.getByLabel('Cuenta', {exact: true}).selectOption(bank.id);
    await d.getByRole('button', {name: 'Guardar gasto', exact: true}).click();
    await expect(d.locator('.quick-entry-success')).toContainText('Gasto en Alimentación');
    await d.getByRole('button', {name: 'Registrar otro', exact: true}).click();
    await expect(d.getByLabel('Cuenta', {exact: true})).toHaveValue(bank.id);
    await expect(d.locator('select[name=category_id]')).toHaveValue('66666666-1111-4111-8111-111111111111');
    fail = true;
    await d.getByLabel('Monto', {exact: true}).fill('26');
    await d.getByRole('button', {name: 'Guardar gasto', exact: true}).click();
    await expect(d.getByRole('alert')).toContainText('No se confirmó');
    await expect(d.getByLabel('Monto', {exact: true})).toHaveValue('26');
    await expect(d.getByLabel('Cuenta', {exact: true})).toHaveValue(bank.id);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('the three starting steps reflect configured accounts, income and budget', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  let stage = 0;
  const empty = Object.fromEntries(
    [
      'transactions',
      'categories',
      'allocations',
      'contributions',
      'recurring',
      'occurrences',
      'member_settings',
      'goals',
      'goal_contributions',
      'plans',
      'members',
      'splits',
      'settlements',
      'private'
    ].map(k => [k, []])
  );
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      status: stage === 5 ? 500 : 200,
      json: stage === 5 ? {message: 'Sin conexión'} : stage >= 1 && stage !== 4 ? [bank] : []
    })
  );
  await s.page.route('**/rest/v1/rpc/get_home_finance_source', r =>
    r.fulfill({
      json: {
        ...empty,
        members: stage === 6 ? [{user_id: uid}, {user_id: 'another-member'}] : [{user_id: uid}],
        plans: stage >= 2 ? [{user_id: uid, month: '2026-10-01', expected_amount: 0}] : [],
        allocations: stage >= 3 ? [{category_id: 'food', month: '2026-10-01', planned_amount: 0}] : []
      }
    })
  );
  try {
    for (stage = 0; stage < 3; stage++) {
      await ready(s, '');
      await expect(s.page.locator('.home-getting-started-head')).toContainText(`${stage} de 3 listos`);
      await healthy(s);
    }
    await ready(s, '');
    await expect(s.page.locator('.home-getting-started')).toHaveCount(0);
    stage = 4;
    await ready(s, '');
    await expect(s.page.locator('.home-getting-started-head')).toContainText('2 de 3 listos');
    await expect(s.page.getByRole('button', {name: 'Agregar mis cuentas', exact: true})).toBeVisible();
    stage = 5;
    await ready(s, '');
    await expect(s.page.getByRole('button', {name: 'Reintentar cuentas', exact: true})).toBeVisible();
    await expect(s.page.locator('.home-getting-started')).toHaveCount(0);
    stage = 6;
    await ready(s, '');
    await expect(s.page.locator('.home-getting-started-head')).toContainText('2 de 3 listos');
    await expect(s.page.getByRole('button', {name: 'Configurar mis ingresos', exact: true})).toBeVisible();
  } finally {
    await s.context.close();
  }
});
