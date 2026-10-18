import {test,expect} from '@playwright/test';
import {setup,ready,healthy,uid,hh,rid} from './support.mjs';

test('first-run solo setup and invalid invite feedback preserve the chosen space',async({browser})=>{
 const s=await setup(browser,{rich:true});let created=false;const writes=[];
 await s.page.route('**/rest/v1/household_members?**',async r=>{
  if(!created&&new URL(r.request().url()).searchParams.get('select')?.includes('households('))return r.fulfill({json:[]});return r.fallback();
 });
 await s.page.route('**/rest/v1/rpc/join_household',r=>r.fulfill({json:null}));
 await s.page.route('**/rest/v1/rpc/create_household',r=>{writes.push(r.request().postDataJSON());created=true;return r.fulfill({json:hh})});
 try{
  await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');await expect(s.page.getByRole('heading',{name:'¿Para quién es?'})).toBeVisible();
  await s.page.getByRole('button',{name:'Ya tengo un código de invitación'}).click();await s.page.getByLabel('Código de invitación').fill('INVALID');await s.page.getByRole('button',{name:'Unirme',exact:true}).click();
  await expect(s.page.getByRole('alert')).toContainText('Ese código no corresponde');expect(writes).toHaveLength(0);
  await s.page.getByRole('button',{name:'Prefiero crear mi propio espacio'}).click();await s.page.getByRole('button',{name:/Solo yo/}).click();await expect(s.page.getByLabel('Nombre de tu espacio')).toHaveValue('Mis finanzas');
  await s.page.getByRole('button',{name:'Crear y empezar'}).click();await expect(s.page.locator('.app-studio')).toBeVisible();expect(writes).toEqual([{p_name:'Mis finanzas'}]);
  const appearance=await s.page.evaluate(({uid,hh})=>JSON.parse(localStorage.getItem('nh:appearance:'+uid+':'+hh)),{uid,hh});expect(appearance).toMatchObject({view:'essential',favorites:['presupuesto','documentos']});await healthy(s);
 }finally{await s.context.close()}
});

test('the last household and an explicit household link are restored without duplicates',async({browser})=>{
 const s=await setup(browser,{rich:true,twoHomes:true});
 try{
  await s.context.addInitScript(({uid,rid})=>localStorage.setItem('nh:last-household:'+uid,rid),{uid,rid});
  await ready(s,'');await expect(s.page.getByLabel('Cambiar de familia',{exact:true})).toHaveValue(rid);
  await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/?household='+hh);await expect(s.page.getByLabel('Cambiar de familia',{exact:true})).toHaveValue(hh);
  await expect(s.page.getByLabel('Cambiar de familia',{exact:true}).locator('option')).toHaveCount(2);await healthy(s);
 }finally{await s.context.close()}
});

test('quick recording supplies the category description when it is left empty',async({browser})=>{
 const s=await setup(browser,{rich:true});const writes=[];
 await s.page.route('**/rest/v1/rpc/save_transaction_once',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:rid})});
 try{
  await ready(s,'');await s.page.getByRole('button',{name:'Registrar un movimiento o actividad',exact:true}).click();
  const dialog=s.page.getByRole('dialog');await dialog.getByRole('button',{name:/^Gasto/}).first().click();await dialog.getByLabel('Monto',{exact:true}).fill('25');
  await dialog.locator('select[name=category_id]').selectOption('66666666-1111-4111-8111-111111111111');await dialog.getByRole('button',{name:'Guardar gasto'}).click();
  await expect(dialog.locator('.quick-entry-success')).toContainText('Registrado');expect(writes[0].p_values).toMatchObject({description:'Alimentación',amount:25});await healthy(s);
 }finally{await s.context.close()}
});
