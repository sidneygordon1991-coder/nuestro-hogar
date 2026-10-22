import {test, expect} from '@playwright/test';
import {setup, ready, healthy} from './support.mjs';

test('test builds identify themselves and never reach the production backend', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  const productionRequests = [];
  s.page.on('request', request => {
    if (new URL(request.url()).hostname === 'dchihxrjtngwabbvsqap.supabase.co') productionRequests.push(request.url());
  });
  try {
    await ready(s, '');
    await expect(s.page.getByRole('complementary', {name: 'Entorno de la aplicación'})).toContainText(
      'datos simulados'
    );
    await expect(s.page.locator('.home-budget-remaining')).toHaveText(/Q/);
    expect(productionRequests).toEqual([]);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('home explains money versus budget and offers the next unfinished setup step', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  try {
    await ready(s, '');
    await expect(s.page.locator('.home-hero')).toContainText('No suma ingresos por recibir ni límites de tarjetas.');
    await expect(s.page.locator('.home-budget-available')).toContainText('No es el saldo de tus cuentas.');
    await s.page.getByLabel('Base de ingresos del presupuesto').selectOption('expected');
    await expect(s.page.locator('.home-budget-available')).toContainText(
      'Ese dinero aún puede no estar en tus cuentas.'
    );
    const next = s.page.getByRole('region', {name: 'Tu próximo paso'});
    await expect(next.getByRole('heading')).toBeVisible();
    await next.getByRole('button', {name: 'Continuar', exact: true}).click();
    await expect(s.page.locator('.workspace-title')).toBeVisible();
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
