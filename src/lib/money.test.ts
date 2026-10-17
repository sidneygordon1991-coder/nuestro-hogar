import {describe,expect,it} from 'vitest';
import {formatMoney,maskAmountsIn,setAmountsHidden} from './money';
describe('compact quetzal display',()=>{
 it('preserves cents, large amounts and negative signs without a browser-dependent currency code',()=>{
  expect(formatMoney(0)).toBe('Q\u00a00');
  expect(formatMoney(6500.25)).toBe('Q\u00a06,500.25');
  expect(formatMoney(-1200000.5)).toBe('−Q\u00a01,200,000.50');
  expect(formatMoney(-0.001)).toBe('Q\u00a00');
  expect(formatMoney(6539.5)).toBe('Q\u00a06,539.50');
  expect(formatMoney(Number.NaN)).toBe('Q\u00a00');
 });
 it('masks every amount while "Ocultar montos" is active',()=>{
  setAmountsHidden(true);try{expect(formatMoney(6500.25)).toBe('Q\u00a0•••••');expect(formatMoney(-3)).toBe('Q\u00a0•••••')}finally{setAmountsHidden(false)}
  expect(formatMoney(3)).toBe('Q\u00a03');
 });
});
describe('maskAmountsIn',()=>{
 it('masks quetzal and dollar amounts only while hidden',()=>{
  expect(maskAmountsIn('Q 1,300 · pago')).toBe('Q 1,300 · pago');
  setAmountsHidden(true);
  try{expect(maskAmountsIn('Quedan Q 1,080.50 y US$ 50 para el 20')).toBe('Quedan Q ••••• y US$ ••••• para el 20')}finally{setAmountsHidden(false)}
 });
});
