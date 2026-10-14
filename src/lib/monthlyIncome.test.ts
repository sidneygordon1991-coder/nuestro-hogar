import {describe,expect,it} from 'vitest';
import {incomeAmount,monthlyIncomeSummary} from './monthlyIncome';
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
