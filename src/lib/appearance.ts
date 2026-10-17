export type Appearance={accent:'ocean'|'iris'|'forest'|'royal'|'violet'|'copper'|'wine';focus:'balance'|'plans';view:'essential'|'complete';favorites:string[];cover:string};
export const defaultAppearance:Appearance={accent:'ocean',focus:'balance',view:'complete',favorites:['presupuesto','calendario','listas','documentos'],cover:''};
export const moduleCatalog=[
 {tab:'presupuesto',module:'finance',icon:'finance',label:'Finanzas',detail:'Balance y movimientos'},
 {tab:'calendario',module:'calendar',icon:'calendar',label:'Agenda',detail:'Tus próximos momentos'},
 {tab:'listas',module:'lists',icon:'lists',label:'Listas',detail:'Compras y pendientes'},
 {tab:'familia',icon:'family',label:'Familia',detail:'Las personas que importan'},
 {tab:'documentos',module:'documents',icon:'documents',label:'Documentos',detail:'Tu bóveda personal'},
 {tab:'comidas',module:'meals',icon:'meals',label:'Comidas',detail:'Planea, cocina y disfruta'},
 {tab:'mantenimiento',module:'maintenance',icon:'maintenance',label:'Mantenimiento',detail:'Cuida lo que tienes'},
 {tab:'planeacion',module:'planning',icon:'planning',label:'Planeación',detail:'Da forma a tus metas'},
 {tab:'salud',module:'health',icon:'health',label:'Salud del hogar',detail:'Tu hogar en equilibrio'},
 {tab:'cierre',module:'monthly_close',icon:'monthly_close',label:'Cierre mensual',detail:'Reflexiona y avanza'},
 {tab:'automatizaciones',module:'automations',icon:'automations',label:'Automatizaciones',detail:'Rutinas que ayudan'},
 {tab:'respaldos',module:'backups',icon:'backups',label:'Respaldos',detail:'Protege tu información'},
 {tab:'diagnostico',module:'diagnostics',icon:'diagnostics',label:'Diagnóstico',detail:'Calidad y confiabilidad'}
] as const;
export function normalizeAppearance(raw:unknown):Appearance{
 const x=(raw&&typeof raw==='object'?raw:{}) as Partial<Appearance>;
 const favorites=Array.isArray(x.favorites)?Array.from(new Set(x.favorites.filter(t=>moduleCatalog.some(m=>m.tab===t)))).slice(0,6):defaultAppearance.favorites;
 return {accent:['ocean','iris','forest','royal','violet','copper','wine'].includes(x.accent||'')?x.accent as Appearance['accent']:'ocean',focus:x.focus==='plans'?'plans':'balance',view:x.view==='essential'?'essential':'complete',favorites,cover:typeof x.cover==='string'&&/^data:image\/(jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(x.cover)&&x.cover.length<=900000?x.cover:''};
}
export function appearanceKey(userId:string,householdId:string){return 'nh:appearance:'+userId+':'+householdId}
export function readAppearance(key:string){try{return normalizeAppearance(JSON.parse(localStorage.getItem(key)||'{}'))}catch{return {...defaultAppearance}}}
export async function makeCover(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Elige una imagen JPG, PNG o WEBP de hasta 20 MB.');
 const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No pudimos preparar la imagen.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let result=canvas.toDataURL('image/jpeg',.78);if(result.length>900000)result=canvas.toDataURL('image/jpeg',.5);if(result.length>900000)throw new Error('La imagen sigue siendo muy grande. Elige una foto más pequeña.');return result}finally{bitmap.close()}
}
