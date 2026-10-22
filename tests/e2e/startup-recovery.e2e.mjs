import {test, expect} from '@playwright/test';
import {setup, ready, healthy} from './support.mjs';

test('a failed application download offers recovery and can reopen the login screen', async ({browser}) => {
  const s = await setup(browser, {loggedIn: false});
  let failDownload = true;
  await s.page.route('**/assets/App-*.js', route => (failDownload ? route.abort('failed') : route.continue()));
  try {
    await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');
    await expect(s.page.getByRole('heading', {name: 'No pudimos abrir Nuestro Hogar'})).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await s.page.setViewportSize({width, height: 844});
      await expect(s.page.getByRole('button', {name: 'Volver a cargar', exact: true})).toBeVisible();
      await healthy(s);
    }
    failDownload = false;
    await s.page.getByRole('button', {name: 'Volver a cargar', exact: true}).click();
    await expect(s.page.getByRole('button', {name: 'Enviar enlace de acceso', exact: true})).toBeVisible();
    await expect(s.page.getByRole('heading', {name: 'No pudimos abrir Nuestro Hogar'})).toHaveCount(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

for (const theme of ['light', 'dark'])
  test(`a new household can open its first account from a phone: ${theme}`, async ({browser}) => {
    const s = await setup(browser, {rich: true, theme});
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
      ].map(key => [key, []])
    );
    await s.page.route('**/rest/v1/rpc/get_home_finance_source', route => route.fulfill({json: empty}));
    try {
      await ready(s, '');
      const start = s.page.locator('.home-start');
      for (const width of [320, 390, 760, 1440]) {
        await s.page.setViewportSize({width, height: 844});
        await expect(start.getByRole('button', {name: 'Agregar mis cuentas', exact: true})).toBeVisible();
        await healthy(s);
      }
      await s.page.setViewportSize({width: 390, height: 844});
      await start.getByRole('button', {name: 'Agregar mis cuentas', exact: true}).click();
      await expect(s.page.getByRole('heading', {name: 'Dinero, crédito y transferencias'})).toBeVisible();
      await healthy(s);
    } finally {
      await s.context.close();
    }
  });
