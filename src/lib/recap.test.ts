import {describe,expect,it} from 'vitest';
import {fortnightRecap,periodTotals,recapText} from './recap';
import type {CashFlowSource} from './cashFlow';
const source:CashFlowSource={month:'2026-10-01',today:'2026-10-28',
 transactions:[
  {id:'1',type:'income',amount:4000,transaction_date:'2026-10-15',category_id:null,paid_by:'a'},
  {id:'2',type:'expense',amount:1000,transaction_date:'2026-10-05',category_id:'food',paid_by:'a'},
  {id:'3',type:'expense',amount:500,transaction_date:'2026-10-10',category_id:'fun',paid_by:'a'},
  {id:'4',type:'expense',amount:800,transaction_date:'2026-10-20',category_id:'food',paid_by:'a'},
  {id:'5',type:'expense',amount:100,transaction_date:'2026-10-21',category_id:'fun',paid_by:'a'},
  {id:'6',type:'expense',amount:999,transaction_date:'2026-10-30',category_id:'fun',paid_by:'a'}],
 savings:[{amount:300,contribution_date:'2026-10-03'},{amount:600,contribution_date:'2026-10-18'}],
 categories:[{id:'food',name:'Supermercado',budget_group:'variable'},{id:'fun',name:'Salidas',budget_group:'variable'}] as unknown as CashFlowSource['categories'],
 allocations:[{month:'2026-10-01',category_id:'food',planned_amount:2000,first_half_amount:1000,second_half_amount:1000},{month:'2026-10-01',category_id:'fun',planned_amount:300,first_half_amount:250,second_half_amount:50}],
 members:[{user_id:'a',full_name:'A'}],plans:[],recurring:[],occurrences:[]};
describe('fortnight recap',()=>{
 it('compares the second fortnight with the first, ignoring future movements',()=>{
  const r=fortnightRecap(source);
  expect(r.title).toBe('Tu quincena del 16 al 31 de octubre');
  expect([r.income,r.expense,r.saving]).toEqual([0,900,600]);
  expect(r.expenseChange).toBe(-40);expect(r.savingChange).toBe(100);
  expect([r.within,r.budgeted]).toEqual([1,2]);
  expect(r.topCategory).toEqual({name:'Supermercado',amount:800,change:-20});
  expect(r.highlights).toEqual(['Ahorraste Q 600 (100% más que la quincena anterior)','Gastaste 40% menos que la quincena anterior','1 de 2 rubros dentro del presupuesto','Supermercado: -20% frente a la quincena anterior']);
  expect(recapText(r,'Hogar QA')).toContain('Tu quincena del 16 al 31 de octubre · Hogar QA');
 });
 it('uses the previous month totals for the first fortnight',()=>{
  const prev=periodTotals([{id:'x',type:'expense',amount:2000,transaction_date:'2026-09-20',category_id:'food',paid_by:'a'}],[],'2026-09-16','2026-09-30','2026-10-28');
  const r=fortnightRecap({...source,today:'2026-10-14'},prev,'first');
  expect(r.expense).toBe(1500);expect(r.expenseChange).toBe(-25);expect(r.topCategory?.change).toBe(-50);
  expect(fortnightRecap({...source,today:'2026-10-14'},null,'first').expenseChange).toBeNull();
 });
});
