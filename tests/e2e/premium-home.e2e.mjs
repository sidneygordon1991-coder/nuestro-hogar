import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,healthy,chooseFinance,uid,hh,day} from './support.mjs';
const bank='90000000-0000-4000-8000-000000000001',cash='90000000-0000-4000-8000-000000000002',card='90000000-0000-4000-8000-000000000003',investment='90000000-0000-4000-8000-000000000004';
async function accountFixture(s){
 await s.page.route('**/rest/v1/finance_accounts?**',route=>route.fulfill({json:[{id:bank,name:'Cuenta familiar',account_type:'checking',account_class:'asset',opening_balance:1000,active:true},{id:cash,name:'Efectivo',account_type:'cash',account_class:'asset',opening_balance:200,active:true},{id:card,name:'Tarjeta familiar',account_type:'credit',account_class:'liability',opening_balance:500,credit_limit:10000,active:true},{id:investment,name:'Inversión',account_type:'investment',account_class:'asset',opening_balance:9000,active:true}]}));
 await s.page.route('**/rest/v1/transactions?**',route=>{const url=new URL(route.request().url());if(url.searchParams.get('account_id')!=='not.is.null')return route.fallback();return route.fulfill({json:[{id:'income',account_id:bank,type:'income',amount:1000,transaction_date:day},{id:'expense',account_id:bank,type:'expense',amount:100,transaction_date:day},{id:'credit',account_id:card,type:'expense',amount:200,transaction_date:day},{id:'future',account_id:bank,type:'income',amount:99999,transaction_date:'2026-10-30'}]})});
 await s.page.route('**/rest/v1/finance_transfers?**',route=>route.fulfill({json:[{id:'cash',from_account_id:bank,to_account_id:cash,amount:50,transfer_date:day},{id:'card',from_account_id:bank,to_account_id:card,amount:300,transfer_date:day}]}));
}
for(const theme of ['light','dark'])test(`connected home controls, responsive layout and accessibility: ${theme}`,async({browser},testInfo)=>{
 const s=await setup(browser,{rich:true,theme,futureMovement:true});await accountFixture(s);
 try{
  await ready(s,'');await expect(s.page.getByRole('region',{name:'Cuentas disponibles'})).toContainText('1,800');await expect(s.page.locator('.premium-margin')).not.toContainText('99,999');
  await s.page.getByRole('button',{name:'Ver cálculo',exact:true}).click();await expect(s.page.locator('.premium-calculation')).toContainText('todavía no se suman');await expect(s.page.locator('.premium-calculation')).toContainText('no es el saldo');
  const bar=s.page.getByRole('progressbar',{name:'Presupuesto utilizado de Alimentación',exact:true});await expect(bar).toHaveAttribute('aria-valuenow','60');await expect(s.page.getByRole('region',{name:'Presupuesto de Alimentación',exact:true})).toContainText('40% disponible');
  await s.page.getByRole('group',{name:'Período del resumen'}).getByRole('button',{name:'16–cierre',exact:true}).click();await expect(s.page.getByRole('region',{name:'Resumen de presupuesto'})).toContainText('Segunda quincena');await expect(s.page.locator('.premium-projection')).toContainText('Plan parcial');
  await s.page.getByRole('group',{name:'Período del resumen'}).getByRole('button',{name:'Mes',exact:true}).click();
  await s.page.getByRole('button',{name:'Ver las 4 cuentas',exact:true}).click();await expect(s.page.getByRole('region',{name:'Cuentas disponibles'})).toContainText('Inversión');await expect(s.page.getByRole('region',{name:'Cuentas disponibles'})).toContainText('Activo no líquido');
  for(const width of [320,390,768,1440,1920,2560]){await s.page.setViewportSize({width,height:1000});await healthy(s);if(width>=1100){const hero=await s.page.locator('.premium-margin').boundingBox(),chart=await s.page.locator('.premium-cashflow').boundingBox(),main=await s.page.locator('.premium-money-main').boundingBox();expect(hero.width).toBeGreaterThan(main.width-2);expect(chart.y).toBeGreaterThan(hero.y+hero.height-1)}}
  await s.page.setViewportSize({width:1440,height:1000});await s.page.evaluate(()=>window.scrollTo(0,0));await s.page.mouse.move(0,0);await testInfo.attach('desktop-'+theme,{body:await s.page.screenshot({fullPage:true}),contentType:'image/png'});await s.page.setViewportSize({width:390,height:844});await s.page.evaluate(()=>window.scrollTo(0,0));await testInfo.attach('mobile-'+theme,{body:await s.page.screenshot({fullPage:true}),contentType:'image/png'});
  const result=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();await testInfo.attach('home-accessibility',{body:JSON.stringify(result.violations,null,2),contentType:'application/json'});expect(result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await s.page.locator('.premium-goals').getByRole('button',{name:'Ver metas y aportes',exact:true}).click();await expect(s.page.locator('.finance-more')).toContainText('Metas');await expect(s.page.locator('.finance-v2')).toContainText('Nuestro próximo viaje');await healthy(s);
 }finally{await s.context.close()}
});

test('five spaces navigate within the mounted Finance module and preserve back history',async({browser})=>{
 const s=await setup(browser,{rich:true});try{
  await s.page.setViewportSize({width:1440,height:1000});await ready(s,'presupuesto');const calls=s.calls.filter(c=>c.path.endsWith('/transactions')).length;
  await s.page.locator('.premium-rail-main').getByText('Mi plan',{exact:true}).click();await expect(s.page.locator('.finance-tabs')).toContainText('Presupuesto');await expect(s.page.getByLabel('Presupuesto mensual de Alimentación',{exact:true})).toBeVisible();
  await s.page.locator('.premium-rail-links').getByRole('button',{name:'Metas de ahorro',exact:true}).click();await expect(s.page.locator('.finance-more summary')).toHaveText(/Metas/);await expect(s.page).toHaveURL(/finance=goals/);expect(s.calls.filter(c=>c.path.endsWith('/transactions')).length).toBe(calls);
  await chooseFinance(s,'Cuentas');await expect(s.page.locator('.premium-rail-main.active')).toHaveText('Mi dinero');await expect(s.page).toHaveURL(/finance=accounts/);
  await s.page.goBack();await expect(s.page.getByLabel('Presupuesto mensual de Alimentación',{exact:true})).toBeVisible();
  await s.page.setViewportSize({width:390,height:844});await s.page.getByRole('navigation',{name:'Navegación principal',exact:true}).getByRole('button',{name:'Mi hogar',exact:true}).click();const menu=s.page.getByRole('dialog',{name:'Mi hogar',exact:true});await expect(menu.getByRole('button',{name:'Agenda y calendario',exact:true})).toBeVisible();await s.page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
  await s.page.getByRole('navigation',{name:'Navegación principal',exact:true}).getByRole('button',{name:'Mi hogar',exact:true}).click();await menu.getByRole('button',{name:'Agenda y calendario',exact:true}).click();await expect(s.page.locator('.workspace-header .page-title')).toHaveText('Calendario');await healthy(s);
 }finally{await s.context.close()}
});

test('accounts fail independently and retry without replacing missing balances with zero',async({browser})=>{
 const s=await setup(browser,{rich:true});let fail=true;await s.page.route('**/rest/v1/finance_accounts?**',route=>route.fulfill({status:fail?500:200,json:fail?{message:'Unavailable'}:[{id:bank,name:'Cuenta recuperada',account_type:'checking',account_class:'asset',opening_balance:800,active:true}]}));
 try{await ready(s,'');const accounts=s.page.getByRole('region',{name:'Cuentas disponibles'});await expect(accounts.getByRole('alert')).toContainText('No pudimos verificar');await expect(accounts.locator('.premium-account-total')).toHaveCount(0);await expect(s.page.getByRole('region',{name:'Margen del mes'})).toBeVisible();fail=false;await accounts.getByRole('button',{name:'Reintentar cuentas',exact:true}).click();await expect(accounts).toContainText('Cuenta recuperada');await expect(accounts.locator('.premium-account-total')).toContainText('800');await healthy(s)}finally{await s.context.close()}
});

test('home calendar day selection and links preserve existing controls',async({browser})=>{
 const s=await setup(browser,{rich:true});try{await ready(s,'');const agenda=s.page.getByRole('region',{name:'Hoy y esta semana',exact:true});await expect(agenda).toContainText('Cena en familia');await expect(agenda.getByRole('group',{name:'Días de la agenda'}).getByRole('button')).toHaveCount(7);await agenda.getByRole('group',{name:'Días de la agenda'}).getByRole('button').nth(1).click();await expect(agenda.getByLabel('Filtrar actividades por día')).toHaveValue('2026-10-17');await agenda.getByRole('button',{name:'Abrir agenda',exact:true}).click();await expect(s.page.locator('.calendar-layout')).toBeVisible();await healthy(s)}finally{await s.context.close()}
});

test('restricted financial access never mounts account or goal previews',async({browser})=>{
 const s=await setup(browser,{rich:true,accessOverride:{finance:'none',calendar:'view',lists:'view',health:'none',documents:'view',meals:'view',maintenance:'view',planning:'none',monthly_close:'none',automations:'none',backups:'none',diagnostics:'none'}});try{await ready(s,'');await expect(s.page.getByRole('region',{name:'Cuentas disponibles'})).toHaveCount(0);await expect(s.page.getByRole('region',{name:'Metas de ahorro'})).toHaveCount(0);await expect(s.page.getByRole('navigation',{name:'Navegación principal',exact:true}).getByRole('button',{name:'Mi dinero',exact:true})).toHaveCount(0);expect(s.calls.filter(c=>c.path.endsWith('/finance_accounts'))).toHaveLength(0);await healthy(s)}finally{await s.context.close()}
});
