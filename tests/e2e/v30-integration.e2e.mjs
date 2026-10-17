import {test,expect} from '@playwright/test';
import {setup,ready,healthy,chooseFinance,day,hh,uid} from './support.mjs';
const bank='90000000-0000-4000-8000-000000000001';

test('refreshing the home source refreshes account balances and a failed read hides unverified results',async({browser},info)=>{
 const s=await setup(browser,{rich:true});let balance=2000.01,fail=false;
 await s.page.route('**/rest/v1/finance_accounts?**',r=>r.fulfill({status:fail?500:200,json:fail?{message:'Account unavailable'}:[{id:bank,name:'Banco QA',account_type:'checking',account_class:'asset',opening_balance:balance,active:true}]}));
 try{
  await ready(s,'');await expect(s.page.locator('.home-hero-minis')).toContainText('2,000.01');
  for(const width of [320,390,1024,1440]){await s.page.setViewportSize({width,height:844});await healthy(s);for(const amount of await s.page.locator('.home-kpi strong:visible,.home-hero-minis strong:visible').all())expect(await amount.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1)).toBe(true);if(width===320||width===1440)await info.attach('verified-amounts-'+width,{body:await s.page.screenshot(),contentType:'image/png'})}
  balance=3000.25;await s.page.getByRole('button',{name:'Actualizar resumen',exact:true}).click();await expect(s.page.locator('.home-hero-minis')).toContainText('3,000.25');
  fail=true;await s.page.getByRole('button',{name:'Actualizar resumen',exact:true}).click();await expect(s.page.locator('.home-hero-chip')).toContainText('No pudimos verificar');await expect(s.page.locator('.home-hero h2')).toHaveText('Q —');await expect(s.page.locator('.home-chart')).toHaveCount(0);await expect(s.page.locator('.home-hero-calc')).toHaveCount(0);
  fail=false;balance=4000.75;await s.page.getByRole('region',{name:'Tus cuentas',exact:true}).getByRole('button',{name:'Reintentar cuentas',exact:true}).click();await expect(s.page.locator('.home-hero-minis')).toContainText('4,000.75');await expect(s.page.locator('.home-chart svg')).toBeVisible();await healthy(s);
 }finally{await s.context.close()}
});

test('Finance hides incomplete account balances and net worth after a later account page fails',async({browser})=>{
 const s=await setup(browser,{rich:true});let fail=true;
 const movements=Array.from({length:1001},(_,i)=>({id:'bank-income-'+i,account_id:bank,type:'income',amount:1,transaction_date:day}));
 await s.page.route('**/rest/v1/finance_accounts?**',r=>r.fulfill({json:[{id:bank,name:'Banco paginado',account_type:'checking',account_class:'asset',opening_balance:100,active:true,is_shared:true}]}));
 await s.page.route('**/rest/v1/transactions?**',r=>{const q=new URL(r.request().url()).searchParams;if(!q.has('account_id'))return r.fallback();const from=Number(q.get('offset')||0);return r.fulfill({status:fail&&from>0?503:200,json:fail&&from>0?{message:'Account page unavailable'}:movements.slice(from,from+1000)})});
 try{
  await ready(s,'presupuesto');await chooseFinance(s,'Cuentas');await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar los saldos completos');await expect(s.page.locator('.account-card')).toHaveCount(0);
  await chooseFinance(s,'Patrimonio');await expect(s.page.locator('.net-worth-hero')).toHaveCount(0);
  fail=false;await s.page.getByRole('button',{name:'Reintentar saldos',exact:true}).click();await expect(s.page.locator('.net-worth-hero h3')).toContainText('1,101');await chooseFinance(s,'Cuentas');await expect(s.page.locator('.account-card')).toContainText('1,101');await healthy(s);
 }finally{await s.context.close()}
});

test('home and Finance include every monthly page and never show a partial result after a later-page failure',async({browser})=>{
 const s=await setup(browser,{rich:true});let failLater=false;const offsets=[];
 const rows=[...Array.from({length:1001},(_,i)=>({id:'expense-'+i,household_id:hh,description:'Gasto QA '+i,type:'expense',amount:1,transaction_date:day,category_id:null,paid_by:uid,account_id:null,is_shared:true})),{id:'income-last',household_id:hh,description:'Ingreso al final',type:'income',amount:5000,transaction_date:day,category_id:null,paid_by:uid,account_id:null,is_shared:true}];
 await s.page.route('**/rest/v1/goal_contributions?**',r=>r.fulfill({json:[]}));
 await s.page.route('**/rest/v1/transactions?**',r=>{const q=new URL(r.request().url()).searchParams;if(q.has('account_id'))return r.fulfill({json:[]});const from=Number(q.get('offset')||0),limit=Number(q.get('limit')||1000);offsets.push(from);return r.fulfill({status:failLater&&from>0?503:200,json:failLater&&from>0?{message:'Later page unavailable'}:rows.slice(from,from+limit)})});
 try{
  await ready(s,'');await expect(s.page.locator('.home-hero-minis')).toContainText('3,999');expect(offsets).toContain(1000);
  await ready(s,'presupuesto');await expect(s.page.locator('.studio-finance-hero h3')).toContainText('3,999');await healthy(s);
  // A 503 is retried by the Supabase client before it surfaces as a failed result.
  await ready(s,'');failLater=true;await s.page.getByRole('button',{name:'Actualizar resumen',exact:true}).click();await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar el resumen',{timeout:20000});await expect(s.page.locator('.home-hero')).toHaveCount(0);
  failLater=false;await s.page.getByRole('alert').getByRole('button',{name:'Reintentar',exact:true}).click();await expect(s.page.locator('.home-hero-minis')).toContainText('3,999');await healthy(s);
 }finally{await s.context.close()}
});
