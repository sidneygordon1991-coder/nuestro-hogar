import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, chooseFinance, healthy, hh, uid, rid, day, monthStart} from './support.mjs';
const goal = '77777777-1111-4111-8111-111111111111',
  saving = '99999999-1111-4111-8111-111111111111',
  food = '66666666-1111-4111-8111-111111111111';
async function fixture(browser, {theme = 'light', readOnly = false, lostResponse = false} = {}) {
  const s = await setup(browser, {
    rich: true,
    theme,
    ...(readOnly
      ? {
          accessOverride: Object.fromEntries(
            [
              'finance',
              'calendar',
              'lists',
              'documents',
              'meals',
              'maintenance',
              'planning',
              'health',
              'monthly_close',
              'automations',
              'backups',
              'diagnostics'
            ].map(m => [m, 'view'])
          )
        }
      : {})
  });
  const links = [],
    checkouts = [],
    linkedItems = [],
    comparisons = [],
    requests = [];
  let expenseCount = 0,
    failCheckout = lostResponse,
    stale = false,
    book = 980,
    fingerprint = 'a'.repeat(32);
  const items = [
    {
      id: 'item-done',
      list_id: rid,
      text: 'Leche y café',
      quantity: '2 unidades',
      completed: true,
      sort_order: 0,
      routine_frequency: 'none',
      routine_members: []
    },
    {
      id: 'item-pending',
      list_id: rid,
      text: 'Arroz',
      quantity: '1 kg',
      completed: false,
      sort_order: 1,
      routine_frequency: 'none',
      routine_members: []
    }
  ];
  await s.page.route('**/rest/v1/rpc/get_connected_finance_capability', r => r.fulfill({json: true}));
  await s.page.route('**/rest/v1/budget_categories?**', r => {
    const cats = [
      {id: food, name: 'Alimentación', icon: 'food', budget_group: 'variable'},
      {id: saving, name: 'Ahorro familiar', icon: 'saving', budget_group: 'saving'}
    ];
    return r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get('budget_group') === 'neq.saving'
          ? cats.filter(c => c.budget_group !== 'saving')
          : cats
    });
  });
  await s.page.route('**/rest/v1/budget_allocations?**', r =>
    r.fulfill({
      json: [
        {id: 'budget-food', category_id: food, planned_amount: 4000, month: monthStart},
        {id: 'budget-saving', category_id: saving, planned_amount: 1000, month: monthStart}
      ]
    })
  );
  await s.page.route('**/rest/v1/goal_contributions?**', r =>
    r.fulfill({
      json: [
        {id: 'deposit', goal_id: goal, amount: 100, contribution_date: day, created_by: uid},
        {id: 'withdrawal', goal_id: goal, amount: -20, contribution_date: day, created_by: uid}
      ]
    })
  );
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      json: [
        {
          id: rid,
          name: 'Cuenta familiar',
          account_type: 'checking',
          account_class: 'asset',
          opening_balance: 1000,
          active: true,
          is_shared: true,
          owner_user_id: uid
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/lists?**', r =>
    r.fulfill({
      json: [
        {id: rid, title: 'Supermercado', list_type: 'shopping', is_pinned: false, shopping_week: null, created_at: day}
      ]
    })
  );
  await s.page.route('**/rest/v1/list_items?**', r => r.fulfill({json: items}));
  await s.page.route('**/rest/v1/shopping_checkouts?**', r => r.fulfill({json: checkouts}));
  await s.page.route('**/rest/v1/shopping_checkout_items?**', r => r.fulfill({json: linkedItems}));
  await s.page.route('**/rest/v1/goal_budget_links?**', async r => {
    if (r.request().method() === 'POST') {
      const p = r.request().postDataJSON();
      links.splice(0, links.length, p);
      requests.push({kind: 'link', body: p});
      await r.fulfill({status: 204, body: ''});
    } else await r.fulfill({json: links});
  });
  await s.page.route('**/rest/v1/rpc/checkout_shopping_purchase', async r => {
    const p = r.request().postDataJSON();
    requests.push({kind: 'checkout', body: p});
    if (!checkouts.length) {
      expenseCount++;
      checkouts.push({id: p.p_request_id, list_id: rid, transaction_id: rid});
      linkedItems.push(...p.p_item_ids.map(item_id => ({item_id, checkout_id: p.p_request_id})));
    }
    if (failCheckout) {
      failCheckout = false;
      await r.fulfill({status: 503, json: {message: 'Respuesta interrumpida. Reintenta para confirmar sin duplicar.'}});
    } else await r.fulfill({json: rid});
  });
  await s.page.route('**/rest/v1/rpc/get_account_book_state', r =>
    r.fulfill({json: {balance: book, fingerprint, transaction_count: 2, transfer_count: 1}})
  );
  await s.page.route('**/rest/v1/account_reconciliations?**', r => r.fulfill({json: comparisons}));
  await s.page.route('**/rest/v1/rpc/confirm_account_reconciliation', async r => {
    const p = r.request().postDataJSON();
    requests.push({kind: 'reconcile', body: p});
    if (stale) {
      stale = false;
      book = 970;
      fingerprint = 'b'.repeat(32);
      await r.fulfill({status: 400, json: {message: 'La cuenta cambió. Actualiza el cálculo antes de confirmar.'}});
      return;
    }
    comparisons.push({
      id: p.p_request_id,
      cutoff: p.p_cutoff,
      confirmed_balance: p.p_confirmed_balance,
      book_balance: book,
      fingerprint,
      notes: p.p_notes,
      created_at: day,
      source: 'confirmation'
    });
    await r.fulfill({json: p.p_request_id});
  });
  return {
    ...s,
    requests,
    expenseCount: () => expenseCount,
    setStale: () => {
      stale = true;
    }
  };
}

