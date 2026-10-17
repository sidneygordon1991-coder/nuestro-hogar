import {describe,expect,it} from 'vitest';
import {appearanceAccents,appearanceKey,defaultAppearance,normalizeAppearance} from './appearance';
describe('device appearance preferences',()=>{
 it('retains every finish including existing saved blue, green and lavender preferences',()=>{
  expect(appearanceAccents.map(a=>a.id)).toEqual(['ocean','forest','graphite','aurora','iris']);
  for(const {id} of appearanceAccents)expect(normalizeAppearance({accent:id}).accent).toBe(id);
 });
 it('accepts valid preferences and removes unknown or duplicate favorite modules',()=>{
  expect(normalizeAppearance({accent:'forest',focus:'plans',favorites:['listas','bad','listas','familia']})).toEqual({accent:'forest',focus:'plans',view:'complete',favorites:['listas','familia'],cover:''});
 });
 it('keeps the complete experience by default and accepts essential navigation',()=>{expect(normalizeAppearance({}).view).toBe('complete');expect(normalizeAppearance({view:'essential'}).view).toBe('essential')});
 it('rejects remote, SVG and oversized covers while retaining supported raster data',()=>{
  for(const cover of ['https://example.invalid/photo.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,'+'A'.repeat(900001)])expect(normalizeAppearance({cover}).cover).toBe('');
  expect(normalizeAppearance({cover:'data:image/png;base64,AAAA'}).cover).toBe('data:image/png;base64,AAAA');
 });
 it('keeps preferences separated by both authenticated account and household',()=>{
  expect(appearanceKey('a','home')).not.toBe(appearanceKey('b','home'));
  expect(appearanceKey('a','home')).not.toBe(appearanceKey('a','other'));
 });
 it('recovers malformed values and limits favorites without inventing financial data',()=>{
  expect(normalizeAppearance(null)).toEqual(defaultAppearance);
  expect(normalizeAppearance({accent:'other',focus:'other',favorites:[]})).toEqual({...defaultAppearance,favorites:[]});
 });
});
