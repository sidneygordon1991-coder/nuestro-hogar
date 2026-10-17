import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,chooseFinance,healthy,monthStart,uid} from './support.mjs';

async function fixture(browser,theme='light'){
 const s=await setup(browser,{rich:true,theme});
 const categories=[['food','Alimentación','food','variable',1000,450],['home','Vivienda','home','fixed',1000,800],['car','Transporte','car','variable',1000,1250],['empty','Ocio','wallet','variable',0,0],['unplanned','Servicios','utilities','fixed',0,10],['saving','Ahorro viajes','travel','saving',1000,0],['saving2','Ahorro reserva','saving','saving',2000,0]].map(([id,name,icon,budget_group,planned,spent])=>({id,name,icon,budget_group,planned,spent}));
 let allocations=categories.map(c=>({id:c.id+'-allocation',category_id:c.id,month:monthStart,planned_amount:c.planned,first_half_amount:c.planned/2,second_half_amount:c.planned/2}));
 const movement=(id,category_id,amount,date)=>({id,type:'expense',category_id,amount,transaction_date:date,description:id,paid_by:uid,is_shared:true,notes:null,account_id:null,recurring_transaction_id:null});
 const transactions=[movement('Compra primera','food',350,'2026-10-15'),movement('Compra segunda','food',100,'2026-10-16'),movement('Compra futura','food',999,'2026-10-30'),...categories.filter(c=>c.id!=='food'&&c.spent).map(c=>movement(c.id,c.id,c.spent,'2026-10-15'))];
 await s.page.route('**/rest/v1/budget_categories?**',async route=>{
  const request=route.request();if(request.method()==='PATCH'){const c=categories.find(c=>'eq.'+c.id===new URL(request.url()).searchParams.get('id'));Object.assign(c,request.postDataJSON());await route.fulfill({status:204,body:''});return}
  await route.fulfill({json:categories});
 });
 await s.page.route('**/rest/v1/budget_allocations?**',async route=>{
  if(route.request().method()==='POST'){allocations=route.request().postDataJSON();await route.fulfill({status:204,body:''});return}
  await route.fulfill({json:allocations});
 });
 await s.page.route('**/rest/v1/transactions?**',route=>route.fulfill({json:transactions}));
 await s.page.route('**/rest/v1/rpc/save_transaction_once',route=>{
  const p=route.request().postDataJSON().p_values,id='new-expense';
  transactions.push({...movement(id,p.category_id,p.amount,p.date),description:p.description});
  return route.fulfill({json:id});
 });
 return {...s,transactions};
}

for(const theme of ['light','dark'])test(`category budget progress, saved plans and period limits: ${theme}`,async({browser},testInfo)=>{
 const s=await fixture(browser,theme);
 const rubric=name=>s.page.getByRole('region',{name:'Presupuesto de '+name,exact:true});
 try{
  await ready(s,'presupuesto');await chooseFinance(s,'Presupuesto');
  const food=rubric('Alimentación');await expect(food).toContainText('55% disponible');await expect(food).toContainText('Q\u00a0550');await expect(food.getByRole('progressbar')).toHaveAttribute('aria-valuenow','45');
  await expect(rubric('Vivienda')).toContainText('Te acercas al límite');
  await expect(rubric('Transporte')).toContainText('Excedido por');await expect(rubric('Transporte')).toContainText('Q\u00a0250');await expect(rubric('Transporte')).toContainText('125% utilizado');await expect(rubric('Transporte').getByRole('progressbar')).toHaveAttribute('aria-valuenow','100');
  await expect(rubric('Ocio')).toContainText('Disponible sin definir');await expect(rubric('Ocio').getByRole('progressbar')).toHaveCount(0);
  await expect(rubric('Servicios')).toContainText('Gasto sin presupuesto asignado');
  for(const name of ['Ahorro viajes','Ahorro reserva']){await expect(rubric(name)).toContainText('sin asignación a este rubro');await expect(rubric(name).getByRole('progressbar')).toHaveCount(0);await expect(rubric(name)).not.toContainText('6,500')}
  await expect(food.locator('svg')).toHaveCount(1);await expect(food.locator('svg')).toHaveClass(/shopping-basket/);
  for(const width of [320,390,768,1280]){await s.page.setViewportSize({width,height:844});await healthy(s)}
  await s.page.setViewportSize({width:390,height:844});await food.scrollIntoViewIfNeeded();
  await testInfo.attach('budget-'+theme,{body:await s.page.screenshot(),contentType:'image/png'});
  const result=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
  await s.page.getByLabel('Presupuesto mensual de Alimentación',{exact:true}).fill('2000');await expect(food).toContainText('Cambios sin guardar');await expect(food).toContainText('55% disponible');
  await s.page.getByRole('button',{name:'Guardar presupuesto',exact:true}).click();await expect(food).toContainText('77.5% disponible');await expect(food).not.toContainText('Cambios sin guardar');
  await chooseFinance(s,'Quincenas');await expect(food).toContainText('77.5% disponible');
  await s.page.getByRole('group',{name:'Período del presupuesto',exact:true}).getByRole('button',{name:/Primera quincena/}).click();await expect(food).toContainText('30% disponible');await expect(food.getByRole('progressbar')).toHaveAttribute('aria-valuenow','70');
  await s.page.getByRole('group',{name:'Período del presupuesto',exact:true}).getByRole('button',{name:/Segunda quincena/}).click();await expect(food).toContainText('80% disponible');await expect(food).toContainText('Q\u00a0400');
  // Register through the existing form; saving refreshes the actual expenses.
  await chooseFinance(s,'Movimientos');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();
  const form=s.page.locator('.finance-modal');await form.getByLabel('Monto',{exact:true}).fill('50');await form.getByLabel('Descripción',{exact:true}).fill('Nueva compra');await form.getByRole('combobox',{name:/^Categoría/}).selectOption('food');await form.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(form).toHaveCount(0);await expect(s.page.locator('.finance-tabs')).toBeVisible();
  await chooseFinance(s,'Quincenas');await s.page.getByRole('button',{name:/Segunda quincena/}).click();await expect(food).toContainText('70% disponible');await expect(food.getByRole('progressbar')).toHaveAttribute('aria-valuenow','30');await healthy(s);
 }finally{await s.context.close()}
});

test('failed loading hides category availability instead of presenting false zero spending',async({browser})=>{
 const s=await fixture(browser);
 try{
  await s.page.route('**/rest/v1/transactions?**',route=>route.fulfill({status:500,json:{message:'QA unavailable'}}));
  await ready(s,'presupuesto');await chooseFinance(s,'Presupuesto');await expect(s.page.getByRole('region',{name:'Presupuesto de Alimentación',exact:true})).toContainText('No se pudo verificar');await expect(s.page.getByRole('progressbar')).toHaveCount(0);
  await chooseFinance(s,'Quincenas');await expect(s.page.getByRole('alert')).toContainText('No pudimos cargar');await expect(s.page.locator('.budget-category-cards')).toHaveCount(0);
 }finally{await s.context.close()}
});
