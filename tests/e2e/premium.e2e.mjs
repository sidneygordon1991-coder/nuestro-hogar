import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,chooseFinance,healthy,uid,hh,rid,day,monthStart} from './support.mjs';
const modules=['presupuesto','calendario','listas','familia','documentos','comidas','mantenimiento','planeacion','salud','cierre','automatizaciones','respaldos','diagnostico'];

for(const theme of ['light','dark'])test(`all modules, guides, layouts and accessibility: ${theme}`,async({browser},testInfo)=>{
 const s=await setup(browser,{rich:true,theme});const violations=[];
 try{
  for(const tab of modules){
   await ready(s,tab);await expect(s.page.locator('.workspace-title')).toBeVisible();
   for(const width of [320,390,768,1440]){await s.page.setViewportSize({width,height:840});await healthy(s)}
   await s.page.locator('.workspace-help summary').click();await expect(s.page.locator('.workspace-help li')).toHaveCount(3);
   await s.page.locator('.workspace-help summary').click();
   const result=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   await testInfo.attach('accessibility-'+tab,{body:JSON.stringify(result.violations,null,2),contentType:'application/json'});
   violations.push(...result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({tab,id:v.id,nodes:v.nodes.map(n=>n.target)})));
  }
  expect(violations).toEqual([]);
 }finally{await s.context.close()}
});

test('home and Finance agree; future movements remain visible without becoming actual income',async({browser})=>{
 const s=await setup(browser,{rich:true,futureMovement:true});
 try{
  await ready(s,'');const balance=await s.page.locator('.premium-chart figcaption b').innerText();
  await ready(s,'presupuesto');await expect(s.page.locator('.studio-finance-hero h3')).toHaveText(balance);
  await expect(s.page.locator('.finance-cutoff-note')).toContainText('fecha futura');await chooseFinance(s,'Movimientos');await expect(s.page.getByText('Ingreso con fecha futura',{exact:true})).toBeVisible();await expect(s.page.locator('.transaction-row').filter({hasText:'Ingreso con fecha futura'})).toContainText('excluido del balance real');
  await chooseFinance(s,'Ingresos');await expect(s.page.getByRole('heading',{name:'Lo que esperamos recibir'})).toBeVisible();
  await ready(s,'');await expect(s.page.getByRole('group',{name:'Lo siguiente para tu dinero'})).toHaveCount(0);
  await s.page.locator('.premium-period-details>summary').click();await expect(s.page.locator('.home-money-answers')).toBeVisible();
 }finally{await s.context.close()}
});

test('a summary query failure shows retry and hides unverified balances',async({browser})=>{
 const s=await setup(browser,{rich:true});
 try{
  await s.page.route('**/rest/v1/transactions?**',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'QA unavailable'})}));
  await ready(s,'');await expect(s.page.getByRole('alert')).toContainText('No pudimos verificar');
  await expect(s.page.locator('.balance-flow')).toHaveCount(0);await expect(s.page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible();
  await ready(s,'presupuesto');await expect(s.page.getByRole('alert')).toContainText('No se pudo verificar');await expect(s.page.locator('.studio-finance-hero')).toHaveCount(0);
 }finally{await s.context.close()}
});

test('withdrawal capability is optional and failure preserves amount, date and request ID',async({browser})=>{
 const s=await setup(browser,{rich:true,ledgerAvailable:true,saveFailure:true});
 try{
  await ready(s,'presupuesto');await chooseFinance(s,'Metas');await s.page.getByRole('button',{name:'Retirar',exact:true}).click();
  await s.page.getByLabel('Monto (Q)',{exact:true}).fill('50.25');
  await s.page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(s.page.getByRole('alert')).toContainText('No se pudo confirmar');
  await expect(s.page.getByLabel('Monto (Q)',{exact:true})).toHaveValue('50.25');
  await s.page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(s.page.getByRole('button',{name:'Confirmar retiro',exact:true})).toBeEnabled();
  const calls=s.calls.filter(c=>c.path.endsWith('/save_savings_entry'));expect(calls).toHaveLength(2);expect(calls[0].body.p_entry_id).toBe(calls[1].body.p_entry_id);
  await s.page.setViewportSize({width:320,height:640});await healthy(s);
  await expect(s.page.locator('.app>nav')).not.toBeVisible();await s.page.getByRole('button',{name:'Confirmar retiro',exact:true}).scrollIntoViewIfNeeded();
 }finally{await s.context.close()}
 const legacy=await setup(browser,{rich:true});try{await ready(legacy,'presupuesto');await chooseFinance(legacy,'Metas');await expect(legacy.page.getByRole('button',{name:'Retirar',exact:true})).toHaveCount(0)}finally{await legacy.context.close()}
});

