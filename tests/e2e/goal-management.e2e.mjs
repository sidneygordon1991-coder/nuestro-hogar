import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, chooseFinance, healthy, uid, hh, rid} from './support.mjs';
const first = '77777777-1111-4111-8111-111111111111';
async function goalFixture(s, {failRead = false, stale = false} = {}) {
  let goals = [
    {
      id: first,
      name: 'Fondo de emergencia',
      target_amount: 50000,
      target_date: '2027-12-31',
      active: true,
      icon: 'saving'
    },
    {id: rid, name: 'Carro', target_amount: 10000, target_date: '2027-02-28', active: true, icon: 'car'}
  ];
  const contributions = [
    {id: 'old-deposit', goal_id: first, amount: 100, contribution_date: '2026-10-08', created_by: uid},
    {id: 'old-withdrawal', goal_id: first, amount: -100, contribution_date: '2026-10-09', created_by: uid}
  ];
  const writes = [];
  await s.page.route('**/rest/v1/savings_goals?**', r =>
    failRead ? r.fulfill({status: 500, json: {message: 'Unavailable'}}) : r.fulfill({json: goals})
  );
  await s.page.route('**/rest/v1/goal_contributions?**', r => r.fulfill({json: contributions}));
  await s.page.route('**/rest/v1/rpc/manage_savings_goal', r => {
    const value = r.request().postDataJSON();
    writes.push(value);
    if (stale) return r.fulfill({status: 409, json: {code: '40001', message: 'Stale goal'}});
    const g = goals.find(g => g.id === value.p_goal_id);
    if (value.p_action === 'delete' && contributions.some(c => c.goal_id === g.id))
      return r.fulfill({
        status: 409,
        json: {code: '23001', message: 'Esta meta tiene aportes o retiros. Archívala para conservar su historial.'}
      });
    if (value.p_action === 'edit') Object.assign(g, value.p_values);
    if (value.p_action === 'archive') g.active = false;
    if (value.p_action === 'restore') g.active = true;
    if (value.p_action === 'delete') goals = goals.filter(x => x.id !== g.id);
    return r.fulfill({json: value.p_goal_id});
  });
  return {writes, contributions, goals: () => goals};
}
async function openGoals(s) {
  await ready(s, 'presupuesto');
  await chooseFinance(s, 'Metas');
  await expect(s.page.getByRole('heading', {name: 'Metas de ahorro', exact: true})).toBeVisible();
}
for (const theme of ['light', 'dark'])
  test(`goal actions are visible and accessible on phone and desktop: ${theme}`, async ({browser}) => {
    const s = await setup(browser, {rich: true, theme});
    await goalFixture(s);
    try {
      await openGoals(s);
      for (const width of [320, 390, 1440]) {
        await s.page.setViewportSize({width, height: 840});
        await expect(s.page.getByRole('button', {name: 'Editar meta Fondo de emergencia', exact: true})).toBeVisible();
        for (const name of ['Editar', 'Archivar', 'Eliminar'])
          await expect(s.page.locator('.goal-card').first().getByText(name, {exact: true})).toBeVisible();
        await healthy(s);
      }
      const result = await new AxeBuilder({page: s.page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => v.id)).toEqual([]);
      await chooseFinance(s, 'Movimientos');
      await s.page.setViewportSize({width: 320, height: 840});
      await expect(s.page.locator('.transaction-actions .edit').first()).toHaveText('Editar');
      await expect(s.page.locator('.transaction-actions .delete').first()).toHaveText('Eliminar');
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });
test('edit a goal, preserve contributions, archive and reactivate, delete only an empty goal', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  const f = await goalFixture(s);
  try {
    await openGoals(s);
    await s.page.getByRole('button', {name: 'Editar meta Fondo de emergencia', exact: true}).click();
    let d = s.page.getByRole('dialog', {name: 'Editar meta', exact: true});
    await d.getByLabel('Nombre', {exact: true}).fill('Reserva del hogar');
    await d.getByLabel('Monto objetivo (Q)').fill('40000');
    await d.getByLabel('Fecha objetivo').fill('2027-06-30');
    await d.getByRole('button', {name: 'Guardar cambios', exact: true}).click();
    await expect(d).toHaveCount(0);
    await expect(s.page.locator('.goal-card').filter({hasText: 'Reserva del hogar'})).toContainText('40,000');
    expect(f.writes[0]).toMatchObject({
      p_household_id: hh,
      p_goal_id: first,
      p_action: 'edit',
      p_expected: {name: 'Fondo de emergencia', target_amount: 50000, active: true},
      p_values: {name: 'Reserva del hogar', target_amount: 40000, target_date: '2027-06-30'}
    });
    await s.page.getByRole('button', {name: 'Eliminar meta Reserva del hogar', exact: true}).click();
    d = s.page.getByRole('dialog', {name: 'Eliminar meta', exact: true});
    await d.getByRole('button', {name: 'Eliminar meta', exact: true}).click();
    await expect(d.getByRole('alert')).toContainText('Archívala');
    expect(f.contributions).toHaveLength(2);
    await d.getByRole('button', {name: 'Cancelar', exact: true}).click();
    await s.page.getByRole('button', {name: 'Archivar meta Reserva del hogar', exact: true}).click();
    await s.page.getByRole('dialog').getByRole('button', {name: 'Archivar meta', exact: true}).click();
    await expect(s.page.getByRole('button', {name: 'Archivar meta Reserva del hogar', exact: true})).toHaveCount(0);
    await s.page.getByRole('button', {name: /^Archivadas/}).click();
    const card = s.page.locator('.goal-card').filter({hasText: 'Reserva del hogar'});
    await expect(card).toContainText('Archivada');
    await expect(card.getByLabel('Nuevo aporte para Reserva del hogar')).toHaveCount(0);
    await s.page.getByRole('button', {name: 'Reactivar meta Reserva del hogar', exact: true}).click();
    await s.page.getByRole('dialog').getByRole('button', {name: 'Reactivar meta', exact: true}).click();
    await expect(s.page.getByRole('button', {name: 'Archivar meta Reserva del hogar', exact: true})).toBeVisible();
    await s.page.getByRole('button', {name: 'Eliminar meta Carro', exact: true}).click();
    await s.page.getByRole('dialog').getByRole('button', {name: 'Eliminar meta', exact: true}).click();
    await expect(s.page.getByRole('button', {name: 'Eliminar meta Carro', exact: true})).toHaveCount(0);
    expect(f.goals()).toHaveLength(1);
    expect(f.contributions).toHaveLength(2);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
test('stale goal edits preserve the form and readonly or incomplete data cannot expose mutation actions', async ({
  browser
}) => {
  for (const mode of ['stale', 'readonly', 'failed']) {
    const s = await setup(browser, {rich: true, ...(mode === 'readonly' ? {accessOverride: {finance: 'view'}} : {})});
    const f = await goalFixture(s, {failRead: mode === 'failed', stale: mode === 'stale'});
    try {
      await ready(s, 'presupuesto');
      await chooseFinance(s, 'Metas');
      if (mode === 'failed') {
        await expect(s.page.getByRole('alert').filter({hasText: 'No pudimos cargar las metas'})).toBeVisible();
        await expect(s.page.getByRole('button', {name: /^Editar meta /})).toHaveCount(0);
      }
      if (mode === 'readonly') {
        await expect(s.page.locator('.goal-card')).toHaveCount(2);
        await expect(s.page.locator('.goal-management-actions')).toHaveCount(0);
      }
      if (mode === 'stale') {
        await s.page.getByRole('button', {name: 'Editar meta Carro', exact: true}).click();
        const d = s.page.getByRole('dialog');
        await d.getByLabel('Nombre', {exact: true}).fill('Mi carro nuevo');
        await d.getByRole('button', {name: 'Guardar cambios'}).click();
        await expect(d.getByRole('alert')).toContainText('otra sesión');
        await expect(d.getByLabel('Nombre', {exact: true})).toHaveValue('Mi carro nuevo');
        expect(f.goals().find(g => g.id === rid).name).toBe('Carro');
      } else expect(f.writes).toHaveLength(0);
      await healthy(s);
    } finally {
      await s.context.close();
    }
  }
});
