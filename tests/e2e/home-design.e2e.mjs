import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup, ready, healthy, uid, hh} from './support.mjs';
const finishes = [
  ['forest', 'Verde'],
  ['ocean', 'Azul'],
  ['graphite', 'Negro'],
  ['iris', 'Morado']
];
const canvas = {light: 'rgb(241, 243, 245)', dark: 'rgb(14, 16, 18)'};
const amount = text => {
  const n = Number(
    text
      .replace(/[^\d.,−-]/g, '')
      .replace(/,/g, '')
      .replace('−', '-')
  );
  return Math.round(n * 100);
};
async function accessible(page) {
  const r = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    r.violations
      .filter(v => ['critical', 'serious'].includes(v.impact))
      .map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, summary: n.failureSummary}))}))
  ).toEqual([]);
}
async function withAppearance(s, accent, extra = {}) {
  await s.context.addInitScript(
    ({uid, hh, value}) => localStorage.setItem('nh:appearance:' + uid + ':' + hh, JSON.stringify(value)),
    {
      uid,
      hh,
      value: {
        accent,
        focus: 'balance',
        view: 'complete',
        favorites: ['presupuesto', 'calendario', 'listas'],
        cover: '',
        ...extra
      }
    }
  );
}

for (const theme of ['light', 'dark']) {
  for (const [accent, label] of finishes)
    test(`home "Tu dinero, en perspectiva" with the ${label} finish, ${theme}`, async ({browser}, info) => {
      const s = await setup(browser, {rich: true, theme});
      try {
        await withAppearance(s, accent);
        await s.page.setViewportSize({width: 1440, height: 900});
        await ready(s, '');
        await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent', accent);
        expect(await s.page.locator('.app-studio').evaluate(e => getComputedStyle(e).backgroundColor)).toBe(
          canvas[theme]
        );
        await expect(s.page.locator('.workspace-header .home-title-desktop')).toHaveText('Tu dinero, en perspectiva.');
        await expect(s.page.locator('.desktop-rail')).toBeVisible();
        await expect(s.page.locator('.desktop-rail .rail-item.active')).toHaveText('Hoy');
        // The hero shows the same registered cash total as the first KPI; budget remaining is a separate figure.
        const kpis = await s.page.locator('.home-kpi strong').allInnerTexts();
        expect(kpis).toHaveLength(3);
        const hero = await s.page.locator('.home-hero h2').innerText();
        expect(amount(hero)).toBe(amount(kpis[0]));
        await s.page.locator('.home-hero-calc-toggle').click();
        await expect(s.page.locator('.home-hero-calc')).toContainText('Margen después de compromisos');
        await expect(s.page.getByRole('region', {name: 'Presupuesto disponible', exact: true})).toBeVisible();
        await expect(s.page.getByRole('region', {name: 'Tu quincena'})).toBeVisible();
        await expect(s.page.locator('.home-legend')).toContainText('Proyectado');
        await expect(s.page.getByRole('region', {name: 'Así va tu presupuesto'})).toBeVisible();
        await expect(s.page.getByRole('region', {name: 'Lo importante hoy'})).toBeVisible();
        for (const width of [320, 390, 768, 1440]) {
          await s.page.setViewportSize({width, height: 844});
          await healthy(s);
          const dock = s.page.getByRole('navigation', {name: 'Navegación principal', exact: true}),
            add = s.page.getByRole('button', {name: 'Registrar un movimiento o actividad', exact: true});
          if (width < 761) {
            const header = await s.page.locator('.workspace-header').boundingBox(),
              heroBox = await s.page.locator('.home-hero').boundingBox();
            expect(header.height).toBeLessThan(200);
            expect(heroBox.y).toBeLessThan(260);
            await expect(s.page.locator('.home-hero-minis')).toBeVisible();
            await expect(s.page.locator('.home-kpis')).toBeHidden();
            await expect(s.page.locator('.workspace-header .home-title-mobile')).toBeVisible();
          }
          if (width < 1100) {
            const a = await add.boundingBox(),
              d = await dock.boundingBox();
            expect(a.y + a.height).toBeGreaterThan(d.y);
            expect(a.x).toBeGreaterThan(d.x + d.width * 0.3);
            expect(a.x + a.width).toBeLessThan(d.x + d.width * 0.7);
            expect(a.width).toBeGreaterThanOrEqual(44);
            await expect(s.page.locator('.desktop-rail')).toBeHidden();
          } else await expect(dock).toBeHidden();
        }
        await accessible(s.page);
        await s.page.setViewportSize({width: 1440, height: 900});
        await info.attach('desktop-' + accent + '-' + theme, {
          body: await s.page.screenshot({fullPage: true}),
          contentType: 'image/png'
        });
        await s.page.setViewportSize({width: 390, height: 844});
        await accessible(s.page);
        await info.attach('mobile-' + accent + '-' + theme, {
          body: await s.page.screenshot(),
          contentType: 'image/png'
        });
        await s.page.locator('.home-hero-minis button').first().click();
        await expect(s.page).toHaveURL(/tab=presupuesto/);
        await healthy(s);
      } finally {
        await s.context.close();
      }
    });
  test(`four finishes: preview, persistence, theme choice and no server writes: ${theme}`, async ({browser}) => {
    const s = await setup(browser, {rich: true, theme}),
      writes = [];
    s.page.on('request', r => {
      const path = new URL(r.url()).pathname;
      if (
        path.startsWith('/rest/') &&
        ['POST', 'PATCH', 'DELETE'].includes(r.method()) &&
        !/\/rpc\/(get_my_household_access|get_home_finance_source|get_my_household_storage|get_my_platform_access|get_finance_cycle_defaults|refresh_my_notifications)$/.test(
          path
        )
      )
        writes.push(path);
    });
    try {
      await s.page.setViewportSize({width: 1440, height: 900});
      await ready(s, '');
      for (const [accent, label] of finishes) {
        await s.page.locator('.desktop-rail').getByRole('button', {name: 'Configuración', exact: true}).click();
        const dialog = s.page.getByRole('dialog', {name: 'Personaliza tu espacio', exact: true});
        await expect(dialog.locator('.appearance-swatch')).toHaveCount(4);
        await dialog.getByRole('button', {name: label, exact: true}).click();
        await expect(dialog.locator('.appearance-palette-preview')).toHaveAttribute('data-accent', accent);
        await expect(dialog.getByRole('button', {name: label, exact: true})).toHaveAttribute('aria-pressed', 'true');
        await accessible(s.page);
        const save = dialog.getByRole('button', {name: 'Guardar cambios', exact: true});
        await save.scrollIntoViewIfNeeded();
        await save.click();
        await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent', accent);
        await s.page.reload();
        await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent', accent);
        await healthy(s);
      }
      await s.page.locator('.desktop-rail').getByRole('button', {name: 'Configuración', exact: true}).click();
      const dialog = s.page.getByRole('dialog', {name: 'Personaliza tu espacio', exact: true});
      const next = theme === 'light' ? 'Noche' : 'Día';
      await dialog.getByRole('group', {name: 'Tema de la app'}).getByRole('button', {name: next, exact: true}).click();
      await expect(s.page.locator('html')).toHaveAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
      await s.page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await s.page
        .getByRole('button', {name: theme === 'light' ? 'Activar tema de día' : 'Activar tema de noche', exact: true})
        .click();
      await expect(s.page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent', 'iris');
      expect(writes).toEqual([]);
    } finally {
      await s.context.close();
    }
  });
}

test('legacy "Tornasol" preference opens as Morado', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  try {
    await withAppearance(s, 'aurora');
    await ready(s, '');
    await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent', 'iris');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('shared and personal lenses are remembered per household and change the figures', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  try {
    await s.page.setViewportSize({width: 1440, height: 900});
    await ready(s, '');
    const scope = s.page.getByRole('group', {name: 'Vista de tus finanzas'});
    await expect(scope.getByRole('button', {name: 'Compartido', exact: true})).toHaveAttribute('aria-pressed', 'true');
    const shared = await s.page.locator('.home-kpis').innerText();
    await scope.getByRole('button', {name: 'Personal', exact: true}).click();
    await expect(scope.getByRole('button', {name: 'Personal', exact: true})).toHaveAttribute('aria-pressed', 'true');
    await expect(s.page.locator('.home-grid')).toHaveAttribute('data-scope', 'personal');
    expect(await s.page.locator('.home-kpis').innerText()).not.toBe(shared);
    await s.page.reload();
    await expect(
      s.page.getByRole('group', {name: 'Vista de tus finanzas'}).getByRole('button', {name: 'Personal', exact: true})
    ).toHaveAttribute('aria-pressed', 'true');
    await s.page
      .getByRole('group', {name: 'Vista de tus finanzas'})
      .getByRole('button', {name: 'Compartido', exact: true})
      .click();
    await expect(s.page.locator('.home-grid')).toHaveAttribute('data-scope', 'household');
    await healthy(s);
  } finally {
    await s.context.close();
  }
});

test('install suggestion appears only when installing is possible and stays dismissed', async ({browser}) => {
  const s = await setup(browser, {rich: true});
  try {
    await ready(s, '');
    await expect(s.page.locator('.pwa-install')).toHaveCount(0);
    await s.page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      Object.assign(e, {
        prompt: async () => undefined,
        userChoice: Promise.resolve({outcome: 'dismissed', platform: 'web'})
      });
      window.dispatchEvent(e);
    });
    await expect(s.page.locator('.pwa-install')).toBeVisible();
    await s.page.getByRole('button', {name: 'Cerrar sugerencia de instalación', exact: true}).click();
    await expect(s.page.locator('.pwa-install')).toHaveCount(0);
    await s.page.reload();
    await s.page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      Object.assign(e, {
        prompt: async () => undefined,
        userChoice: Promise.resolve({outcome: 'dismissed', platform: 'web'})
      });
      window.dispatchEvent(e);
    });
    await expect(s.page.locator('.pwa-install')).toHaveCount(0);
    await healthy(s);
  } finally {
    await s.context.close();
  }
});
