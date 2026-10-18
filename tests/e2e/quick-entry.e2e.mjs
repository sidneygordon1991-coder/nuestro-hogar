import {test, expect} from '@playwright/test';
import {setup, ready, healthy, rid} from './support.mjs';
test('quick entry: amount first, dollars, suggestion, repeat and private', async ({browser}) => {
  const s = await setup(browser, {rich: true}),
    rpc = [],
    patches = [],
    priv = [];
  await s.page.route('**/rest/v1/finance_household_settings**', r =>
    r.fulfill({json: [{split_method: 'equal', usd_rate: 7.8}]})
  );
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r => {
    rpc.push(r.request().postDataJSON());
    return r.fulfill({json: rid});
  });
  await s.page.route('**/rest/v1/transactions?**', r => {
    if (r.request().method() === 'PATCH') {
      patches.push({url: r.request().url(), body: r.request().postDataJSON()});
      return r.fulfill({status: 204, body: ''});
    }
    return r.fallback();
  });
  await s.page.route('**/rest/v1/private_transactions**', r => {
    priv.push(r.request().postDataJSON());
    return r.fulfill({status: 201, body: ''});
  });
  try {
    await ready(s, '');
    await s.page.evaluate(() => window.dispatchEvent(new CustomEvent('nh:quick-add')));
    const dialog = s.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('group', {name: 'Repetir reciente'})).toBeVisible();
    await dialog
      .getByRole('button', {name: /^Gasto/})
      .first()
      .click();
    const amount = dialog.getByLabel('Monto', {exact: true});
    await expect(amount).toBeFocused();
    expect(await amount.getAttribute('inputmode')).toBe('decimal');
    await expect(dialog.getByRole('button', {name: 'Compartido'})).toHaveAttribute('aria-pressed', 'true');
    await amount.fill('50');
    await dialog.getByRole('button', {name: 'Dólares'}).click();
    await expect(dialog.locator('.quick-amount-convert')).toContainText('≈ Q 390');
    await dialog.getByLabel('Descripción (opcional)', {exact: true}).fill('Supermercado semanal');
    await expect(dialog.locator('select[name=category_id]')).toHaveValue('66666666-1111-4111-8111-111111111111');
    await dialog.getByRole('button', {name: 'Guardar gasto'}).click();
    await expect(dialog.locator('.quick-entry-success')).toContainText('Registrado');
    await expect(dialog.locator('.quick-entry-success')).toContainText('US$ 50 · Q 390');
    expect(rpc).toHaveLength(1);
    expect(rpc[0].p_values).toMatchObject({
      amount: 390,
      type: 'expense',
      is_shared: true,
      description: 'Supermercado semanal',
      category_id: '66666666-1111-4111-8111-111111111111',
      original_currency: 'USD',
      original_amount: 50,
      exchange_rate: 7.8
    });
    expect(patches).toHaveLength(0);
    await expect(dialog.getByRole('button', {name: 'Registrar otro'})).toBeFocused();
    await dialog.getByRole('button', {name: 'Registrar otro'}).click();
    await dialog.locator('.quick-repeat-chip').filter({hasText: 'Supermercado semanal'}).click();
    await expect(dialog.getByLabel('Monto', {exact: true})).toHaveValue('390');
    await dialog.locator('.quick-repeat-chip').filter({hasText: 'Ingreso mensual'}).click();
    await expect(dialog.getByRole('button', {name: 'Ingreso', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByLabel('Monto', {exact: true}).fill('120.5');
    await dialog.getByRole('button', {name: 'Solo yo'}).click();
    await expect(dialog).toContainText('Solo tú lo ves. No cuenta en las finanzas del hogar.');
    await expect(dialog.getByLabel('Cuenta', {exact: true})).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Guardar ingreso'}).click();
    await expect(dialog.locator('.quick-entry-success')).toContainText('Q 120.50');
    expect(rpc).toHaveLength(1);
    expect(priv).toHaveLength(1);
    expect(priv[0]).toMatchObject({amount: 120.5, type: 'income', description: 'Ingreso mensual'});
    expect(priv[0].original_currency).toBeNull();
    expect(priv[0].id).toMatch(/^[0-9a-f-]{36}$/);
    await dialog.getByRole('button', {name: 'Listo'}).click();
    await expect(dialog).toHaveCount(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('private duplicate responses are verified before confirming a saved movement', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  let saved = null,
    match = false;
  await s.page.route('**/rest/v1/private_transactions**', r => {
    if (r.request().method() === 'POST') {
      saved = r.request().postDataJSON();
      return r.fulfill({status: 409, json: {code: '23505', message: 'Duplicate id'}});
    }
    return r.fulfill({json: {...saved, amount: match ? saved.amount : 999}});
  });
  try {
    await ready(s, '');
    await s.page.evaluate(() => window.dispatchEvent(new CustomEvent('nh:quick-add')));
    const dialog = s.page.getByRole('dialog');
    await dialog
      .getByRole('button', {name: /^Gasto/})
      .first()
      .click();
    await dialog.getByLabel('Monto', {exact: true}).fill('25');
    await dialog.getByLabel('Descripción (opcional)', {exact: true}).fill('Privado QA');
    await dialog.getByRole('button', {name: 'Solo yo'}).click();
    await dialog.getByRole('button', {name: 'Guardar gasto'}).click();
    await expect(dialog.getByRole('alert')).toContainText('ya se guardó con otros datos');
    await expect(dialog.locator('.quick-entry-success')).toHaveCount(0);
    match = true;
    await dialog.getByRole('button', {name: 'Guardar gasto'}).click();
    await expect(dialog.locator('.quick-entry-success')).toContainText('Q 25');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