test('withdrawal is a net savings movement, and read-only users cannot write',async({browser})=>{
 const s=await setup(browser,{rich:true,ledgerAvailable:true});
 try{await ready(s,'presupuesto');await chooseFinance(s,'Metas');await s.page.getByRole('button',{name:'Retirar',exact:true}).click();await s.page.getByLabel('Monto (Q)',{exact:true}).fill('50.25');await s.page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();await expect(s.page.locator('.modal-backdrop')).toHaveCount(0);await expect(s.page.locator('.savings-history-list')).toContainText('Retiro');expect(s.entries().contributions.some(c=>Number(c.amount)===-50.25)).toBe(true)}finally{await s.context.close()}
 const ro=await setup(browser,{rich:true,ledgerAvailable:true,accessOverride:Object.fromEntries(['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'].map(k=>[k,'view']))});
 try{await ready(ro,'presupuesto');await chooseFinance(ro,'Metas');await expect(ro.page.getByRole('button',{name:/Retirar|Editar aporte|Eliminar aporte|Agregar aporte/})).toHaveCount(0);expect(ro.calls.some(c=>c.path.endsWith('/finance_member_settings')&&c.body)).toBe(false)}finally{await ro.context.close()}
});

test('offline status describes the PWA limits and clears when connection returns',async({browser})=>{
 const s=await setup(browser,{rich:true});try{await ready(s,'');await s.context.setOffline(true);await expect(s.page.getByText('Sin conexión.',{exact:false})).toBeVisible();await s.context.setOffline(false);await expect(s.page.getByText('Sin conexión.',{exact:false})).toHaveCount(0)}finally{await s.context.close()}
});

test('a delayed response from another household cannot overwrite the active balance',async({browser})=>{
 const s=await setup(browser,{rich:true,twoHomes:true});let release;
 const oldResponse=new Promise(resolve=>{release=resolve});
 try{
  await s.page.route('**/rest/v1/transactions?**',async route=>{const q=new URL(route.request().url()).searchParams;const selected=q.get('household_id')==='eq.'+rid;if(!selected)await oldResponse;await route.fulfill({contentType:'application/json',body:JSON.stringify([{id:selected?'b-income':'a-income',type:'income',amount:selected?2222:1111,transaction_date:day,category_id:null,paid_by:uid}])})});
  await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');await s.page.getByLabel('Cambiar de familia',{exact:true}).selectOption(rid);
  await s.page.locator('.premium-period-details>summary').click();await expect(s.page.locator('.home-money-answers')).toBeVisible();const current=await s.page.locator('.premium-chart figcaption b').innerText();
  release();await s.page.waitForResponse(r=>r.url().includes('/transactions?')&&r.url().includes(encodeURIComponent('eq.'+hh)));
  await expect(s.page.getByLabel('Cambiar de familia',{exact:true})).toHaveValue(rid);await expect(s.page.locator('.premium-chart figcaption b')).toHaveText(current);await expect(s.page.locator('.studio-metrics')).toContainText('2,222');
 }finally{release();await s.context.close()}
});

test('failed household loading never invites the user to create a duplicate household',async({browser})=>{
 const s=await setup(browser,{rich:true});try{
  await s.page.route('**/rest/v1/household_members?**',async route=>{if(new URL(route.request().url()).searchParams.get('select')?.includes('households('))await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'QA unavailable'})});else await route.fallback()});
  await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');await expect(s.page.getByRole('alert')).toContainText('No pudimos consultar tus hogares');await expect(s.page.getByRole('heading',{name:'Crea tu hogar'})).toHaveCount(0);
 }finally{await s.context.close()}
});

test('a failed savings deposit keeps the amount typed by the user',async({browser})=>{
 const s=await setup(browser,{rich:true,saveFailure:true});try{await ready(s,'presupuesto');await chooseFinance(s,'Metas');const input=s.page.getByLabel(/Nuevo aporte para/);await input.fill('24.75');await s.page.getByRole('button',{name:/Agregar aporte a/}).click();await expect(s.page.locator('.finance-message')).toContainText('QA mutation unavailable');await expect(input).toHaveValue('24.75')}finally{await s.context.close()}
});

