import {describe,expect,it} from 'vitest';
import {effectivePayDays,incomeAmount,monthlyIncomeSummary,payDayLabel,payDays,usdRateInput} from './monthlyIncome';
const people=[{user_id:'a',full_name:'A'},{user_id:'b',full_name:'B'}];
describe('monthly expected income',()=>{
 it('keeps each month and an explicit zero separate from the reference',()=>{
  const plans=[{user_id:'a',month:'2026-10-01',expected_amount:0},{user_id:'a',month:'2026-11-01',expected_amount:200}];
  expect(monthlyIncomeSummary('2026-10-01',people,plans,[],{a:100,b:50}).expected).toBe(50);
  expect(monthlyIncomeSummary('2026-11-01',people,plans,[],{a:100,b:50}).expected).toBe(250);
  expect(monthlyIncomeSummary('2027-01-01',people,plans,[],{a:100,b:50}).hasPlan).toBe(false);
 });
 it('counts only real income in that month, including partial and unassigned payments',()=>{
  const result=monthlyIncomeSummary('2026-10-01',people,[{user_id:'a',month:'2026-10-01',expected_amount:1000}], [
   {type:'income',amount:200.15,transaction_date:'2026-10-01',paid_by:'a'},
   {type:'income',amount:300.10,transaction_date:'2026-10-15',paid_by:'a'},
   {type:'expense',amount:100,transaction_date:'2026-10-15',paid_by:'a'},
   {type:'income',amount:900,transaction_date:'2026-11-01',paid_by:'a'},
   {type:'income',amount:50,transaction_date:'2026-10-20',paid_by:null},
   {type:'income',amount:25,transaction_date:'2026-10-20',paid_by:'former-member'}
  ]);
  expect(result.rows[0]).toMatchObject({received:500.25,pending:499.75});
  expect(result.received).toBe(575.25);expect(result.unassigned).toBe(75);
 });
 it('does not let one person’s extra payment erase another person’s expected payment',()=>{
  const result=monthlyIncomeSummary('2026-10-01',people,[],[{type:'income',amount:3000,transaction_date:'2026-10-15',paid_by:'a'}],{a:1000,b:1000});
  expect(result.rows[0].extra).toBe(2000);expect(result.pending).toBe(1000);
 });
 it('rejects invalid financial input and preserves cents',()=>{
  for(const invalid of ['','-1','NaN','Infinity','1.234','10000000000','1,200'])expect(()=>incomeAmount(invalid)).toThrow();
  expect(incomeAmount('0')).toBe(0);expect(incomeAmount('1234.56')).toBe(1234.56);expect(incomeAmount('9999999999.99')).toBe(9999999999.99);
 });
});
describe('pay days and dollar rate settings',()=>{
 it('treats missing pay days as the 15th and the last day of the month',()=>{
  expect(effectivePayDays(null)).toEqual({first:15,second:31});
  expect(effectivePayDays({first_pay_day:null,second_pay_day:null})).toEqual({first:15,second:31});
  expect(effectivePayDays({first_pay_day:1,second_pay_day:20})).toEqual({first:1,second:20});
  expect(payDayLabel(31)).toBe('Último día del mes');expect(payDayLabel(5)).toBe('Día 5');
 });
 it('validates each fortnight range with Spanish messages',()=>{
  expect(payDays('1','16')).toEqual({first_pay_day:1,second_pay_day:16});
  expect(payDays(' 15 ','31')).toEqual({first_pay_day:15,second_pay_day:31});
  for(const bad of ['0','16','','1.5','-1','abc'])expect(()=>payDays(bad,'31')).toThrow(/primera quincena/);
  for(const bad of ['15','32','','20.5'])expect(()=>payDays('15',bad)).toThrow(/segunda quincena/);
 });
 it('accepts a dollar rate between 1 and 100 with up to four decimals',()=>{
  expect(usdRateInput('7.75')).toBe(7.75);expect(usdRateInput('7,8125')).toBe(7.8125);expect(usdRateInput('1')).toBe(1);expect(usdRateInput('100')).toBe(100);
  for(const bad of ['0.99','100.01','0','','abc','7.12345','-7'])expect(()=>usdRateInput(bad)).toThrow();
  expect(()=>usdRateInput('150')).toThrow(/entre Q 1 y Q 100/);
 });
});
