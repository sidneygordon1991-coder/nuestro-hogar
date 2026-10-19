import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, chooseFinance, healthy, uid, rid} from './support.mjs';
const bank = 'aaaaaaaa-1111-4111-8111-111111111111',
  card = 'aaaaaaaa-2222-4222-8222-222222222222';
async function fixture(browser, theme = 'light') {
  const s = await setup(browser, {rich: true, theme});
  s.saved = [];
  s.edits = [];
  s.imports = [];
  await s.page.route('**/rest/v1/rpc/finance_split_weights', r =>
    r.fulfill({json: [{user_id: uid, ratio: 1, source: 'equal'}]})
  );
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      json: [
        {
          id: bank,
          name: 'Banco disponible',
          account_type: 'checking',
          account_class: 'asset',
          opening_balance: 1000,
          is_shared: true,
          active: true
        },
        {
          id: card,
          name: 'Visa compras',
          account_type: 'credit',
          account_class: 'liability',
          opening_balance: 0,
          is_shared: true,
          active: true
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/rpc/save_transaction_once', r => {
    s.saved.push(r.request().postDataJSON());
    return r.fulfill({json: rid});
  });
  await s.page.route('**/rest/v1/rpc/save_finance_transaction', r => {
    s.edits.push(r.request().postDataJSON());
    return r.fulfill({json: rid});
  });
  await s.page.route('**/rest/v1/rpc/import_finance_transactions_once', r => {
    const data = r.request().postDataJSON();
    s.imports.push(data);
    return r.fulfill({json: {transaction_ids: data.p_entries.map(() => rid)}});
  });
  return s;
}
async function newExpense(s) {
  await s.page.getByRole('button', {name: 'Agregar', exact: true}).click();
  const d = s.page.getByRole('dialog', {name: 'Nuevo movimiento'});
  await d.getByLabel('Descripción', {exact: true}).fill('Compra QA');
  await d.locator('[name=amount]').fill('100');
  return d;
}
for (const theme of ['light', 'dark'])
  test(`payment rule: credit, existing money and manual override (${theme})`, async ({browser}) => {
    const s = await fixture(browser, theme);
    try {
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Movimientos');
      for (const [account, mode, included] of [
        [card, 'auto', true],
        [bank, 'auto', false],
        [bank, 'true', true]
      ]) {
        const d = await newExpense(s);
        await d.getByLabel(/^Cuenta/).selectOption(account);
        await d.getByLabel('Tratamiento del gasto').selectOption(mode);
        const hint = d.getByRole('note', {name: 'Efecto del pago'});
        await expect(hint).toContainText(
          account === card
            ? 'dinero disponible no sale al comprar'
            : mode === 'auto'
              ? 'deja el presupuesto sin consumir'
              : 'También consume el presupuesto'
        );
        if (mode === 'auto' && account === bank) {
          for (const [width, height] of [
            [320, 650],
            [390, 520],
            [1440, 900]
          ]) {
            await s.page.setViewportSize({width, height});
            const save = d.getByRole('button', {name: 'Guardar movimiento', exact: true});
            await save.scrollIntoViewIfNeeded();
            await expect(save).toBeInViewport();
            await healthy(s);
          }
          await s.page.screenshot({path: test.info().outputPath(`payment-${theme}.png`), fullPage: true});
          expect(
            (
              await new AxeBuilder({page: s.page})
                .include('[role=dialog]')
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .analyze()
            ).violations
          ).toEqual([]);
        }
        await d.getByRole('button', {name: 'Guardar movimiento', exact: true}).click();
        await expect(d).toHaveCount(0);
        expect(s.saved.at(-1).p_values).toMatchObject({account_id: account, budget_included: included, amount: 100});
      }
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });
test('editing preserves recorded classification until the user selects automatic', async ({browser}) => {
  const s = await fixture(browser);
  await s.page.route('**/rest/v1/transactions?**', r => {
    if (r.request().method() === 'PATCH') {
      s.edits.push(r.request().postDataJSON());
      return r.fulfill({status: 204, body: ''});
    }
    return r.fulfill({
      json: [
        {
          id: rid,
          account_id: bank,
          description: 'Legacy included',
          amount: 50,
          type: 'expense',
          transaction_date: '2026-10-10',
          paid_by: uid,
          is_shared: true,
          budget_included: true
        }
      ]
    });
  });
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    for (const mode of ['true', 'auto']) {
      await s.page
        .locator('.transaction-row')
        .filter({hasText: 'Legacy included'})
        .getByRole('button', {name: 'Editar movimiento', exact: true})
        .click();
      const d = s.page.getByRole('dialog', {name: 'Editar movimiento'});
      await expect(d.getByLabel('Tratamiento del gasto')).toHaveValue('true');
      await expect(d).toContainText('Se conserva la clasificación guardada');
      if (mode === 'auto') await d.getByLabel('Tratamiento del gasto').selectOption('auto');
      await d.getByRole('button', {name: 'Guardar cambios', exact: true}).click();
      await expect(d)
        .toHaveCount(0)
        .catch(async error => {
          throw new Error(
            error.message +
              '\n' +
              JSON.stringify({
                edits: s.edits,
                errors: s.errors,
                body: (await s.page.locator('body').innerText()).slice(-6500),
                invalid: await d
                  .locator(':invalid')
                  .evaluateAll(els => els.map(el => ({name: el.name, value: el.value, message: el.validationMessage})))
              })
          );
        });
      expect(s.edits.at(-1)).toMatchObject({account_id: bank, budget_included: mode === 'true', amount: 50});
    }
  } finally {
    await s.context.close();
  }
});
test('recovered drafts synchronize the payment explanation and quick entry uses the same rule', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    let d = await newExpense(s);
    await d.getByLabel(/^Cuenta/).selectOption(bank);
    await d.getByRole('button', {name: 'Cerrar: Nuevo movimiento'}).click();
    await s.page.getByRole('button', {name: 'Agregar', exact: true}).click();
    d = s.page.getByRole('dialog', {name: 'Nuevo movimiento'});
    await d.getByRole('button', {name: 'Recuperar borrador'}).click();
    await expect(d.getByLabel(/^Cuenta/)).toHaveValue(bank);
    await expect(d.getByRole('note', {name: 'Efecto del pago'})).toContainText('deja el presupuesto sin consumir');
    await d.getByRole('button', {name: 'Guardar movimiento', exact: true}).click();
    await expect(d).toHaveCount(0);
    expect(s.saved.at(-1).p_values.budget_included).toBe(false);
    await s.page.evaluate(() => window.dispatchEvent(new CustomEvent('nh:quick-add')));
    d = s.page.getByRole('dialog');
    await d
      .getByRole('button', {name: /^Gasto/})
      .first()
      .click();
    for (const [account, included] of [
      [bank, false],
      [card, true]
    ]) {
      await d.getByLabel('Monto', {exact: true}).fill('25');
      await d.getByLabel(/^Cuenta/).selectOption(account);
      await d.getByRole('button', {name: 'Guardar gasto'}).click();
      await expect(d.locator('.quick-entry-success')).toContainText('Registrado');
      expect(s.saved.at(-1).p_values).toMatchObject({account_id: account, budget_included: included});
      await d.getByRole('button', {name: 'Registrar otro'}).click();
    }
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('statement expenses follow the selected account while deposits remain income', async ({browser}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Importar estado de cuenta'}).click();
    const d = s.page.getByRole('dialog', {name: 'Importar estado de cuenta'});
    await d.locator('input[type=file]').setInputFiles({
      name: 'qa.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('date,description,amount\n2026-10-01,Compra QA,-50\n2026-10-02,Abono QA,100')
    });
    await d.getByLabel(/^Cuenta/).selectOption(bank);
    await expect(d.getByRole('note', {name: 'Efecto del pago'})).toContainText('deja el presupuesto sin consumir');
    await d.getByLabel(/^Cuenta/).selectOption(card);
    await expect(d.getByRole('note', {name: 'Efecto del pago'})).toContainText('Aumenta la deuda');
    await d.getByLabel(/^Cuenta/).selectOption(bank);
    await d.getByRole('button', {name: /^Importar 2 movimientos/}).click();
    await expect(d.locator('.tools-success')).toContainText('se importaron 2 movimientos');
    const entries = s.imports[0].p_entries.map(x => x.values);
    expect(entries.find(x => x.type === 'expense')).toMatchObject({account_id: bank, budget_included: false});
    expect(entries.find(x => x.type === 'income')).not.toHaveProperty('budget_included');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
