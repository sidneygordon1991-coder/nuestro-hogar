import {test,expect} from '@playwright/test';
import {setup,ready,chooseFinance,healthy,uid,hh} from './support.mjs';

const membershipCalls=s=>s.calls.filter(c=>c.path.endsWith('/household_members')&&c.query.select?.includes('households(')).length;
async function observeAuth(s){
 await s.context.addInitScript(()=>{
  window.__handledAuth=[];const Channel=window.BroadcastChannel;
  window.BroadcastChannel=class extends Channel{
   addEventListener(type,listener,options){
    if(type!=='message')return super.addEventListener(type,listener,options);
    super.addEventListener(type,async event=>{await listener.call(this,event);await new Promise(requestAnimationFrame);window.__handledAuth.push(event.data.event)},options);
   }
  };
 });
}
async function authEvent(s,event,userId=uid){
 const before=await s.page.evaluate(()=>window.__handledAuth.length);
 await s.page.evaluate(({event,userId})=>{const key='sb-dchihxrjtngwabbvsqap-auth-token';const session=JSON.parse(localStorage.getItem(key));const channel=new BroadcastChannel(key);channel.postMessage({event,session:event==='SIGNED_OUT'?null:{...session,user:{...session.user,id:userId}}});channel.close()},{event,userId});
 await expect.poll(()=>s.page.evaluate(()=>window.__handledAuth.length)).toBeGreaterThan(before);
}

for(const width of [390,1920])test(`same-user auth notifications preserve the mounted form: ${width}`,async({browser})=>{
 const s=await setup(browser,{rich:true});await observeAuth(s);
 try{
  await s.page.setViewportSize({width,height:900});await ready(s,'presupuesto');await chooseFinance(s,'Movimientos');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();const dialog=s.page.getByRole('dialog',{name:'Nuevo movimiento',exact:true});await dialog.getByLabel('Descripción',{exact:true}).fill('Conservar mientras cambio de ventana');await dialog.getByLabel('Monto',{exact:true}).fill('123.45');
  await dialog.evaluate(el=>{window.__originalDialog=el});const calls=membershipCalls(s);
  for(const event of ['SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED','SIGNED_IN'])await authEvent(s,event);
  await expect(dialog.getByLabel('Descripción',{exact:true})).toHaveValue('Conservar mientras cambio de ventana');await expect(dialog.getByLabel('Monto',{exact:true})).toHaveValue('123.45');expect(await dialog.evaluate(el=>el===window.__originalDialog)).toBe(true);expect(membershipCalls(s)).toBe(calls);await healthy(s);
  await authEvent(s,'SIGNED_OUT');await expect(s.page.locator('.auth-premium')).toBeVisible();await expect(dialog).toHaveCount(0);expect(await s.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('nh:draft:')))).toEqual([]);
 }finally{await s.context.close()}
});

test('a real visibility recovery preserves the current module instead of reloading the home',async({browser})=>{
 const s=await setup(browser,{rich:true});try{
  await ready(s,'listas');await s.page.locator('.list-card-v2').first().click();await s.page.getByRole('textbox',{name:'Nuevo elemento',exact:true}).fill('Sin perder este pendiente');const count=membershipCalls(s);
  await s.page.evaluate(()=>{
   window.__resumed=0;window.__resumeChannel=new BroadcastChannel('sb-dchihxrjtngwabbvsqap-auth-token');window.__resumeChannel.addEventListener('message',()=>{window.__resumed++});
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.dispatchEvent(new Event('visibilitychange'));
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(()=>s.page.evaluate(()=>window.__resumed)).toBeGreaterThan(0);await expect(s.page.getByRole('textbox',{name:'Nuevo elemento',exact:true})).toHaveValue('Sin perder este pendiente');expect(membershipCalls(s)).toBe(count);await healthy(s);
 }finally{await s.context.close()}
});

test('a different authenticated account still reloads its household and clears the old interface',async({browser})=>{
 const s=await setup(browser,{rich:true});await observeAuth(s);const other='99999999-1111-4111-8111-111111111111';
 await s.page.route('**/rest/v1/household_members?**',route=>{const url=new URL(route.request().url());if(url.searchParams.get('user_id')==='eq.'+other&&url.searchParams.get('select')?.includes('households('))return route.fulfill({json:[{user_id:other,household_id:hh,households:{id:hh,name:'Otro usuario de prueba',invite_code:'QA'}}]});return route.fallback()});
 try{await ready(s,'presupuesto');await chooseFinance(s,'Movimientos');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();await s.page.getByRole('dialog',{name:'Nuevo movimiento',exact:true}).getByLabel('Descripción',{exact:true}).fill('Formulario de la cuenta anterior');await authEvent(s,'SIGNED_IN',other);await expect(s.page.locator('.home-select-label')).toHaveText('Otro usuario de prueba');await expect(s.page.getByRole('dialog',{name:'Nuevo movimiento',exact:true})).toHaveCount(0);await healthy(s)}finally{await s.context.close()}
});

for(const theme of ['light','dark'])test(`desktop modules use the available viewport with aligned navigation: ${theme}`,async({browser},testInfo)=>{
 const s=await setup(browser,{rich:true,theme});try{
  for(const tab of ['', 'presupuesto','calendario','familia','listas','comidas','documentos','mantenimiento','planeacion','salud','cierre','automatizaciones','respaldos','diagnostico']){
   await s.page.setViewportSize({width:1920,height:1080});await ready(s,tab);const app=await s.page.locator('.app.app-studio').boundingBox(),content=await s.page.locator('.content').boundingBox(),rail=await s.page.locator('.desktop-rail').boundingBox();expect(app.x).toBe(0);expect(app.width).toBe(1920);expect(rail.x).toBe(18);expect(content.x+content.width).toBeGreaterThanOrEqual(1919);expect(content.width).toBeGreaterThan(1600);await healthy(s);
  }
  await ready(s,'');await testInfo.attach('desktop-1920-'+theme,{body:await s.page.screenshot(),contentType:'image/png'});
  await s.page.setViewportSize({width:2560,height:1440});await expect(s.page.locator('.app.app-studio')).toHaveCSS('max-width','none');await healthy(s);
  await s.page.setViewportSize({width:390,height:844});await expect(s.page.locator('.desktop-rail')).toBeHidden();await expect(s.page.locator('.app.app-studio')).toHaveCSS('padding-left','0px');await healthy(s);
 }finally{await s.context.close()}
});
