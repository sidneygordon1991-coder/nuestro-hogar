import {describe,it,expect} from 'vitest';
import {linkedSavings,simulateMargin} from './connectedFinance';
describe('connected financial presentation',()=>{
 it('counts each linked goal once, in its mapped month, net of withdrawals and without future entries',()=>{
  const links=[{goal_id:'g1',category_id:'saving',month:'2026-10-01'},{goal_id:'g2',category_id:'saving',month:'2026-10-01'},{goal_id:'g1',category_id:'other',month:'2026-09-01'}];
  const entries=[{goal_id:'g1',amount:100,contribution_date:'2026-10-03'},{goal_id:'g1',amount:-30,contribution_date:'2026-10-05'},{goal_id:'g2',amount:20,contribution_date:'2026-10-10'},{goal_id:'g1',amount:900,contribution_date:'2026-10-20'},{goal_id:'g1',amount:500,contribution_date:'2026-09-03'}];
  expect(linkedSavings('saving','2026-10-01',links,entries,'2026-10-16')).toEqual({linked:2,net:90});expect(linkedSavings('other','2026-10-01',links,entries,'2026-10-16')).toEqual({linked:0,net:0});
 });
 it('retains negative monthly savings when a previous reserve is withdrawn',()=>expect(linkedSavings('s','2026-10-01',[{goal_id:'g',category_id:'s',month:'2026-10-01'}],[{goal_id:'g',amount:-50,contribution_date:'2026-10-01'}],'2026-10-16').net).toBe(-50));
 it('simulates explicit changes in cents and preserves negative forecasts',()=>{expect(simulateMargin(1000,200,300,400,600)).toBe(-100);expect(simulateMargin(.3,.1,0,.2,0)).toBe(.2);expect(simulateMargin(1000,-1,0,0,0)).toBeNull();expect(simulateMargin(Infinity,0,0,0,0)).toBeNull()});
});