for (const theme of ['light', 'dark'])
  test(`purchase checkout survives a lost response and opens evidence without another expense: ${theme}`, async ({
    browser
  }, testInfo) => {
    const s = await fixture(browser, {theme, lostResponse: true});
    try {
      await ready(s, 'listas');
      await s.page.locator('.list-card-v2').filter({hasText: 'Supermercado'}).click();
      await s.page.getByRole('button', {name: 'Registrar gasto', exact: true}).click();
      const dialog = s.page.locator('.connected-dialog');
      await expect(dialog.getByText('Leche y café · 2 unidades', {exact: true})).toBeVisible();
      await expect(dialog.getByText('Arroz')).toHaveCount(0);
      await dialog.getByLabel('Total pagado (Q)', {exact: true}).fill('125.50');
      await dialog.getByRole('button', {name: 'Confirmar gasto y adjuntar comprobante', exact: true}).click();
      await expect(dialog.getByRole('alert')).toContainText('Reintenta');
      await expect(dialog.getByLabel('Total pagado (Q)', {exact: true})).toHaveValue('125.50');
      await dialog.getByRole('button', {name: 'Confirmar gasto y adjuntar comprobante', exact: true}).click();
      await expect(dialog.getByRole('heading', {name: 'Compra registrada', exact: true})).toBeVisible();
      await expect(dialog.getByRole('button', {name: 'Elegir archivos', exact: true})).toBeVisible();
      expect(s.expenseCount()).toBe(1);
      const calls = s.requests.filter(r => r.kind === 'checkout');
      expect(calls).toHaveLength(2);
      expect(calls[0].body.p_request_id).toBe(calls[1].body.p_request_id);
      expect(calls[0].body.p_item_ids).toEqual(['item-done']);
      for (const width of [320, 390, 768, 1280]) {
        await s.page.setViewportSize({width, height: 740});
        await healthy(s);
      }
      const axe = await new AxeBuilder({page: s.page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.filter(v => ['critical', 'serious'].includes(v.impact))).toEqual([]);
      await testInfo.attach('purchase-' + theme, {body: await s.page.screenshot(), contentType: 'image/png'});
      await dialog.getByRole('button', {name: 'Finalizar', exact: true}).click();
      await expect(s.page.getByRole('button', {name: 'Registrar gasto', exact: true})).toBeDisabled();
      await expect(s.page.getByText('Compra vinculada a Finanzas')).toBeVisible();
      await s.page.getByRole('button', {name: 'Ver comprobantes de la compra', exact: true}).click();
      await expect(s.page.getByRole('heading', {name: 'Comprobantes de compra', exact: true})).toBeVisible();
    } finally {
      await s.context.close();
    }
  });

test('goal-to-budget links count net deposits once and retain their selected month', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Presupuesto');
    await s.page.getByLabel('Rubro de ahorro de Nuestro próximo viaje', {exact: true}).selectOption(saving);
    const card = s.page.getByRole('region', {name: 'Presupuesto de Ahorro familiar', exact: true});
    await expect(card).toContainText('Q\u00a080');
    await expect(card).toContainText('Q\u00a0920');
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    expect(s.requests.find(r => r.kind === 'link').body.month).toBe(monthStart);
    expect(s.requests.filter(r => r.kind === 'checkout')).toHaveLength(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('reconciliation retains input on stale data and records a comparison without adjusting money', async ({
  browser
}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Cuentas');
    await s.page.getByRole('button', {name: 'Conciliar Cuenta familiar', exact: true}).click();
    const dialog = s.page.locator('.connected-dialog');
    await expect(dialog.locator('.connected-balance')).toContainText('Q\u00a0980');
    await dialog.getByLabel('Saldo confirmado (Q)', {exact: true}).fill('975.50');
    s.setStale();
    await dialog.getByRole('button', {name: 'Confirmar comparación', exact: true}).click();
    await expect(dialog.getByRole('alert')).toContainText('cambió');
    await expect(dialog.getByLabel('Saldo confirmado (Q)', {exact: true})).toHaveValue('975.50');
    await dialog.getByRole('button', {name: 'Actualizar cálculo', exact: true}).click();
    await expect(dialog.locator('.connected-balance')).toContainText('Q\u00a0970');
    await dialog.getByRole('button', {name: 'Confirmar comparación', exact: true}).click();
    await expect(dialog.locator('.connected-success[role="status"]')).toContainText('No se creó ningún ajuste');
    await expect(dialog.locator('.reconciliation-history')).toContainText('975.50');
    expect(s.expenseCount()).toBe(0);
    expect(s.requests.filter(r => r.kind === 'reconcile')).toHaveLength(2);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('view-only access can inspect reconciliation but cannot confirm or link savings', async ({browser}) => {
  const s = await fixture(browser, {readOnly: true});
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Presupuesto');
    await expect(s.page.getByLabel('Rubro de ahorro de Nuestro próximo viaje', {exact: true})).toBeDisabled();
    await chooseFinance(s, 'Cuentas');
    await s.page.getByRole('button', {name: 'Conciliar Cuenta familiar', exact: true}).click();
    await expect(s.page.getByRole('button', {name: 'Confirmar comparación', exact: true})).toHaveCount(0);
    expect(s.requests).toHaveLength(0);
  } finally {
    await s.context.close();
  }
});

test('the decision simulator changes only a hypothetical result', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await s.page.locator('.finance-simulator summary').click();
    const panel = s.page.locator('.finance-simulator');
    const before = await panel.locator('.simulation-result>div').first().locator('strong').innerText();
    await panel.getByLabel('Ingreso adicional (Q)', {exact: true}).fill('200');
    await panel.getByLabel('Gasto adicional (Q)', {exact: true}).fill('100');
    await expect(panel.locator('.simulation-result p')).toContainText('Q\u00a0100');
    await panel.getByRole('button', {name: 'Restablecer escenario', exact: true}).click();
    await expect(panel.locator('.simulation-result>div').last().locator('strong')).toHaveText(before);
    expect(s.requests).toHaveLength(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
