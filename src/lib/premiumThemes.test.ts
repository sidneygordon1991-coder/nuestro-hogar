import {describe,expect,it} from 'vitest';
import {parse} from 'postcss';
// @ts-ignore Vitest runs in Node; application tsconfig intentionally excludes Node types.
import {readFileSync} from 'node:fs';
import {defaultAppearance,normalizeAppearance} from './appearance';

const stylesheet=parse(readFileSync(new URL('../theme-light.css',import.meta.url),'utf8'));
const options=['royal','violet','copper','wine'] as const;
const required=['accent','accent-soft','accent-border','action','on-action','hero','brand','brand-muted','brand-accent','chart-accent'] as const;
function declarations(selector:string){
 const rule=stylesheet.nodes.find(n=>n.type==='rule'&&n.selector===selector);
 const map:Record<string,string>={};
 if(rule?.type==='rule')rule.walkDecls(d=>{if(d.prop.startsWith('--nh-'))map[d.prop]=d.value});
 return map;
}
function brightness(color:string){
 const channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 return channels.map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4)
 .reduce((total,n,i)=>total+n*[.2126,.7152,.0722][i],0);
}
function contrast(a:string,b:string){
 const l1=brightness(a),l2=brightness(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
}

describe('image-reference color schemes',()=>{
 it('accepts the four new schemes without losing previous saved preferences',()=>{
  for(const accent of [...options,'ocean','iris','forest'] as const)
   expect(normalizeAppearance({accent}).accent).toBe(accent);
  expect(normalizeAppearance({accent:'invalid'}).accent).toBe(defaultAppearance.accent);
 });
 it.each(options)('%s changes the entire brand and chart, not just button text',accent=>{
  for(const selector of [
   `html .app.app-studio[data-accent="${accent}"]`,
   `html[data-theme="light"] .app.app-studio[data-accent="${accent}"]`
  ]){
   const values=declarations(selector);
   for(const token of required)expect(values).toHaveProperty('--nh-'+token);
   expect(values['--nh-accent']).toMatch(/^#[\\da-f]{6}$/i);
   expect(contrast(values['--nh-on-action'],values['--nh-action'])).toBeGreaterThanOrEqual(4.5);
  }
 });
 it('uses a neutral light-gray page while preserving separate card surfaces',()=>{
  const light=declarations('html[data-theme="light"]');
  expect(light['--nh-page']).toBe('#eff2f6');
  expect(light['--nh-surface']).not.toBe(light['--nh-page']);
 });
});