test('form save actions stay above navigation in a short mobile viewport',async({browser})=>{
 const s=await setup(browser,{rich:true});
 try{
  await s.page.setViewportSize({width:320,height:640});
  for(const [tab,label] of [['presupuesto','Movimiento'],['calendario','Evento'],['listas','Lista'],['documentos','Documento'],['mantenimiento','Plan'],['planeacion','Nuevo objetivo'],['respaldos','Crear respaldo']]){
   await ready(s,tab);await s.page.getByRole('button',{name:label,exact:true}).first().click();await expect(s.page.locator('.finance-modal')).toBeVisible();await expect(s.page.locator('.app>nav')).not.toBeVisible();
   const save=s.page.locator('.finance-modal button[type="submit"],.finance-modal .finance-primary,.finance-modal .backup-primary').last();
   if(await save.count()){await save.scrollIntoViewIfNeeded();expect(await save.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===top||el.contains(top)})).toBe(true)}
   await healthy(s);await s.page.keyboard.press('Escape');await expect(s.page.locator('.finance-modal')).toHaveCount(0);
  }
 }finally{await s.context.close()}
});

test('search and app menu contain keyboard focus and restore their trigger',async({browser})=>{
 const s=await setup(browser,{rich:true});try{
  await ready(s,'');const search=s.page.locator('.global-search-trigger');await search.click();const dialog=s.page.locator('.global-command-panel');await expect(dialog).toBeVisible();
  for(let i=0;i<7;i++){await s.page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true)}
  await s.page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(search).toBeFocused();
  const menu=s.page.locator('.app-menu-trigger');await menu.click();const drawer=s.page.locator('.app-menu-drawer');await expect(drawer).toBeVisible();for(let i=0;i<30;i++){await s.page.keyboard.press('Tab');expect(await drawer.evaluate(el=>el.contains(document.activeElement))).toBe(true)}await s.page.keyboard.press('Escape');await expect(menu).toBeFocused();
 }finally{await s.context.close()}
});

test('a list item save clears the form without reading a released React event',async({browser})=>{
 const s=await setup(browser,{rich:true});try{await ready(s,'listas');await s.page.locator('.list-card-v2').first().click();await s.page.getByLabel('Nuevo elemento',{exact:true}).fill('Producto de prueba');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();await expect(s.page.getByLabel('Nuevo elemento',{exact:true})).toHaveValue('');await healthy(s)}finally{await s.context.close()}
});

test('savings corrections and recurring retirement retain the paid history',async({browser})=>{
 const s=await setup(browser,{rich:true});try{
  await ready(s,'presupuesto');await chooseFinance(s,'Metas');await s.page.locator('.savings-history-row').first().getByRole('button',{name:/Editar aporte/}).click();
  await s.page.getByLabel('Monto del movimiento (Q)',{exact:true}).fill('6200.25');await s.page.getByRole('button',{name:'Guardar aporte',exact:true}).click();await expect(s.page.locator('.modal-backdrop')).toHaveCount(0);expect(Number(s.entries().contributions[0].amount)).toBe(6200.25);
  await chooseFinance(s,'Recurrentes');await s.page.getByRole('button',{name:'Editar recurrente Servicio mensual',exact:true}).click();await s.page.getByLabel('Descripción',{exact:true}).fill('Servicio corregido');await s.page.getByLabel('Monto (Q)',{exact:true}).fill('450.25');await s.page.getByRole('button',{name:'Guardar recurrente',exact:true}).click();await expect(s.page.locator('.modal-backdrop')).toHaveCount(0);
  await s.page.getByRole('button',{name:'Eliminar recurrente Servicio corregido',exact:true}).click();await s.page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();await expect(s.page.locator('.modal-backdrop')).toHaveCount(0);expect(s.entries().recurring[0].active).toBe(false);expect(s.entries().occurrences.find(o=>o.id==='pending').status).toBe('skipped');expect(s.entries().transactions.some(t=>t.id==='paidtx')).toBe(true);await expect(s.page.getByText('Servicio anterior',{exact:true})).toBeVisible();await healthy(s);
 }finally{await s.context.close()}
});
