import {describe, expect, it} from 'vitest';
import {parse} from 'postcss';
// @ts-ignore Vitest runs in Node; browser application types exclude Node built-ins.
import {readFileSync} from 'node:fs';
const readCss = (url: URL): string =>
  readFileSync(url, 'utf8').replace(/@import '([^']+)';/g, (_: string, file: string) => readCss(new URL(file, url))); // styles.css is an index of partials
const sheet = parse(readCss(new URL('../styles.css', import.meta.url)));
function value(selector: string, property: string) {
  let result = '';
  sheet.walkRules(rule => {
    if (
      rule.selector
        .split(',\n')
        .map(s => s.trim())
        .includes(selector)
    )
      rule.walkDecls(property, d => {
        result = d.value;
      });
  });
  return result;
}
const overlays = ':is(.modal-backdrop,.global-command-panel,.notification-panel,.app-menu-drawer)';
describe('save actions remain accessible above the bottom navigation', () => {
  it('raises the parent stacking context, rather than just the nested backdrop', () => {
    expect(Number(value('.app .content:has(.modal-backdrop)', 'z-index'))).toBeGreaterThan(
      Number(value('nav', 'z-index'))
    );
    expect(Number(value('.app .modal-backdrop', 'z-index'))).toBeGreaterThan(Number(value('nav', 'z-index')));
  });
  it('removes navigation and floating prompts while any shared overlay is open', () => {
    for (const target of ['>nav', ' .pwa-install', ' .pwa-update']) {
      expect(value('.app:has(' + overlays + ')' + target, 'visibility')).toBe('hidden');
      expect(value('.app:has(' + overlays + ')' + target, 'pointer-events')).toBe('none');
    }
    expect(value('body:has(.app ' + overlays + ')', 'overflow')).toBe('hidden');
  });
  it('allows long forms to scroll within the dynamic viewport and reserves footer clearance', () => {
    expect(value('.app .finance-modal', 'max-height')).toContain('100dvh');
    expect(value('.app .finance-modal', 'max-height')).toContain('safe-area-inset-bottom');
    expect(value('.app .finance-modal', 'overflow-y')).toBe('auto');
    expect(value('.app .finance-modal', 'padding-bottom')).toBe('24px');
    expect(value('.app', 'padding-bottom')).toBe('var(--nh-nav-clearance)');
    expect(value('.app>nav', 'bottom')).toContain('safe-area-inset-bottom');
  });
  it.each([
    'finance/shared',
    'DocumentVault',
    'CalendarCenter',
    'ListsCenter',
    'FamilyCenter',
    'MealsCenter',
    'MaintenanceCenter',
    'PlanningCenter',
    'BackupCenter',
    'PwaInstallPrompt'
  ])('%s uses the shared modal classes', name => {
    const source = readFileSync(new URL('../' + name + '.tsx', import.meta.url), 'utf8');
    expect(source).toContain('className="modal-backdrop"');
    expect(source).toContain('className="finance-modal');
  });
});
