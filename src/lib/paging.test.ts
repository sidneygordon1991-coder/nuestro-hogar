import {describe,expect,it} from 'vitest';
import {fetchAllRows} from './paging';
describe('paged reads',()=>{
 it('keeps reading until a short page and never returns a truncated first page',async()=>{
  const data=Array.from({length:2501},(_,i)=>i);
  const calls:number[][]=[];
  const rows=await fetchAllRows(async(from,to)=>{calls.push([from,to]);return {data:data.slice(from,to+1),error:null}});
  expect(rows).toHaveLength(2501);expect(calls).toEqual([[0,999],[1000,1999],[2000,2999]]);
 });
 it('surfaces API errors instead of partial results',async()=>{
  await expect(fetchAllRows(async()=>({data:null,error:new Error('boom')}))).rejects.toThrow('boom');
 });
});
