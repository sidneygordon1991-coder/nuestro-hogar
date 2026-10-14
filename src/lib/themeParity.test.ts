import {describe,expect,it} from 'vitest';
import {parse} from 'postcss';
import mainRaw from '../main.tsx?raw';
import appRaw from '../App.tsx?raw';
// @ts-ignore Vitest runs in Node; application tsconfig intentionally excludes Node types.
import {readFileSync} from 'node:fs';
const names=['notifications','monthly-income','studio','premium','styles','AutomationCenter','BackupCenter','DiagnosticCenter','HouseholdHealthCenter','MonthlyCloseCenter','PlanningCenter'];
const sheets=names.map(name=>({name,root:parse(readFileSync(new URL('../'+name+'.css',import.meta.url),'utf8'))}));
const palette=parse(readFileSync(new URL('../theme-light.css',import.meta.url),'utf8'));
const palettes=palette.nodes.filter(node=>node.type==='rule'&&(node.selector==='html'||node.selector==='html[data-theme="light"]')).map(node=>{
 const roles:Record<string,string>={};
 if(node.type==='rule')node.walkDecls(d=>{if(d.prop.startsWith('--nh-'))roles[d.prop]=d.value});
 return roles;
});
function luminance(hex:string){
 return [1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255)
 .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
 .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

describe('whole-project theme contract',()=>{
 it('loads one shared palette before React and exposes the current switch state',()=>{
  expect(mainRaw).toContain("import './theme-light.css';initializeTheme();");
  expect(appRaw).toContain('aria-pressed={effectiveTheme===\'dark\'}');
 });
 it('defines the same roles in both themes',()=>{
  expect(palettes).toHaveLength(2);
  expect(Object.keys(palettes[0]).sort()).toEqual(Object.keys(palettes[1]).sort());
 });
 it.each(sheets)('$name uses shared theme roles for every color declaration',({root})=>{
  root.walkDecls(d=>{
   if(!/color|background|border|shadow|outline|fill|stroke/.test(d.prop)||d.value.includes('url('))return;
   // Fixed brand gradients are the only deliberate non-themed colors.
   if(d.parent?.type==='rule'&&['.brand-mark','.avatar'].includes(('selector' in d.parent ? String(d.parent.selector) : ''))&&d.prop==='background')return;
   expect(d.value,`${d.parent?.toString()} → ${d.prop}`).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|\bwhite\b|\bblack\b/i);
   for(const match of d.value.matchAll(/var\((--nh-[\w-]+)/g))for(const roles of palettes)expect(roles).toHaveProperty(match[1]);
  });
 });
 it.each(['dark','light'])('%s text, status colors and tinted cards have readable contrast',theme=>{
  const roles=palettes[theme==='dark'?0:1];
  for(const text of ['text','muted','accent','blue','purple','success','warning','danger']){
   for(const surface of ['page','surface','subtle','raised','neutral-soft','accent-soft','blue-soft','purple-soft','success-soft','warning-soft','danger-soft']){
    expect(contrast(roles['--nh-'+text],roles['--nh-'+surface]),`${theme}: ${text} / ${surface}`).toBeGreaterThanOrEqual(4.5);
   }
  }
  expect(contrast(roles['--nh-on-action'],roles['--nh-action'])).toBeGreaterThanOrEqual(4.5);
 });
 it.each([
  ['Inicio','control-hero','control-money'],['Finanzas','finance-panel','balance-track'],
  ['Familia','family-member-card','family-permission-row select'],['Agenda','calendar-panel','calendar-cell'],
  ['Listas','list-card-v2','list-item-v2'],['Documentos','document-card','document-kpis>div'],
  ['Comidas','meal-day','recipe-card'],['Mantenimiento','maintenance-asset-card','maintenance-kpis>div'],
  ['Automatizaciones','automation-hero','automation-rule-card'],['Respaldos','backup-panel','backup-export-card'],
  ['Diagnóstico','diagnostic-hero','diagnostic-system-card'],['Salud','health-hero','health-domain-card'],
  ['Cierre mensual','monthly-close-hero','monthly-close-metric'],['Planeación','planning-roadmap-panel','planning-goal-card'],
  ['Compartidos','notification-panel','global-command-panel'],['Ventanas','finance-modal','global-command-panel']
 ])('%s surfaces use the same tokens even when loaded later',(_module,main,nested)=>{
  for(const selector of [main,nested]){
   const declarations:string[]=[];
   for(const {root} of sheets)root.walkRules(rule=>{
    if(rule.selector.split(',').some(s=>s.trim()==='.'+selector))rule.walkDecls(d=>{if(d.prop==='background'||d.prop==='color')declarations.push(d.value)});
   });
   expect(declarations.length,selector).toBeGreaterThan(0);
   expect(declarations.some(value=>value.includes('var(--nh-')),selector).toBe(true);
  }
 });
 it('keeps chart data, risks and progress separate from card surfaces',()=>{
  const css=sheets.map(s=>s.root.toString()).join('\n');
  expect(css).toContain('conic-gradient(var(--nh-chart-success)');
  expect(css).toContain('.balance-track');
  expect(css).toContain('var(--nh-chart-danger)');
  expect(css).toContain('var(--nh-track)');
 });
 it('does not ship tiny labels or a competing light-mode patch in lazy styles',()=>{
  for(const {root} of sheets){
   root.walkDecls('font-size',d=>{if(/^\d+px$/.test(d.value))expect(parseInt(d.value)).toBeGreaterThanOrEqual(11)});
   root.walkRules(rule=>expect(rule.selector).not.toContain('data-theme="light"'));
  }
 });
});
