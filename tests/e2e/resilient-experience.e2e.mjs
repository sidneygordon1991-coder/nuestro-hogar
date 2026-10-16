import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,chooseFinance,healthy,hh,uid,rid,day} from './support.mjs';
const openMovement=async s=>{await chooseFinance(s,'Movimientos');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();return s.page.getByRole('dialog',{name:'Nuevo movimiento',exact:true})};

test('a lost response survives reload and retries the same movement request',async({browser})=>{
 const s=await setup(browser,{rich:true}),calls=[];let first=true;
 await s.page.route('**/rest/v1/rpc/save_transaction_once',async route=>{calls.push(route.request().postDataJSON());if(first){first=false;await route.fulfill({status:503,json:{message:'Respuesta interrumpida. Reintenta el borrador.'}})}else await route.fulfill({json:rid})});
 try{
  await ready(s,'presupuesto');let dialog=await openMovement(s);await dialog.getByLabel('Descripción',{exact:true}).fill('Gasto con respuesta interrumpida');await dialog.getByLabel('Monto',{exact:true}).fill('47.25');await dialog.getByLabel('Repetir todos los meses',{exact:true}).check();await dialog.getByLabel('Día de pago recurrente',{exact:true}).fill('31');
  await dialog.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Reintenta');await expect(dialog.getByLabel('Monto',{exact:true})).toHaveValue('47.25');
  await ready(s,'presupuesto');dialog=await openMovement(s);await expect(dialog.getByRole('button',{name:'Recuperar borrador',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Recuperar borrador',exact:true}).click();await expect(dialog.getByLabel('Monto',{exact:true})).toHaveValue('47.25');await expect(dialog.getByLabel('Repetir todos los meses',{exact:true})).toBeChecked();
  await dialog.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(dialog).toHaveCount(0);expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);expect(calls[1].p_values.recurring).toBe(true);expect(await s.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('nh:draft:')))).toEqual([]);await healthy(s);
 }finally{await s.context.close()}
});

test('an offline draft waits for explicit submission after reconnecting',async({browser})=>{
 const s=await setup(browser,{rich:true}),calls=[];
 await s.page.route('**/rest/v1/rpc/save_transaction_once',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:rid})});
 try{
  await ready(s,'presupuesto');const dialog=await openMovement(s);await dialog.getByLabel('Descripción',{exact:true}).fill('Borrador sin conexión');await dialog.getByLabel('Monto',{exact:true}).fill('50');await s.page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});dispatchEvent(new Event('offline'))});
  await dialog.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(dialog.locator('.draft-status')).toContainText('Sin conexión');expect(calls).toHaveLength(0);
  await s.page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});dispatchEvent(new Event('online'))});await expect(dialog.getByLabel('Monto',{exact:true})).toHaveValue('50');expect(calls).toHaveLength(0);await dialog.getByRole('button',{name:'Guardar movimiento',exact:true}).click();await expect(dialog).toHaveCount(0);expect(calls).toHaveLength(1);
 }finally{await s.context.close()}
});

