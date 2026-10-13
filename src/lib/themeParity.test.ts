import {describe,expect,it} from 'vitest';
import mainRaw from '../main.tsx?raw';
import menuRaw from '../AppMenu.tsx?raw';
import appRaw from '../App.tsx?raw';
// @ts-ignore Node built-in is available to Vitest; the web-only tsconfig omits Node typings.
import {readFileSync} from 'node:fs';
const baseCss=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const parityCss=readFileSync(new URL('../theme-light.css',import.meta.url),'utf8');

/** Static contract: all routes share the same DOM theme attribute and CSS. */
describe('day/night theme across every household module',()=>{
 it('loads the parity layer globally before mounting React',()=>{
  expect(mainRaw).toContain("import './styles.css';import './theme-light.css';initializeTheme();");
  expect(menuRaw).toContain("document.documentElement.dataset.theme=effective");
  expect(menuRaw).toContain("window.dispatchEvent(new CustomEvent('nh:theme-change'");
  expect(appRaw).toContain('className="header-theme-toggle" onClick={toggleTheme}');
 });
 it('has semantic tokens for dark and light mode',()=>{
  expect(parityCss).toContain('html {');
  expect(parityCss).toContain('html[data-theme="light"] {');
  for(const token of ['--nh-page','--nh-surface','--nh-subtle','--nh-border','--nh-text','--nh-muted','--nh-accent','--nh-track']){
   expect(parityCss).toContain(token);
  }
 });
 it.each([
  ['Inicio','control-hero','home-control'],
  ['Finanzas','finance-panel','finance-tabs'],
  ['Familia','family-member-card','family-access-panel'],
  ['Agenda','calendar-panel','calendar-cell'],
  ['Listas','list-card-v2','list-item-v2'],
  ['Documentos','document-card','document-kpis'],
  ['Comidas','meal-day','recipe-card'],
  ['Mantenimiento','maintenance-asset-card','maintenance-kpis'],
  ['Automatizaciones','automation-hero','automation-rule-card'],
  ['Respaldos','backup-panel','backup-export-card'],
  ['Diagnóstico','diagnostic-hero','diagnostic-system-card'],
  ['Salud','health-hero','health-domain-card'],
  ['Cierre mensual','monthly-close-hero','monthly-close-metric'],
  ['Planeación','planning-roadmap-panel','planning-goal-card']
 ])('covers %s main surface and nested card',(_module,main,card)=>{
  const css=baseCss+parityCss;
  expect(css).toContain('.'+main);
  expect(css).toContain('.'+card);
  const light=css.slice(css.indexOf('html[data-theme="light"]'));
  expect(light).toContain('.'+main);
  expect(light).toContain('.'+card);
 });
 it('does not flatten risk status and progress indicators into neutral text',()=>{
  for(const token of ['--nh-success','--nh-warning','--nh-danger']){
   expect(parityCss).toContain(token);
  }
  expect(parityCss).toContain('.health-hero.watch');
  expect(parityCss).toContain('.health-hero.risk');
  expect(parityCss).toContain('conic-gradient(');
  expect(parityCss).toContain('.planning-tabs button.active');
 });
});
