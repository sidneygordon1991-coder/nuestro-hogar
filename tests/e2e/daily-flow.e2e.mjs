import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,healthy,uid,hh,day} from './support.mjs';
const second='55555555-5555-4555-8555-555555555555',recipe='88888888-1111-4111-8111-111111111111',week='2026-10-12';
async function flow(browser,options={}){
 const s=await setup(browser,{rich:true,...options});const calls=[];
 let lists=[{id:'task-list',title:'Rutinas de casa',list_type:'tasks',is_pinned:false,shopping_week:null,created_at:day},{id:'shopping-list',title:'Supermercado',list_type:'shopping',is_pinned:false,shopping_week:null,created_at:day}];
 let items=[{id:'overdue',list_id:'task-list',text:'Lavar ropa',completed:false,assigned_to:uid,due_date:'2026-10-14',notes:'Separar colores',routine_frequency:'none',routine_members:[]},{id:'future',list_id:'task-list',text:'Limpiar ventanas',completed:false,assigned_to:second,due_date:'2026-10-20',routine_frequency:'none',routine_members:[]}];
 let revision=1,saveCalls=0,insertCalls=0;
 const plan=()=>({week,fingerprint:'preview-'+revision,unquantified_meals:1,rows:options.emptyShopping?[]:[{key:'rice|mass',name:'Arroz',unit:'g',required:1000,available:revision===1?200:300,missing:revision===1?800:700,recipes:'Arroz familiar',warning:null,pantry_item_id:'rice'}]});
 const result=async(route,body,status=200)=>{if(Array.isArray(body)&&route.request().headers().accept?.includes('object'))body=body[0]||null;await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})};
 await s.page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=req.postData()?req.postDataJSON():null;
  calls.push({path,method,body,url:url.toString()});const id=url.searchParams.get('id')?.slice(3);
  if(path.endsWith('/lists')){
   if(method==='POST'){const row={id:'new-list',...body,is_pinned:false,created_at:day};lists.push(row);return result(route,[row])}
   if(method==='PATCH'){const rows=lists.filter(x=>x.id===id);rows.forEach(x=>Object.assign(x,body));return result(route,rows)}
   if(method==='DELETE'){lists=lists.filter(x=>x.id!==id);return result(route,null)}
   return result(route,lists);
  }
  if(path.endsWith('/list_items')){
   if(method==='POST'){insertCalls++;if(options.itemFailure&&insertCalls===1)return result(route,{message:'No se pudo guardar el elemento de prueba'},500);const row={id:'new-item-'+insertCalls,completed:false,routine_frequency:'none',routine_members:[],...body};items.push(row);return result(route,[row])}
   if(method==='PATCH'){const rows=items.filter(x=>x.id===id);rows.forEach(x=>Object.assign(x,body));return result(route,rows)}
   if(method==='DELETE'){items=items.filter(x=>x.id!==id);return result(route,null)}
   let rows=items;const list=url.searchParams.get('list_id');if(list)rows=rows.filter(x=>'eq.'+x.list_id===list);
   for(const filter of url.searchParams.getAll('due_date'))rows=rows.filter(x=>x.due_date&&(filter.startsWith('lte.')?x.due_date<=filter.slice(4):filter.startsWith('gte.')?x.due_date>=filter.slice(4):true));
   if(url.searchParams.get('completed')==='eq.false')rows=rows.filter(x=>!x.completed);
   return result(route,rows);
  }
  if(path.endsWith('/profiles')){const rows=[{id:uid,full_name:'QA owner',relationship:'Pareja'},{id:second,full_name:'QA pareja',relationship:'Pareja'}];return result(route,rows.filter(x=>!url.searchParams.get('id')?.startsWith('eq.')||url.searchParams.get('id')==='eq.'+x.id))}
  if(path.endsWith('/meal_plan_entries'))return result(route,[{id:'meal-today',meal_date:day,meal_type:'dinner',recipe_id:recipe,servings:2,status:'planned'},{id:'meal-tomorrow',meal_date:'2026-10-17',meal_type:'lunch',custom_title:'Ensalada compartida',servings:2,status:'planned'}]);
  if(path.endsWith('/maintenance_schedules'))return result(route,[{id:'job',title:'Revisión de casa',next_due_date:day,assigned_to:uid,calendar_event_id:'linked-event'}]);
  if(path.endsWith('/events'))return result(route,[{id:'linked-event',title:'Revisión de casa',event_date:day,start_time:null,event_type:'maintenance',all_day:true,recurrence:'none'},{id:'dinner-event',title:'Encuentro familiar',event_date:day,start_time:'18:00',assigned_to:null,recurrence:'none',all_day:false}]);
  if(path.endsWith('/complete_household_list_item')){const item=items.find(x=>x.id===body.p_item_id);item.completed=body.p_completed;if(item.completed&&item.routine_frequency!=='none'&&!items.some(x=>x.id==='next-item'))items.push({...item,id:'next-item',completed:false,due_date:'2026-10-23',assigned_to:second});return result(route,'next-item')}
  if(path.endsWith('/get_weekly_shopping_plan'))return result(route,plan());
  if(path.endsWith('/sync_weekly_shopping_plan')){saveCalls++;if(options.staleShopping&&saveCalls===1){revision=2;return result(route,{message:'El menú o la despensa cambiaron. Actualiza la vista previa antes de guardar.',code:'40001'},409)}
   if(!lists.some(x=>x.id==='week-list'))lists.push({id:'week-list',title:'Compra semanal · 12/10/2026',list_type:'shopping',is_pinned:false,shopping_week:week,created_at:day});
   if(plan().rows.length&&!items.some(x=>x.id==='week-item'))items.push({id:'week-item',list_id:'week-list',text:'Arroz',quantity:plan().rows[0].missing+' g',completed:false,routine_frequency:'none',shopping_week:week});return result(route,'week-list')}
  return route.fallback();
 });
 return {...s,flowCalls:calls,state:()=>({lists,items})};
}
test('daily board combines meals and maintenance, avoids linked duplicates and filters responsibility',async({browser})=>{
 const s=await flow(browser);try{
  await ready(s,'');const board=s.page.getByRole('region',{name:'Hoy y esta semana'});
  await expect(board.getByText('Lavar ropa',{exact:true})).toBeVisible();await expect(s.page.locator('.home-priority-strip')).toContainText('Tienes pendientes por revisar');await expect(board.getByText('Revisión de casa',{exact:true})).toHaveCount(1);await expect(board.getByText('Ensalada de la casa',{exact:true})).toBeVisible();
  await board.getByRole('button',{name:'Esta semana',exact:true}).click();await expect(board.getByText('Ensalada compartida',{exact:true})).toBeVisible();
  await board.getByLabel('Filtrar actividades por responsable').selectOption(uid);await expect(board.getByText('Limpiar ventanas',{exact:true})).toHaveCount(0);await expect(board.getByText('Ensalada compartida',{exact:true})).toBeVisible();await healthy(s);
 }finally{await s.context.close()}
});
test('lists can be pinned, renamed and corrected without deleting their items',async({browser})=>{
 const s=await flow(browser);try{await ready(s,'listas');await s.page.getByRole('button',{name:'Fijar Rutinas de casa',exact:true}).click();await expect(s.page.getByRole('button',{name:'Desfijar Rutinas de casa',exact:true})).toHaveAttribute('aria-pressed','true');
  await s.page.locator('.list-card-v2').filter({hasText:'Rutinas de casa'}).click();await s.page.getByRole('button',{name:'Editar nombre de lista'}).click();await s.page.getByLabel('Nombre de la lista').fill('Nuestra semana');await s.page.getByRole('button',{name:'Guardar lista',exact:true}).click();await expect(s.page.getByRole('heading',{name:'Nuestra semana',exact:true})).toBeVisible();
  await s.page.getByRole('button',{name:'Editar elemento Lavar ropa'}).click();await s.page.getByLabel('Elemento',{exact:true}).fill('Lavar ropa blanca');await s.page.getByRole('dialog').getByLabel('Nota del elemento').fill('Ciclo delicado');await s.page.getByRole('button',{name:'Guardar elemento',exact:true}).click();await expect(s.page.getByText('Lavar ropa blanca',{exact:true})).toBeVisible();expect(s.state().items.find(x=>x.id==='overdue').notes).toBe('Ciclo delicado');expect(s.flowCalls.some(c=>c.method==='DELETE')).toBe(false);
 }finally{await s.context.close()}
});
test('a weekly routine rotates people and keeps a completed occurrence in history',async({browser})=>{
 const s=await flow(browser);try{await ready(s,'listas');await s.page.locator('.list-card-v2').filter({hasText:'Rutinas de casa'}).click();await s.page.getByLabel('Nuevo elemento',{exact:true}).fill('Ordenar cocina');await s.page.getByText('Responsable, fecha y opciones',{exact:true}).click();await s.page.getByLabel('Fecha del pendiente').fill(day);await s.page.getByLabel('Repetir tarea').selectOption('weekly');await s.page.getByRole('checkbox',{name:'QA owner',exact:true}).check();await s.page.getByRole('checkbox',{name:'QA pareja',exact:true}).check();await s.page.getByRole('button',{name:'Agregar',exact:true}).click();
  await expect(s.page.getByLabel('Nuevo elemento',{exact:true})).toHaveValue('');const created=s.state().items.find(x=>x.text==='Ordenar cocina');expect(created.routine_members).toEqual([uid,second]);expect(created.routine_frequency).toBe('weekly');
  await s.page.getByRole('button',{name:'Completar Ordenar cocina',exact:true}).click();await expect(s.page.getByRole('button',{name:'Marcar pendiente Ordenar cocina',exact:true})).toBeVisible();await expect(s.page.getByRole('button',{name:'Completar Ordenar cocina',exact:true})).toBeVisible();expect(s.state().items.find(x=>x.id==='next-item').assigned_to).toBe(second);await healthy(s);
 }finally{await s.context.close()}
});
test('failed list creation preserves the typed item and a retry saves it',async({browser})=>{
 const s=await flow(browser,{itemFailure:true});try{await ready(s,'listas');await s.page.locator('.list-card-v2').first().click();await s.page.getByLabel('Nuevo elemento',{exact:true}).fill('Conservar borrador');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();await expect(s.page.getByRole('alert')).toContainText('No se pudo guardar');await expect(s.page.getByLabel('Nuevo elemento',{exact:true})).toHaveValue('Conservar borrador');await s.page.getByRole('button',{name:'Agregar',exact:true}).click();await expect(s.page.getByLabel('Nuevo elemento',{exact:true})).toHaveValue('');
 }finally{await s.context.close()}
});
test('weekly shopping previews quantities, refreshes a stale snapshot and opens the saved list',async({browser})=>{
 const s=await flow(browser,{staleShopping:true});try{await ready(s,'comidas');await s.page.getByRole('button',{name:'Preparar compra semanal',exact:true}).click();const modal=s.page.getByRole('dialog',{name:'Compra semanal',exact:true});await expect(modal.getByText('800 g',{exact:true})).toBeVisible();await expect(modal.getByText(/sin ingredientes calculables/)).toBeVisible();await modal.getByRole('button',{name:'Guardar lista semanal',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('cambiaron');await modal.getByRole('button',{name:'Actualizar cálculo',exact:true}).click();await expect(modal.getByText('700 g',{exact:true})).toBeVisible();await modal.getByRole('button',{name:'Guardar lista semanal',exact:true}).click();await expect(modal.getByRole('status')).toContainText('guardada');await modal.getByRole('button',{name:'Ver en Listas',exact:false}).click();await expect(s.page.locator('.list-card-v2').filter({hasText:'Compra semanal'})).toBeVisible();expect(s.state().items.find(x=>x.id==='week-item').quantity).toBe('700 g');await healthy(s);
 }finally{await s.context.close()}
});
test('an empty weekly calculation can clear previous automatic pending items',async({browser})=>{const s=await flow(browser,{emptyShopping:true});try{await ready(s,'comidas');await s.page.getByRole('button',{name:'Preparar compra semanal',exact:true}).click();await expect(s.page.getByText('No hay ingredientes pendientes calculables.',{exact:false})).toBeVisible();await s.page.getByRole('button',{name:'Guardar lista semanal',exact:true}).click();await expect(s.page.getByRole('status')).toContainText('guardada');expect(s.state().items.some(x=>x.id==='week-item')).toBe(false)}finally{await s.context.close()}});
test('read-only users can preview the weekly shopping calculation without mutation controls',async({browser})=>{
 const access=Object.fromEntries(['finance','calendar','lists','documents','meals','maintenance','planning','health','monthly_close','automations','backups','diagnostics'].map(x=>[x,'view']));const s=await flow(browser,{accessOverride:access});try{await ready(s,'listas');await expect(s.page.getByRole('button',{name:/Fijar|Editar nombre|Eliminar lista/})).toHaveCount(0);await s.page.locator('.list-card-v2').first().click();await expect(s.page.getByLabel('Nuevo elemento',{exact:true})).toHaveCount(0);await ready(s,'comidas');await s.page.getByRole('button',{name:'Preparar compra semanal',exact:true}).click();await expect(s.page.getByText('800 g',{exact:true})).toBeVisible();await expect(s.page.getByRole('button',{name:'Guardar lista semanal',exact:true})).toHaveCount(0);expect(s.flowCalls.some(x=>x.path.endsWith('/sync_weekly_shopping_plan'))).toBe(false);
 }finally{await s.context.close()}
});
for(const theme of ['light','dark'])test('daily flows fit phone and desktop with accessible controls: '+theme,async({browser})=>{
 const s=await flow(browser,{theme});try{
  for(const tab of ['', 'listas','comidas']){await ready(s,tab);if(tab==='listas')await s.page.locator('.list-card-v2').first().click();if(tab==='comidas')await s.page.getByRole('button',{name:'Preparar compra semanal',exact:true}).click();
   for(const width of [320,390,768,1280]){await s.page.setViewportSize({width,height:800});const overflow=await s.page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(x=>{const r=x.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(x=>({tag:x.tagName,cls:x.className,width:x.getBoundingClientRect().width})).slice(0,12));expect(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify({tab,width,overflow})).toBe(true);await healthy(s)}
   const scan=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.filter(v=>['critical','serious'].includes(v.impact)),JSON.stringify(scan.violations)).toEqual([]);
   await s.page.screenshot({path:'test-results/daily-'+(tab||'home')+'-'+theme+'-desktop.png',fullPage:true});await s.page.setViewportSize({width:320,height:640});await healthy(s);await s.page.screenshot({path:'test-results/daily-'+(tab||'home')+'-'+theme+'-mobile.png',fullPage:true});if(tab==='comidas')await s.page.getByRole('button',{name:'Cerrar compra semanal',exact:true}).click();await s.page.setViewportSize({width:390,height:844});
  }
 }finally{await s.context.close()}
});
test('an update is visible before sign-in',async({browser})=>{
 const s=await setup(browser,{loggedIn:false});try{await s.page.goto('http://127.0.0.1:4173/nuestro-hogar/');await s.page.getByLabel('Correo electrónico',{exact:true}).waitFor();await s.page.evaluate(()=>window.dispatchEvent(new CustomEvent('nh:update-ready',{detail:{registration:{waiting:{postMessage(){}}}}})));await expect(s.page.getByRole('button',{name:'Actualizar ahora',exact:true})).toBeVisible();await s.page.getByRole('button',{name:'Posponer actualización'}).click();await expect(s.page.getByRole('button',{name:'Actualizar ahora',exact:true})).toHaveCount(0);
 }finally{await s.context.close()}
});
