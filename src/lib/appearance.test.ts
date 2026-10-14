import {describe,expect,it} from 'vitest';
import {appearanceKey,defaultAppearance,normalizeAppearance} from './appearance';
describe('device appearance preferences',()=>{
 it('accepts valid preferences and removes unknown or duplicate favorite modules',()=>{
  expect(normalizeAppearance({accent:'forest',focus:'plans',favorites:['listas','bad','listas','familia']})).toEqual({accent:'forest',focus:'plans',favorites:['listas','familia'],cover:''});
 });
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
