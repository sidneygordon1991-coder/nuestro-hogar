import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, chooseFinance, healthy, uid, hh, rid} from './support.mjs';
const bank = '90000000-0000-4000-8000-000000000001',
  food = '66666666-1111-4111-8111-111111111111',
  saving = 'saving';
const categories = [
  {id: food, name: 'Alimentación', budget_group: 'variable'},
  {id: saving, name: 'Ahorro', budget_group: 'saving'}
];
const row = (id, date, amount, type, category_id = null, budget_included = true) => ({
  id,
  description: id,
  transaction_date: date,
  amount,
  type,
  category_id,
  budget_included,
  account_id: bank,
  paid_by: uid,
  is_shared: true
});
const transactions = [
  row('Salario', '2026-10-05', 1000, 'income'),
  row('Supermercado', '2026-10-10', 120, 'expense', food),
  row('Compra extraordinaria', '2026-10-16', 80, 'expense', food, false),
  row('Reserva', '2026-10-10', 100, 'expense', saving, false),
  row('Ingreso futuro', '2026-10-30', 9999, 'income'),
  row('Salario anterior', '2026-09-05', 900, 'income'),
  row('Compra anterior', '2026-09-08', 150, 'expense', food),
  row('Compra tardía', '2026-09-28', 400, 'expense', food),
  row('Reserva anterior', '2026-09-09', 100, 'expense', saving)
];
const contributions = [
  {id: 'c', goal_id: rid, amount: 250, contribution_date: '2026-10-10', created_by: uid},
  {id: 'w', goal_id: rid, amount: -50, contribution_date: '2026-10-12', created_by: uid},
  {id: 'p', goal_id: rid, amount: 100, contribution_date: '2026-09-04', created_by: uid}
];
function filterDate(url, rows, field) {
  const params = new URL(url).searchParams;
  return rows.filter(t =>
    params
      .getAll(field)
      .every(f =>
        f.startsWith('gte.') ? t[field] >= f.slice(4) : f.startsWith('lte.') ? t[field] <= f.slice(4) : true
      )
  );
}
async function fixture(browser, options = {}) {
  const s = await setup(browser, {rich: true, ...options});
  await s.page.route('**/rest/v1/rpc/get_home_finance_source', r =>
    r.fulfill({
      json: {
        transactions: transactions.filter(t => t.transaction_date.startsWith('2026-10')),
        categories,
        allocations: [],
        contributions: contributions.filter(t => t.contribution_date.startsWith('2026-10')),
        recurring: [],
        occurrences: [],
        member_settings: [],
        goals: [],
        goal_contributions: [],
        plans: [],
        members: [{user_id: uid}],
        splits: [],
        settlements: [],
        private: []
      }
    })
  );
  await s.page.route('**/rest/v1/transactions?**', r =>
    r.fulfill({json: filterDate(r.request().url(), transactions, 'transaction_date')})
  );
  await s.page.route('**/rest/v1/goal_contributions?**', r =>
    r.fulfill({json: filterDate(r.request().url(), contributions, 'contribution_date')})
  );
  await s.page.route('**/rest/v1/budget_categories?**', r => r.fulfill({json: categories}));
  await s.page.route('**/rest/v1/budget_allocations?**', r => r.fulfill({json: []}));
  await s.page.route('**/rest/v1/finance_accounts?**', r =>
    r.fulfill({
      json: [
        {
          id: bank,
          name: 'Banco principal',
          account_type: 'checking',
          account_class: 'asset',
          opening_balance: 100,
          active: true,
          is_shared: true
        }
      ]
    })
  );
  return s;
}
async function accessible(page) {
  const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    result.violations
      .filter(v => ['critical', 'serious'].includes(v.impact))
      .map(v => ({id: v.id, nodes: v.nodes.map(n => n.target)}))
  ).toEqual([]);
}
for (const theme of ['light', 'dark'])
  test(`verifiable figures, comparable periods and editorial home: ${theme}`, async ({browser}, testInfo) => {
    const s = await fixture(browser, {theme});
    try {
      await ready(s, '');
      const panorama = s.page.getByRole('region', {name: 'Panorama del mes'});
      await expect(panorama).toContainText('Espacio para lo que importa.');
      await expect(panorama.locator('.panorama-figures')).toContainText('Q 1,000');
      await expect(panorama.locator('.panorama-figures')).toContainText('Q 200');
      await expect(panorama.locator('.panorama-figures')).toContainText('Q 300');
      await panorama.locator('summary').click();
      await expect(panorama.locator('.financial-evidence-total')).toContainText('Q 500');
      await expect(panorama).toContainText('Q 80');
      await expect(panorama).not.toContainText('9,999');
      for (const width of [320, 390, 768, 1440]) {
        await s.page.setViewportSize({width, height: 900});
        expect(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await s.page.setViewportSize({width: 390, height: 844});
      await accessible(s.page);
      await panorama.locator('summary').click();
      await s.page.screenshot({path: testInfo.outputPath('home-' + theme + '.png'), fullPage: true});
      await s.page.screenshot({path: testInfo.outputPath('home-viewport-' + theme + '.png')});
      await s.page.setViewportSize({width: 1440, height: 960});
      await s.page.screenshot({path: testInfo.outputPath('home-desktop-' + theme + '.png')});
      await s.page.setViewportSize({width: 390, height: 844});
      await ready(s, 'presupuesto');
      await expect(s.page.locator('.studio-finance-hero h3')).toHaveText('Q 500');
      await s.page.locator('.financial-evidence summary').click();
      await expect(s.page.locator('.financial-evidence-total')).toContainText('Q 500');
      await expect(s.page.locator('.studio-previous')).toContainText('Q 550');
      await chooseFinance(s, 'Comparación');
      await expect(s.page.locator('.comparison-period-note')).toContainText('primeros 16 días');
      const kpi = s.page.locator('.comparison-kpi').filter({hasText: 'Gastos'});
      await expect(kpi).toContainText('Q 200');
      await expect(kpi).toContainText('33.3%');
      await expect(s.page.locator('.comparison-table-row').filter({hasText: 'sep'})).toContainText('Q 550');
      await expect(s.page.locator('.comparison-table-row').filter({hasText: 'sep'})).toContainText('Q 200');
      await accessible(s.page);
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });

test('movement connects expense, account, audit and edit without a second financial write', async ({browser}) => {
  const s = await fixture(browser),
    auditQueries = [];
  await s.page.route('**/rest/v1/household_audit_log?**', r => {
    auditQueries.push(new URL(r.request().url()).searchParams);
    return r.fulfill({json: [{id: 1, actor_user_id: uid, action: 'update', created_at: '2026-10-16T12:00:00Z'}]});
  });
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Ver detalle de Compra extraordinaria', exact: true}).click();
    const dialog = s.page.getByRole('dialog', {name: 'Detalle del movimiento'});
    await expect(dialog.getByRole('region', {name: 'Impacto del movimiento'})).toContainText(
      'Gasto fuera del presupuesto'
    );
    await expect(dialog).toContainText('Reduce el saldo en Q 80');
    await dialog.locator('.transaction-history summary').click();
    await expect(dialog.locator('.transaction-history')).toContainText('Actualizado');
    expect(auditQueries).toHaveLength(1);
    expect(auditQueries[0].get('household_id')).toBe('eq.' + hh);
    expect(auditQueries[0].get('entity_id')).toBe('eq.Compra extraordinaria');
    await accessible(s.page);
    await dialog.getByRole('button', {name: 'Editar este movimiento'}).click();
    await expect(s.page.getByRole('dialog', {name: 'Editar movimiento'})).toBeVisible();
    await expect(s.page.getByRole('dialog').locator('input[name="description"]')).toHaveValue('Compra extraordinaria');
    expect(s.calls.filter(c => c.method === 'POST' && c.path.includes('save_transaction'))).toHaveLength(0);
  } finally {
    await s.context.close();
  }
});

function report(month) {
  return {
    month,
    period_end: month === '2026-09-01' ? '2026-09-30' : '2026-10-16',
    is_complete_month: month === '2026-09-01',
    score: 80,
    status: 'good',
    status_label: 'Buen avance',
    financial: {
      income: 900,
      expense: 550,
      saving: 200,
      balance: 150,
      budget: 700,
      saving_rate: 22,
      budget_usage: 79,
      net_worth: null
    },
    previous: {
      month: '2026-08-01',
      period_end: '2026-08-31',
      income: 0,
      expense: 0,
      saving: 0,
      balance: 0,
      budget: 0,
      saving_rate: 0,
      budget_usage: 0,
      net_worth: null
    },
    changes: {income_pct: null, expense_pct: null, saving_pct: null, net_worth_amount: null},
    operations: {
      recurring_paid: 0,
      recurring_pending: 1,
      tasks_completed: 0,
      tasks_overdue: 0,
      events: 0,
      maintenance_count: 0,
      maintenance_cost: 0,
      documents_due: 0,
      meals_prepared: 0
    },
    top_categories: [],
    insights: [],
    suggested_focus: [],
    generated_at: '2026-10-16T12:00:00Z'
  };
}
test('close detects changes during review, keeps notes and requires another acknowledgement', async ({browser}) => {
  const s = await fixture(browser);
  let changed = false,
    saves = 0;
  await s.page.route('**/rest/v1/rpc/build_monthly_household_close', r => {
    const data = report(r.request().postDataJSON().p_month);
    if (changed) data.operations.recurring_pending = 2;
    return r.fulfill({json: data});
  });
  await s.page.route('**/rest/v1/rpc/finalize_monthly_household_close', r => {
    saves++;
    return r.fulfill({json: {}});
  });
  await s.page.route('**/rest/v1/account_reconciliations?**', r => r.fulfill({json: []}));
  try {
    await ready(s, 'cierre');
    await s.page.getByRole('button', {name: 'Mes anterior', exact: true}).click();
    await expect(s.page.locator('.monthly-close-period')).toContainText('septiembre');
    const close = s.page.getByRole('button', {name: 'Cerrar mes', exact: true});
    await expect(close).toBeDisabled();
    await s.page.locator('.close-readiness summary').click();
    await expect(s.page.locator('.close-readiness')).toContainText('Las cifras coinciden');
    await expect(s.page.locator('.close-readiness')).toContainText('0 de 1 cuentas');
    const note = s.page.locator('.monthly-close-reflection textarea');
    await note.fill('Mantener una reserva de emergencia.');
    const ack = s.page.locator('.close-review-ack input');
    await ack.check();
    changed = true;
    await close.click();
    await expect(s.page.locator('.finance-message')).toContainText('cambiaron durante la revisión');
    await expect(note).toHaveValue('Mantener una reserva de emergencia.');
    await expect(ack).not.toBeChecked();
    await expect(close).toBeDisabled();
    expect(saves).toBe(0);
    await ack.check();
    await close.click();
    await expect.poll(() => saves).toBe(1);
    await expect(s.page.locator('.finance-message')).toContainText('Mes cerrado');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('closed month stays historical when current records differ; failed verification never becomes success', async ({
  browser
}) => {
  const s = await fixture(browser);
  let fail = true;
  const historical = report('2026-10-01');
  historical.financial.income = 800;
  historical.financial.balance = 50;
  await s.page.route('**/rest/v1/monthly_household_closures?**', r =>
    r.fulfill({
      json: [
        {
          id: rid,
          month: '2026-10-01',
          status: 'closed',
          snapshot: historical,
          reflection: 'Nota histórica',
          next_month_focus: [],
          closed_at: '2026-10-16T10:00:00Z',
          closed_by: uid
        }
      ]
    })
  );
  await s.page.route('**/rest/v1/account_reconciliations?**', r =>
    r.fulfill(fail ? {status: 400, json: {message: 'Unavailable'}} : {json: []})
  );
  try {
    await ready(s, 'cierre');
    await s.page.locator('.close-readiness summary').click();
    await expect(s.page.locator('.close-readiness')).toContainText('No pudimos completar');
    await expect(s.page.locator('.close-readiness')).not.toContainText('Las cifras coinciden');
    fail = false;
    await s.page.locator('.close-readiness').getByRole('button', {name: 'Reintentar'}).click();
    await expect(s.page.locator('.close-readiness')).toContainText('Hay cifras que revisar');
    await expect(s.page.locator('.close-differences')).toContainText('Q 800');
    await expect(s.page.locator('.close-differences')).toContainText('Q 1,000');
    await expect(s.page.locator('.monthly-close-balance')).toContainText('Q 50');
    await expect(s.page.locator('.monthly-close-reflection textarea')).toHaveValue('Nota histórica');
    await accessible(s.page);
  } finally {
    await s.context.close();
  }
});

test('audit respects server capability and does not query restricted history', async ({browser}) => {
  const s = await fixture(browser);
  let auditQueries = 0;
  await s.page.route('**/rest/v1/rpc/get_my_household_access', r =>
    r.fulfill({
      json: {
        role: 'adult',
        can_manage_members: false,
        can_view_audit: false,
        modules: Object.fromEntries(
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
    })
  );
  await s.page.route('**/rest/v1/household_audit_log?**', r => {
    auditQueries++;
    return r.fulfill({json: []});
  });
  try {
    await ready(s, 'presupuesto');
    await chooseFinance(s, 'Movimientos');
    await s.page.getByRole('button', {name: 'Ver detalle de Supermercado', exact: true}).click();
    const dialog = s.page.getByRole('dialog', {name: 'Detalle del movimiento'});
    await dialog.locator('.transaction-history summary').click();
    await expect(dialog).toContainText('Tu permiso no permite');
    expect(auditQueries).toBe(0);
    await expect(dialog.getByRole('button', {name: 'Editar este movimiento'})).toHaveCount(0);
  } finally {
    await s.context.close();
  }
});

test('an unavailable history is never presented as zero income in comparisons', async ({browser}) => {
  const s = await fixture(browser);
  let fail = true;
  await s.page.route('**/rest/v1/transactions?**', r => {
    const select = new URL(r.request().url()).searchParams.get('select') || '';
    if (fail && select.startsWith('amount,type,'))
      return r.fulfill({status: 400, json: {message: 'History unavailable'}});
    return r.fulfill({json: filterDate(r.request().url(), transactions, 'transaction_date')});
  });
  try {
    await ready(s, 'presupuesto');
    await expect(s.page.locator('.studio-finance-hero h3')).toHaveText('Q 500');
    await expect(s.page.locator('.studio-previous')).toContainText('por verificar');
    await expect(s.page.locator('.studio-previous b')).toHaveCount(0);
    await chooseFinance(s, 'Comparación');
    await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar el historial');
    await expect(s.page.locator('.comparison-kpi')).toHaveCount(0);
    fail = false;
    await s.page.getByRole('alert').getByRole('button', {name: 'Reintentar'}).click();
    await expect(s.page.locator('.comparison-kpi').filter({hasText: 'Gastos'})).toContainText('Q 200');
  } finally {
    await s.context.close();
  }
});

test('close verification respects Finance visibility and never requests restricted reconciliation history', async ({
  browser
}) => {
  const access = Object.fromEntries(
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
    ].map(m => [m, m === 'finance' ? 'none' : 'view'])
  );
  const s = await fixture(browser, {accessOverride: access});
  let reads = 0;
  await s.page.route('**/rest/v1/account_reconciliations?**', r => {
    reads++;
    return r.fulfill({json: []});
  });
  try {
    await ready(s, 'cierre');
    await s.page.locator('.close-readiness summary').click();
    await expect(s.page.locator('.close-readiness')).toContainText('Necesitas acceso a Finanzas');
    expect(reads).toBe(0);
    await expect(s.page.locator('.close-review-ack')).toHaveCount(0);
  } finally {
    await s.context.close();
  }
});

test('future months do not suggest a real decline in income or compare a month that has not started', async ({
  browser
}) => {
  const s = await fixture(browser);
  try {
    await ready(s, 'presupuesto');
    await s.page.getByRole('button', {name: 'Mes siguiente', exact: true}).click();
    await expect(s.page.locator('.studio-previous')).toContainText('Período futuro');
    await s.page.locator('.financial-evidence summary').click();
    await expect(s.page.locator('.financial-evidence')).toContainText('Este período aún no empieza');
    await chooseFinance(s, 'Comparación');
    await expect(s.page.locator('.comparison-period-note')).toContainText('Este mes aún no comienza');
    await expect(s.page.locator('.comparison-kpi')).toHaveCount(0);
  } finally {
    await s.context.close();
  }
});
