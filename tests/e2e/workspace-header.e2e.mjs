import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,healthy,uid,hh,rid} from './support.mjs';
const modules=['presupuesto','calendario','listas','familia','documentos','comidas','mantenimiento','planeacion','salud','cierre','automatizaciones','respaldos','diagnostico'];

for(const theme of ['light','dark'])test(`one compact header owns module titles and actions: ${theme}`,async({browser},testInfo)=>{
 const s=await setup(browser,{rich:true,theme});
 try{
  for(const tab of modules){
   await ready(s,tab);const header=s.page.locator('.workspace-header');
   await expect(header.locator('.workspace-title')).toHaveCount(1);await expect(s.page.locator('.content .workspace-title')).toHaveCount(0);await expect(header.locator('.workspace-heading')).toHaveCount(1);
   for(const width of [320,390,768,1280]){await s.page.setViewportSize({width,height:844});await healthy(s);const box=await header.boundingBox();expect(box.width).toBeLessThanOrEqual(width)}
   await header.locator('.workspace-help summary').click();await expect(header.locator('.workspace-description')).toBeVisible();await expect(header.locator('.workspace-help li')).toHaveCount(3);await header.locator('.workspace-help summary').click();
  }
  await ready(s,'presupuesto');await s.page.setViewportSize({width:390,height:844});
  // Baseline v24: the month selector began at 422px in this same fixture.
  expect((await s.page.locator('.month-switch').boundingBox()).y).toBeLessThan(220);
  await testInfo.attach('compact-header-'+theme,{body:await s.page.screenshot(),contentType:'image/png'});
  const result=await new AxeBuilder({page:s.page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
  await s.page.getByRole('button',{name:theme==='light'?'Activar tema de noche':'Activar tema de día',exact:true}).click();await expect(s.page.locator('html')).toHaveAttribute('data-theme',theme==='light'?'dark':'light');
  await s.page.locator('.content').click({position:{x:5,y:5}});await s.page.evaluate(()=>window.scrollTo(0,450));expect((await s.page.locator('.workspace-header').boundingBox()).y).toBeLessThan(0);
 }finally{await s.context.close()}
});

test('heading actions retain module state and personalization remains reachable',async({browser})=>{
 const s=await setup(browser,{rich:true,twoHomes:true});
 try{
  await ready(s,'presupuesto');await s.page.locator('.workspace-header').getByRole('button',{name:'Movimiento',exact:true}).click();await expect(s.page.getByRole('heading',{name:'Nuevo movimiento',exact:true})).toBeVisible();await expect(s.page.locator('.app>nav')).not.toBeVisible();await s.page.keyboard.press('Escape');await expect(s.page.locator('.finance-modal')).toHaveCount(0);
  await s.page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await s.page.getByRole('button',{name:'Personalizar mi espacio',exact:true}).click();await expect(s.page.getByRole('heading',{name:'Personaliza tu espacio',exact:true})).toBeVisible();await s.page.keyboard.press('Escape');
  await s.page.locator('nav[aria-label="Navegación principal"]').getByRole('button',{name:'Mi hogar',exact:true}).click();await s.page.getByRole('dialog',{name:'Mi hogar',exact:true}).getByRole('button',{name:'Familia y permisos',exact:true}).click();await expect(s.page.locator('.workspace-header .page-title')).toHaveText('Mi familia');await s.page.locator('.workspace-header').getByRole('button',{name:'Mi perfil',exact:true}).click();await expect(s.page.locator('.modal-backdrop')).toBeVisible();await s.page.keyboard.press('Escape');
  await s.page.getByLabel('Cambiar de familia',{exact:true}).selectOption(rid);await expect(s.page.getByLabel('Cambiar de familia',{exact:true})).toHaveValue(rid);await expect(s.page.locator('.workspace-header .workspace-title')).toHaveCount(1);await healthy(s);
 }finally{await s.context.close()}
});

test('long household names and agenda-first personalization fit without stale headings',async({browser})=>{
 const s=await setup(browser,{rich:true});
 try{
  await s.context.addInitScript(({uid,hh})=>localStorage.setItem('nh:appearance:'+uid+':'+hh,JSON.stringify({accent:'forest',focus:'plans',favorites:['presupuesto'],cover:''})),{uid,hh});
  const name='Familia Gordon Colindres y un nombre de hogar más largo';
  await s.page.route('**/rest/v1/household_members?**',route=>{if(!new URL(route.request().url()).searchParams.get('select')?.includes('households('))return route.fallback();return route.fulfill({json:[{user_id:uid,household_id:hh,households:{id:hh,name,invite_code:'QA'}}]})});
  await ready(s,'');await expect(s.page.locator('.workspace-header .home-intro')).toHaveCount(1);await expect(s.page.locator('.content .home-intro')).toHaveCount(0);await expect(s.page.locator('.home-select-label')).toHaveText(name);
  for(const width of [320,390,768,1100,1280]){await s.page.setViewportSize({width,height:844});await healthy(s);const label=await s.page.locator('.home-select-label').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));expect(label.scroll).toBeLessThanOrEqual(label.height+1)}
  const agenda=await s.page.locator('.studio-agenda').boundingBox(),priority=await s.page.locator('.home-today').boundingBox();expect(agenda.y+agenda.height).toBeLessThanOrEqual(priority.y+1);
  await s.page.locator('.global-search-trigger').click();await s.page.keyboard.press('Escape');await healthy(s);
 }finally{await s.context.close()}
});
