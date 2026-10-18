import {test, expect} from '@playwright/test';
import {setup, ready, chooseFinance, healthy, uid, hh} from './support.mjs';
const partner = '55555555-5555-4555-8555-555555555555',
  card = 'aaaaaaaa-1111-4111-8111-111111111111',
  loan = 'aaaaaaaa-2222-4222-8222-222222222222',
  cash = 'aaaaaaaa-3333-4333-8333-333333333333';

async function fixture(browser, opts = {}) {
  const s = await setup(browser, {rich: true, ...opts});
  const posts = {settlements: [], transactions: [], patches: [], splits: [], members: [], household: [], rpc: []};
  let settlements = [];
  const monthTx = [
    {
      id: 'tx-shared',
      description: 'Supermercado La Torre',
      amount: 1000,
      type: 'expense',
      transaction_date: '2026-10-10',
      category_id: null,
      paid_by: uid,
      account_id: null,
      is_shared: true,
      notes: null,
      recurring_transaction_id: null,
      original_currency: null,
      original_amount: null,
      exchange_rate: null
    },
    {
      id: 'tx-usd',
      description: 'Suscripción streaming',
      amount: 387.5,
      type: 'expense',
      transaction_date: '2026-10-12',
      category_id: null,
      paid_by: partner,
      account_id: null,
      is_shared: false,
      notes: null,
      recurring_transaction_id: null,
      original_currency: 'USD',
      original_amount: 50,
      exchange_rate: 7.75
    },
    {
      id: 'tx-income',
      description: 'Salario',
      amount: 9000,
      type: 'income',
      transaction_date: '2026-10-05',
      category_id: null,
      paid_by: uid,
      account_id: null,
      is_shared: true,
      notes: null,
      recurring_transaction_id: null,
      original_currency: null,
      original_amount: null,
      exchange_rate: null
    }
  ];
  const object = r => (r.request().headers().accept || '').includes('object');
  await s.page.route('**/rest/v1/profiles?**', r =>
    r.fulfill({
      json: object(r)
        ? {id: uid, full_name: 'Andrea'}
        : [
            {id: uid, full_name: 'Andrea'},
            {id: partner, full_name: 'Sidney'}
          ]
    })
  );
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      json: [
        {
          id: cash,
          name: 'Cuenta BI',
          account_type: 'checking',
          account_class: 'asset',
          opening_balance: 5000,
          owner_user_id: null,
          is_shared: true,
          active: true,
          institution: null,
          credit_limit: null,
          statement_day: null,
          payment_due_day: null,
          apr: null,
          minimum_payment: null,
          notes: null
        },
        {
          id: card,
          name: 'Visa Oro',
          account_type: 'credit',
          account_class: 'liability',
          opening_balance: 3000,
          owner_user_id: uid,
          is_shared: true,
          active: true,
          institution: 'Banco',
          credit_limit: 10000,
          statement_day: 5,
          payment_due_day: 25,
          apr: 48,
          minimum_payment: null,
          notes: null
        },
        {
          id: loan,
          name: 'Préstamo carro',
          account_type: 'loan',
          account_class: 'liability',
          opening_balance: 20000,
          owner_user_id: null,
          is_shared: true,
          active: true,
          institution: null,
          credit_limit: null,
          statement_day: null,
          payment_due_day: 15,
          apr: 36,
          minimum_payment: 500,
          notes: null
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/finance_transfers?**', r => r.fulfill({json: []}));
  await s.page.route('**/rest/v1/transactions?**', async r => {
    const req = r.request(),
      url = new URL(req.url()),
      select = url.searchParams.get('select') || '';
    if (req.method() === 'POST') {
      const rows = req.postDataJSON();
      posts.transactions.push(rows);
      return r.fulfill({
        status: 201,
        json: rows.map((x, i) => ({id: 'new-' + posts.transactions.length + '-' + i, ...x}))
      });
    }
    if (req.method() === 'PATCH') {
      posts.patches.push({id: url.searchParams.get('id'), body: req.postDataJSON()});
      return r.fulfill({status: 204, body: ''});
    }
    if (select.startsWith('account_id,type,amount,transaction_date'))
      return r.fulfill({
        json: [
          {account_id: card, type: 'expense', amount: 500, transaction_date: '2026-09-20'},
          {account_id: card, type: 'expense', amount: 200, transaction_date: '2026-10-10'}
        ]
      });
    if (select.includes('original_currency')) return r.fulfill({json: monthTx});
    if (select === 'transaction_date,amount,description,type')
      return r.fulfill({
        json: [{transaction_date: '2026-10-02', amount: 125.5, description: 'SUPER LA TORRE Z10', type: 'expense'}]
      });
    return r.fallback();
  });
  await s.page.route('**/rest/v1/transaction_splits?**', r => {
    const req = r.request();
    if (req.method() === 'POST') {
      posts.splits.push(req.postDataJSON());
      return r.fulfill({status: 201, body: ''});
    }
    return r.fulfill({
      json: [
        {transaction_id: 'tx-shared', user_id: uid, share_amount: 500},
        {transaction_id: 'tx-shared', user_id: partner, share_amount: 500},
        {transaction_id: 'tx-usd', user_id: partner, share_amount: 387.5}
      ]
    });
  });
  await s.page.route('**/rest/v1/finance_settlements*', r => {
    const req = r.request(),
      url = new URL(req.url());
    if (req.method() === 'POST') {
      const row = req.postDataJSON();
      posts.settlements.push(row);
      settlements.push({id: 'set-' + settlements.length, created_at: '2026-10-16T12:00:00Z', note: null, ...row});
      return r.fulfill({status: 201, body: ''});
    }
    if (req.method() === 'DELETE') {
      const id = url.searchParams.get('id').slice(3);
      settlements = settlements.filter(x => x.id !== id);
      return r.fulfill({status: 204, body: ''});
    }
    return r.fulfill({json: settlements.filter(x => 'eq.' + x.period_month === url.searchParams.get('period_month'))});
  });
  await s.page.route('**/rest/v1/finance_member_settings?**', r => {
    const req = r.request();
    if (req.method() === 'POST') {
      posts.members.push(req.postDataJSON());
      return r.fulfill({status: 201, body: ''});
    }
    return r.fulfill({
      json: [
        {user_id: uid, monthly_income: 9000, custom_share_percent: 50, first_pay_day: null, second_pay_day: null},
        {user_id: partner, monthly_income: 6000, custom_share_percent: 50, first_pay_day: 10, second_pay_day: 25}
      ]
    });
  });
  await s.page.route('**/rest/v1/finance_household_settings?**', r => {
    const req = r.request();
    if (req.method() === 'POST') {
      posts.household.push(req.postDataJSON());
      return r.fulfill({status: 201, body: ''});
    }
    const row = {household_id: hh, split_method: 'equal', usd_rate: 7.8};
    return r.fulfill({json: object(r) ? row : [row]});
  });
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r => {
    posts.rpc.push(r.request().postDataJSON());
    return r.fulfill({json: 'saved-tx-1'});
  });
  await s.page.route('**/rest/v1/rpc/import_finance_transactions_once', r => {
    const entries = r.request().postDataJSON().p_entries;
    const rows = entries.map(e => ({household_id: hh, ...e.values, transaction_date: e.values.date}));
    posts.transactions.push(rows);
    return r.fulfill({json: {transaction_ids: entries.map(e => e.request_id)}});
  });
  await s.page.route('**/rest/v1/rpc/finance_split_weights', r =>
    r.fulfill({
      json: [
        {user_id: uid, ratio: 0.5},
        {user_id: partner, ratio: 0.5}
      ]
    })
  );
  return {...s, posts};
}

test('settlements: suggestion, mark as paid, custom amount and history', async ({browser}) => {
  const s = await fixture(browser);
  s.page.on('dialog', d => d.accept());
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Aportes');
  const panel = s.page.getByRole('region', {name: 'Liquidar entre ustedes'});
  await expect(panel.locator('.settlement-suggestion')).toHaveText(/Sidney le paga Q\s500 a Andrea/);

  await panel.getByRole('button', {name: /Marcar como pagado/}).click();
  await expect(panel.getByText('Están a mano', {exact: false})).toBeVisible();
  expect(s.posts.settlements[0]).toMatchObject({
    household_id: hh,
    from_user_id: partner,
    to_user_id: uid,
    amount: 500,
    period_month: '2026-10-01',
    created_by: uid,
    note: null
  });
  await panel.getByRole('button', {name: 'Registrar otro monto'}).click();
  await panel.getByLabel('Monto (Q)').fill('0');
  await panel.getByRole('button', {name: 'Registrar pago'}).click();
  await expect(panel.getByRole('alert')).toContainText('mayor que cero');
  await panel.getByLabel('Paga').selectOption(uid);
  await panel.getByLabel('Recibe').selectOption(uid);
  await panel.getByLabel('Monto (Q)').fill('120.50');
  await panel.getByRole('button', {name: 'Registrar pago'}).click();
  await expect(panel.getByRole('alert')).toContainText('dos personas diferentes');
  await panel.getByLabel('Recibe').selectOption(partner);
  await panel.getByLabel('Nota').fill('Efectivo');
  await panel.getByRole('button', {name: 'Registrar pago'}).click();
  await expect(panel.locator('.settlement-suggestion')).toHaveText(/Sidney le paga Q\s120.50 a Andrea/);
  expect(s.posts.settlements[1]).toMatchObject({
    from_user_id: uid,
    to_user_id: partner,
    amount: 120.5,
    note: 'Efectivo'
  });
  await expect(panel.locator('.settlement-history-row')).toHaveCount(2);

  await panel.getByRole('button', {name: /Eliminar pago de Andrea a Sidney/}).click();
  await expect(panel.locator('.settlement-history-row')).toHaveCount(1);
  await healthy(s);
  await s.context.close();
});

test('settlements are hidden for a single member and read-only hides edit controls', async ({browser}) => {
  const s = await fixture(browser, {
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
  });
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Aportes');
  const panel = s.page.getByRole('region', {name: 'Liquidar entre ustedes'});
  await expect(panel.locator('.settlement-suggestion')).toHaveText(/Sidney le paga Q\s500 a Andrea/);
  await expect(panel.getByRole('button')).toHaveCount(0);
  await chooseFinance(s, 'Movimientos');
  await expect(s.page.getByRole('button', {name: 'Importar estado de cuenta'})).toHaveCount(0);
  await healthy(s);
  await s.context.close();
});

test('accounts: card status line and debt planner', async ({browser}) => {
  const s = await fixture(browser);
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Cuentas');
  const status = s.page.locator('.account-card-status');
  await expect(status).toHaveCount(1);
  await expect(status).toContainText('Corte el 5 oct');
  await expect(status).toContainText('Pago el 25 oct');
  await expect(status).toContainText('Para no pagar intereses: Q 3,500');
  const planner = s.page.getByRole('region', {name: '¿Qué deuda pagar primero?'});
  await expect(planner.getByRole('article', {name: 'Plan Avalancha'})).toBeVisible();
  await expect(planner.getByRole('article', {name: 'Plan Bola de nieve'})).toBeVisible();
  await expect(planner).toContainText('Con este pago mínimo la deuda no baja');
  await expect(planner).toContainText('(estimado)');
  await expect(planner.getByRole('status')).toContainText('ninguna estrategia liquida');
  await expect(planner.getByRole('article', {name: 'Plan Avalancha'})).toContainText('Sin límite');
  await planner.getByLabel('Pago extra mensual (Q)').fill('1500');
  await expect(planner.getByRole('article', {name: 'Plan Avalancha'})).toContainText('Sin deudas en');
  await expect(planner.getByRole('status')).toContainText(/Avalancha te ahorra|ambos métodos/);

  await planner.getByLabel('Pago extra mensual (Q)').fill('-5');
  await expect(planner.getByRole('alert')).toBeVisible();

  await healthy(s);
  await s.context.close();
});

test('dollar entries: list, new and edit', async ({browser}) => {
  const s = await fixture(browser);
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Movimientos');
  await expect(s.page.locator('.transaction-row').filter({hasText: 'Suscripción streaming'})).toContainText(
    'US$ 50 · Q 387.50'
  );
  await s.page.getByRole('button', {name: 'Agregar', exact: true}).click();
  const dialog = s.page.getByRole('dialog', {name: 'Nuevo movimiento', exact: true});
  await dialog.getByLabel('Monto', {exact: true}).fill('50');
  await dialog.getByLabel('Moneda').selectOption('USD');
  await expect(dialog.locator('.currency-amount-hint')).toContainText('≈ Q 390');
  await dialog.getByLabel('Descripción', {exact: true}).fill('Hosting');

  await dialog.getByRole('button', {name: 'Guardar movimiento', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(s.posts.rpc[0].p_values.amount).toBe(390);
  expect(Object.keys(s.posts.rpc[0].p_values)).not.toContain('currency');
  expect(s.posts.rpc[0].p_values).toMatchObject({original_currency: 'USD', original_amount: 50, exchange_rate: 7.8});
  expect(s.posts.patches).toHaveLength(0);
  // Edit the dollar entry: amount in dollars is prefilled with its own rate; switching to Q clears the three fields.
  await s.page
    .locator('.transaction-row')
    .filter({hasText: 'Suscripción streaming'})
    .getByRole('button', {name: 'Editar movimiento'})
    .click();
  const edit = s.page.getByRole('dialog', {name: 'Editar movimiento', exact: true});
  await expect(edit.getByLabel('Monto', {exact: true})).toHaveValue('50');
  await expect(edit.getByLabel('Moneda')).toHaveValue('USD');
  await expect(edit.getByLabel('Tipo de cambio (Q por US$)')).toHaveValue('7.75');
  await edit.getByLabel('Monto', {exact: true}).fill('60');
  await expect(edit.locator('.currency-amount-hint')).toContainText('≈ Q 465');
  await edit.getByRole('button', {name: 'Guardar cambios'}).click();
  await expect(edit).toHaveCount(0);
  expect(s.posts.patches[0].body).toMatchObject({
    amount: 465,
    original_currency: 'USD',
    original_amount: 60,
    exchange_rate: 7.75
  });
  await s.page
    .locator('.transaction-row')
    .filter({hasText: 'Suscripción streaming'})
    .getByRole('button', {name: 'Editar movimiento'})
    .click();
  await edit.getByLabel('Moneda').selectOption('GTQ');
  await edit.getByLabel('Monto', {exact: true}).fill('400');
  await edit.getByRole('button', {name: 'Guardar cambios'}).click();
  await expect(edit).toHaveCount(0);
  expect(s.posts.patches[1].body).toMatchObject({
    amount: 400,
    original_currency: null,
    original_amount: null,
    exchange_rate: null
  });
  await healthy(s);
  await s.context.close();
});

test('bank statement import: mapping, preview, duplicates and chunked insert', async ({browser}) => {
  const s = await fixture(browser);
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Movimientos');
  await s.page.getByRole('button', {name: 'Importar estado de cuenta'}).click();
  const dialog = s.page.getByRole('dialog', {name: 'Importar estado de cuenta'});
  const lines = [
    'Banco Ejemplo S.A.',
    'Fecha;Descripción;Débito;Crédito;Saldo',
    '01/10/2026;Farmacia Galeno;85,00;;4.915,00',
    '02/10/2026;Super La Torre;125,50;;4.789,50',
    '03/10/2026;Depósito salario;;8.500,00;13.289,50',
    '32/10/2026;Fila mala;10,00;;',
    '04/10/2026;Gasolinera;"1.234,56";;'
  ];
  for (let i = 0; i < 120; i++) lines.push(`05/10/2026;Compra ${i + 1};10,00;;`);
  await dialog
    .locator('input[type=file]')
    .setInputFiles({name: 'estado.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + lines.join('\r\n'))});
  await expect(dialog.getByLabel('Fila de encabezados')).toHaveValue('1');
  await expect(dialog.getByLabel('Débito (gasto)')).toHaveValue('2');
  await expect(dialog.locator('.import-counts')).toContainText('124 válidas');
  await expect(dialog.locator('.import-counts')).toContainText('1 posibles duplicados');
  await expect(dialog.locator('.import-counts')).toContainText('123 seleccionadas');
  await expect(dialog.locator('.import-row.duplicate')).toContainText('Posible duplicado de “SUPER LA TORRE Z10”');

  await dialog.getByText('Ver 1 fila omitida y el motivo').click();
  await expect(dialog.locator('.import-skipped')).toContainText('Línea 6: Fecha no válida: 32/10/2026');
  await dialog.getByLabel('Categoría de los gastos').selectOption({index: 2});
  await dialog.getByRole('button', {name: /^Importar 123 movimientos/}).click();
  await expect(dialog.locator('.tools-success')).toContainText('se importaron 123 movimientos');
  expect(s.posts.transactions.map(b => b.length)).toEqual([100, 23]);
  const first = s.posts.transactions[0][0];
  expect(first).toMatchObject({
    household_id: hh,
    description: 'Farmacia Galeno',
    amount: 85,
    type: 'expense',
    transaction_date: '2026-10-01',
    paid_by: uid,
    is_shared: true,
    account_id: null
  });
  expect(first.category_id).toBeTruthy();
  expect(s.posts.transactions[0].find(r => r.type === 'income')).toMatchObject({amount: 8500, category_id: null});

  await dialog.getByRole('button', {name: 'Cerrar', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  await healthy(s);
  await s.context.close();
});

test('import reports a partial failure', async ({browser}) => {
  const s = await fixture(browser);
  let n = 0;
  await s.page.route('**/rest/v1/rpc/import_finance_transactions_once', async r => {
    if (++n === 2) return r.fulfill({status: 400, json: {message: 'violates check constraint'}});
    return r.fallback();
  });
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Movimientos');
  await s.page.getByRole('button', {name: 'Importar estado de cuenta'}).click();
  const dialog = s.page.getByRole('dialog', {name: 'Importar estado de cuenta'});
  const lines = ['date,description,amount'];
  for (let i = 0; i < 150; i++) lines.push(`2026-10-0${1 + (i % 9)},Item ${i},(${i + 1}.00)`);
  await dialog
    .locator('input[type=file]')
    .setInputFiles({name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n'))});
  await dialog.getByRole('button', {name: /^Importar 150 movimientos/}).click();
  await expect(dialog.getByRole('alert')).toContainText('Se importaron 100 de 150 movimientos');
  await expect(dialog.getByRole('alert')).toContainText('El bloque 2 de 2 no se confirmó');
  await healthy(s);
  await s.context.close();
});

test('income: pay days and dollar rate', async ({browser}) => {
  const s = await fixture(browser);
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Ingresos');
  const panel = s.page.getByRole('region', {name: 'Cuándo cobra cada quien'});
  await expect(panel.getByLabel('Día de cobro de la primera quincena de Andrea')).toHaveValue('15');
  await expect(panel.getByLabel('Día de cobro de la segunda quincena de Andrea')).toHaveValue('31');
  await expect(panel.getByLabel('Día de cobro de la primera quincena de Sidney')).toHaveValue('10');
  await expect(panel.getByLabel('Tipo de cambio (Q por US$)')).toHaveValue('7.8');
  await panel.getByLabel('Día de cobro de la primera quincena de Andrea').fill('20');
  await panel.getByRole('button', {name: 'Guardar días de cobro y tipo de cambio'}).click();
  await expect(panel.getByRole('alert')).toContainText('Andrea: El día de cobro de la primera quincena');
  await panel.getByLabel('Día de cobro de la primera quincena de Andrea').fill('1');
  await panel.getByLabel('Día de cobro de la segunda quincena de Andrea').selectOption('16');
  await panel.getByLabel('Tipo de cambio (Q por US$)').fill('150');
  await panel.getByRole('button', {name: 'Guardar días de cobro y tipo de cambio'}).click();
  await expect(panel.getByRole('alert')).toContainText('entre Q 1 y Q 100');
  await panel.getByLabel('Tipo de cambio (Q por US$)').fill('7.6543');
  await panel.getByRole('button', {name: 'Guardar días de cobro y tipo de cambio'}).click();
  await expect(panel.getByRole('status')).toContainText('guardados');
  expect(s.posts.members[0].map(r => [r.user_id, r.first_pay_day, r.second_pay_day])).toEqual([
    [uid, 1, 16],
    [partner, 10, 25]
  ]);
  expect(Object.keys(s.posts.members[0][0]).sort()).toEqual([
    'first_pay_day',
    'household_id',
    'second_pay_day',
    'updated_at',
    'user_id'
  ]);
  expect(s.posts.household[0]).toMatchObject({household_id: hh, usd_rate: 7.6543});

  await chooseFinance(s, 'Quincenas').catch(() => {});
  await healthy(s);
  await s.context.close();
});

test('CSV cannot import until duplicate verification succeeds', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await s.page.route('**/rest/v1/transactions?**', r =>
      new URL(r.request().url()).searchParams.get('select') === 'transaction_date,amount,description,type'
        ? r.fulfill({status: 500, json: {message: 'Unavailable'}})
        : r.fallback()
    );
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Importar estado de cuenta'}).click();
    const dialog = s.page.getByRole('dialog', {name: 'Importar estado de cuenta'});
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'qa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('date,description,amount\n2026-10-01,CSV safe,(20.00)')
    });
    await expect(dialog.getByRole('alert')).toContainText('No se pudieron revisar duplicados');
    await expect(dialog.getByRole('button', {name: /^Importar 1 movimiento/})).toBeDisabled();
    expect(s.posts.transactions).toHaveLength(0);
  } finally {
    await s.context.close();
  }
});

test('CSV retries a lost response with the same IDs without duplicating the block', async ({browser}) => {
  const s = await fixture(browser),
    calls = [],
    stored = new Set();
  let lost = true;
  try {
    await s.page.route('**/rest/v1/rpc/import_finance_transactions_once', async r => {
      const entries = r.request().postDataJSON().p_entries;
      calls.push(entries);
      for (const e of entries) stored.add(e.request_id);
      if (lost) {
        lost = false;
        return r.abort('failed');
      }
      return r.fulfill({json: {transaction_ids: entries.map(e => e.request_id)}});
    });
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Importar estado de cuenta'}).click();
    const dialog = s.page.getByRole('dialog', {name: 'Importar estado de cuenta'});
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'qa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('date,description,amount\n2026-10-01,CSV retry,(20.00)')
    });
    const submit = dialog.getByRole('button', {name: /^Importar 1 movimiento/});
    await submit.click();
    await expect(dialog.getByRole('alert')).toContainText('no se confirmó');
    await submit.click();
    await expect(dialog.locator('.tools-success')).toContainText('se importaron 1 movimientos');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(stored.size).toBe(1);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