for(const theme of ['light','dark'])test(`essential navigation and shared conversation remain usable: ${theme}`,async({browser},testInfo)=>{
 const s=await setup(browser,{rich:true,theme}),comments=[];let failed=false;
 await s.context.addInitScript(({uid,hh})=>localStorage.setItem('nh:appearance:'+uid+':'+hh,JSON.stringify({view:'essential',favorites:['listas'],accent:'iris',focus:'balance'})),{uid,hh});
 await s.page.route('**/rest/v1/rpc/get_household_comments_capability',r=>r.fulfill({json:true}));
 await s.page.route('**/rest/v1/household_comments**',async r=>{const req=r.request(),url=new URL(req.url());if(req.method()==='POST'){const p=req.postDataJSON();if(!comments.some(c=>c.id===p.id))comments.push({...p,created_at:day+'T12:00:00Z'});if(!failed){failed=true;return r.fulfill({status:400,json:{code:'P0001',message:'Temporary interruption'}})}return r.fulfill({status:204,body:''})}if(req.method()==='DELETE'){const id=url.searchParams.get('id')?.slice(3);comments.splice(comments.findIndex(c=>c.id===id),1);return r.fulfill({status:204,body:''})}if(url.searchParams.get('select')==='body,created_by')return r.fulfill({json:comments.find(c=>'eq.'+c.id===url.searchParams.get('id'))});return r.fulfill({json:comments})});
 try{
  await ready(s,'listas');await s.page.getByRole('button',{name:'Abrir navegación',exact:true}).click();const menu=s.page.getByRole('dialog',{name:'Navegación de Nuestro Hogar'});await expect(menu.getByRole('button',{name:/Comidas/})).toHaveCount(0);await menu.getByRole('button',{name:'Ver todas las secciones',exact:true}).click();await expect(menu.getByRole('button',{name:/Comidas/})).toBeVisible();await s.page.keyboard.press('Escape');
  await s.page.locator('.list-card-v2').first().click();const launch=s.page.getByRole('button',{name:/^Comentarios de /}).first();await launch.click();const dialog=s.page.getByRole('dialog').filter({has:s.page.locator('.entity-comments')});await dialog.getByLabel('Nuevo comentario',{exact:true}).fill('Confirmado para el hogar.');await dialog.getByRole('button',{name:'Comentar',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('reintenta');await dialog.getByRole('button',{name:'Comentar',exact:true}).click();await expect(dialog.locator('.comment-history')).toContainText('Confirmado para el hogar.');expect(comments).toHaveLength(1);expect(await dialog.getByLabel('Nuevo comentario',{exact:true}).evaluate(el=>el.matches(':user-invalid'))).toBe(false);
  for(const width of [320,390,768,1280]){await s.page.setViewportSize({width,height:740});await healthy(s)}
  const axe=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
  await s.page.setViewportSize({width:390,height:740});await testInfo.attach('conversation-'+theme,{body:await s.page.screenshot(),contentType:'image/png'});await dialog.getByRole('button',{name:'Eliminar mi comentario',exact:true}).click();await expect(dialog.locator('.comment-history article')).toHaveCount(0);expect(comments).toHaveLength(0);
 }finally{await s.context.close()}
});

test('master sees operational metadata behind the existing verified session',async({browser})=>{
 const s=await setup(browser,{rich:true,master:true,aal:'aal2'});
 await s.page.route('**/rest/v1/rpc/get_platform_overview',r=>r.fulfill({json:{plan:'Free',database_bytes:19000000,database_limit_bytes:500000000,storage_bytes:0,allocated_bytes:100000000,storage_limit_bytes:1000000000,households:[{id:hh,name:'Familia QA',status:'active',quota_bytes:100000000,used_bytes:0,member_limit:10,members:1,movements:5,files:0,created_at:day,latest_backup_at:null,open_errors_7d:2}],audit:[]}}));
 try{await ready(s,'master');await expect(s.page.locator('.master-family-health')).toContainText('sin copia en los últimos 14 días');await expect(s.page.locator('.master-family-health')).toContainText('2 errores sin resolver');await healthy(s)}finally{await s.context.close()}
});

test('PWA icon variants preserve identity and keep the mark inside Android safe crops',async({browser})=>{
 const s=await setup(browser,{loggedIn:false});try{
  await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');const manifest=await s.page.evaluate(async()=>await(await fetch('manifest.webmanifest')).json());expect(manifest.id).toBe(manifest.start_url);expect(manifest.scope).toBe('/nuestro-hogar/');expect(manifest.icons.find(i=>i.purpose==='maskable').src).toContain('premium-maskable');
  const result=await s.page.evaluate(async()=>{const results=[];for(const [path,size] of [['icon-premium-192.png',192],['icon-premium-512.png',512],['icon-premium-maskable-512.png',512],['apple-touch-icon-premium.png',180]]){const image=new Image();image.src=path;await image.decode();const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const d=ctx.getImageData(0,0,size,size).data;let max=0,transparent=0,count=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;if(d[i+3]<255)transparent++;if(d[i]>160&&d[i+1]>140&&d[i+3]===255){max=Math.max(max,Math.hypot(x-size/2,y-size/2));count++}}results.push({path,width:image.naturalWidth,height:image.naturalHeight,size,max,count,transparent})}return results});
  for(const r of result){expect(r.width).toBe(r.size);expect(r.height).toBe(r.size);expect(r.count).toBeGreaterThan(100);expect(r.max/r.size).toBeLessThan(.4);if(r.path.includes('maskable')||r.size===180)expect(r.transparent).toBe(0)}
  await expect(s.page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('sizes','180x180');
 }finally{await s.context.close()}
});
