import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {setup,ready,healthy,uid,hh} from './support.mjs';
const finishes=[['ocean','Azul'],['forest','Verde'],['graphite','Grafito'],['aurora','Tornasol'],['iris','Lavanda']];
async function accessible(page){const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(r.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([])}
for(const theme of ['light','dark']){
 for(const [accent,label] of finishes)test(`neutral canvas and compact connected dashboard: ${label}, ${theme}`,async({browser},info)=>{
  const s=await setup(browser,{rich:true,theme});
  try{
   await s.context.addInitScript(({uid,hh,accent})=>localStorage.setItem('nh:appearance:'+uid+':'+hh,JSON.stringify({accent,focus:'balance',view:'complete',favorites:['presupuesto','calendario','listas'],cover:''})),{uid,hh,accent});
   await ready(s,'');await s.page.getByRole('button',{name:'Cerrar sugerencia de instalación',exact:true}).click();await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent',accent);await expect(s.page.locator('.premium-margin>h2')).toContainText('4,099.75');
   expect(await s.page.locator('.app-studio').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(theme==='light'?'rgb(236, 239, 243)':'rgb(21, 23, 28)');
   for(const width of [320,390,768,1440]){
    await s.page.setViewportSize({width,height:844});await healthy(s);
    if(width<761){
     const header=await s.page.locator('.workspace-header').boundingBox(),hero=await s.page.locator('.premium-margin').boundingBox();expect(header.height).toBeLessThan(160);expect(hero.y).toBeLessThan(170);expect(hero.height).toBeLessThan(345);
     await expect(s.page.locator('.premium-pocket-metrics')).toBeVisible();await expect(s.page.locator('.premium-metrics')).toBeHidden();await expect(s.page.locator('.premium-pocket-metrics')).toContainText('6,500.25');
    }
    if(width<1100){const add=await s.page.getByRole('button',{name:'Agregar rápido',exact:true}).boundingBox(),dock=await s.page.getByRole('navigation',{name:'Navegación principal',exact:true}).boundingBox();expect(add.y+add.height).toBeLessThan(dock.y);expect(add.width).toBeGreaterThan(width-40)}
   }
   await accessible(s.page);await s.page.screenshot({path:info.outputPath('desktop.png'),fullPage:true});
   await s.page.setViewportSize({width:390,height:844});await accessible(s.page);await s.page.screenshot({path:info.outputPath('mobile.png')});
   await s.page.locator('.premium-period-details>summary').click();await expect(s.page.locator('.premium-projection')).toBeVisible();await expect(s.page.locator('.premium-projection')).toContainText('Plan parcial');
   await s.page.locator('.premium-pocket-metrics button').first().click();await expect(s.page.locator('.finance-tabs .active')).toHaveText('Ingresos');await healthy(s);
  }finally{await s.context.close()}
 });
 test(`finish preview, persistence, modal actions and immediate theme change: ${theme}`,async({browser})=>{
  const s=await setup(browser,{rich:true,theme}),writes=[];
  s.page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/rest/')&&['POST','PATCH','DELETE'].includes(r.method())&&!/\/rpc\/(get_my_household_access|get_my_household_storage|refresh_my_notifications)$/.test(path))writes.push(path)});
  try{
   await ready(s,'');await s.page.getByRole('button',{name:'Cerrar sugerencia de instalación',exact:true}).click();
   for(const [accent,label] of finishes){
    await s.page.locator('.premium-personalize').click();const dialog=s.page.getByRole('dialog',{name:'Personaliza tu espacio',exact:true});await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog.locator('.appearance-palette-preview')).toHaveAttribute('data-accent',accent);await expect(dialog.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(s.page.getByRole('button',{name:'Agregar rápido',exact:true})).toBeHidden();await accessible(s.page);const save=dialog.getByRole('button',{name:'Guardar apariencia',exact:true});await save.scrollIntoViewIfNeeded();await expect(save).toBeInViewport();await save.click();await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent',accent);
    await s.page.reload();await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent',accent);await healthy(s);
   }
   await s.page.getByRole('button',{name:theme==='light'?'Activar tema de noche':'Activar tema de día',exact:true}).click();await expect(s.page.locator('html')).toHaveAttribute('data-theme',theme==='light'?'dark':'light');await expect(s.page.locator('.app-studio')).toHaveAttribute('data-accent','iris');expect(writes).toEqual([]);
  }finally{await s.context.close()}
 });
}
