import {describe,expect,it} from 'vitest';
import {parse} from 'postcss';
import commands from '../GlobalCommandCenter.tsx?raw';
// @ts-ignore Vitest runs in Node; the application tsconfig excludes Node types.
import {readFileSync} from 'node:fs';
const styles=parse(readFileSync(new URL('../styles.css',import.meta.url),'utf8'));
function declarations(selector:string,property:string,mobile=false){
 const values:string[]=[];
 styles.walkRules(rule=>{
  const parent=rule.parent;
  const inMedia=parent?.type==='atrule'&&'params' in parent;
  if(inMedia&&!mobile)return;
  if(rule.selector.split(',').map(s=>s.trim()).includes(selector))rule.walkDecls(property,d=>{values.push(d.value)});
 });return values;
}
const last=(values:string[])=>values[values.length-1];
describe('quick action dialog layout regression',()=>{
 it('namespaces dialog modes so the legacy .quick toolbar cannot resize its cards',()=>{
  expect(commands).toContain("className={'global-command-panel global-command-panel--'+mode}");
  expect(commands).not.toContain("className={'global-command-panel '+mode}");
  expect(commands).toContain('role="dialog" aria-modal="true" aria-labelledby="global-command-title"');
  expect(commands).toContain('aria-label="Cerrar ventana"');
 });
 it('stacks the header above full-width cards and lets mobile text wrap',()=>{
  expect(last(declarations('.global-command-panel','display'))).toBe('block');
  expect(last(declarations('.global-command-panel .quick-action-card','width'))).toBe('100%');
  expect(last(declarations('.global-command-panel .quick-action-card','grid-template-columns'))).toBe('44px minmax(0,1fr) 18px');
  expect(last(declarations('.global-command-panel .quick-action-card>div','min-width'))).toBe('0');
  expect(last(declarations('.global-command-panel .quick-action-card>div','overflow-wrap'))).toBe('anywhere');
  expect(last(declarations('.global-command-panel .quick-action-grid','grid-template-columns',true))).toBe('minmax(0,1fr)');
  expect(last(declarations('.global-command-panel','max-height',true))).toBe('calc(100dvh - 20px)');
 });
});
