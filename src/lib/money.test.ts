import {describe,expect,it} from 'vitest';
import {formatMoney} from './money';
describe('compact quetzal display',()=>{
 it('preserves cents, large amounts and negative signs without a browser-dependent currency code',()=>{
  expect(formatMoney(0)).toBe('Q\u00a00');
  expect(formatMoney(6500.25)).toBe('Q\u00a06,500.25');
  expect(formatMoney(-1200000.5)).toBe('−Q\u00a01,200,000.5');
 });
});
