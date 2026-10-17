import {describe,expect,it} from 'vitest';
import {DEFAULT_USD_RATE,formatEntryAmount,formatUsd,usdRate,usdToQuetzales} from './currency';
describe('quetzales and dollars',()=>{
 it('converts dollars to quetzales once, rounded to cents',()=>{expect(usdToQuetzales(50,7.75)).toBe(387.5);expect(usdToQuetzales(19.99,7.7123)).toBe(154.17)});
 it('formats dollar entries next to their quetzal value',()=>{expect(formatUsd(50)).toBe('US$ 50');expect(formatUsd(12.5)).toBe('US$ 12.50');expect(formatEntryAmount(387.5,{original_currency:'USD',original_amount:50})).toBe('US$ 50 · Q 387.50');expect(formatEntryAmount(100)).toBe('Q 100')});
 it('falls back to the default rate for missing or absurd values',()=>{expect(usdRate(null)).toBe(DEFAULT_USD_RATE);expect(usdRate('7.8')).toBe(7.8);expect(usdRate(-1)).toBe(DEFAULT_USD_RATE)});
});

it('rounds dollar half-cents exactly as PostgreSQL numeric',()=>{expect(usdToQuetzales(1,1.005)).toBe(1.01);expect(usdToQuetzales(50,7.75)).toBe(387.5)});
