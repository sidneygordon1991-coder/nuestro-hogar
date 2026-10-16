import {describe,expect,it} from 'vitest';
import {budgetPercent,budgetProgress,categorySpending} from './budgetProgress';

describe('budget availability from registered expenses',()=>{
 it('fills with spending and retains the remaining money and percentage',()=>{
  expect(budgetProgress(1000,350)).toMatchObject({fill:35,remaining:650,availablePercent:65,state:'available'});
  expect(budgetProgress(1000,0)).toMatchObject({fill:0,availablePercent:100});
 });
 it('uses cents for limits and reports excess without negative available money',()=>{
  expect(budgetProgress(.3,.1+.2)).toMatchObject({remaining:0,excess:0,state:'reached'});
  expect(budgetProgress(1000,800)).toMatchObject({state:'near',remaining:200});
  expect(budgetProgress(1000,1250)).toMatchObject({fill:100,usedPercent:125,availablePercent:0,remaining:0,excess:250,state:'exceeded'});
 });
 it('does not invent a percentage when no budget exists or data is invalid',()=>{
  for(const spent of [0,10])expect(budgetProgress(0,spent)).toMatchObject({state:'unplanned',usedPercent:null,availablePercent:null});
  for(const [planned,spent] of [[NaN,10],[100,Infinity],[-1,0],[10,-1]])expect(budgetProgress(planned,spent)).toBeNull();
 });
 it('does not round a small available amount to a misleading zero or a tiny expense to fully available',()=>{
  expect(budgetPercent(budgetProgress(1000,999.99)!.availablePercent!)).toBe('<0.01%');
  expect(budgetPercent(budgetProgress(1000,.01)!.availablePercent!)).toBe('>99.99%');
 });
 it('separates halves and months, excludes future entries, and ignores income and other rubrics',()=>{
  const expense=(date:string,amount:number|string,category_id:string|null='food')=>({type:'expense',category_id,transaction_date:date,amount});
  const rows=[expense('2026-10-15',.1),expense('2026-10-15','0.20'),expense('2026-10-16',30),expense('2026-10-17',900),expense('2026-09-15',600),expense('2026-10-15',800,'rent'),{...expense('2026-10-15',1000),type:'income'}];
  expect(categorySpending(rows,'food','2026-10-01','first','2026-10-16')).toBe(.3);
  expect(categorySpending(rows,'food','2026-10-01','second','2026-10-16')).toBe(30);
  expect(categorySpending(rows,'food','2026-10-01','month','2026-10-16')).toBe(30.3);
 });
});
