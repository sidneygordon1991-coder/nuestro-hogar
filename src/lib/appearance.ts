/** Four finishes: green (default), blue, black and purple. Ids stay stable for saved preferences. */
export const appearanceAccents=[{id:'forest',label:'Verde'},{id:'ocean',label:'Azul'},{id:'graphite',label:'Negro'},{id:'iris',label:'Morado'}] as const;
export type AppearanceAccent=typeof appearanceAccents[number]['id'];
/** Retired finishes map to the closest current one instead of resetting the user's choice. */
const legacyAccents:Record<string,AppearanceAccent>={aurora:'iris'};
export type Appearance={accent:AppearanceAccent;focus:'balance'|'plans';view:'essential'|'complete';favorites:string[];cover:string};
// Simple by default: extra modules appear when the household adds them to favorites or switches to the complete view.
export const defaultAppearance:Appearance={accent:'forest',focus:'balance',view:'essential',favorites:['presupuesto','calendario','listas','documentos'],cover:''};
export const moduleCatalog=[
 {tab:'presupuesto',module:'finance',icon:'finance',label:'Finanzas',detail:'Balance y movimientos'},
 {tab:'calendario',module:'calendar',icon:'calendar',label:'Agenda',detail:'Tus próximos momentos'},
 {tab:'listas',module:'lists',icon:'lists',label:'Listas',detail:'Compras y pendientes'},
 {tab:'familia',icon:'family',label:'Familia',detail:'Las personas que importan'},
 {tab:'documentos',module:'documents',icon:'documents',label:'Documentos',detail:'Tu bóveda personal'},
 {tab:'comidas',module:'meals',icon:'meals',label:'Comidas',detail:'Planea, cocina y disfruta'},
 {tab:'mantenimiento',module:'maintenance',icon:'maintenance',label:'Mantenimiento',detail:'Cuida lo que tienes'},
 {tab:'planeacion',module:'planning',icon:'planning',label:'Planeación',detail:'Planes grandes, paso a paso'},
 {tab:'salud',module:'health',icon:'health',label:'Salud del hogar',detail:'Tu hogar en equilibrio'},
 {tab:'cierre',module:'monthly_close',icon:'monthly_close',label:'Cierre mensual',detail:'Reflexiona y avanza'},
 {tab:'automatizaciones',module:'automations',icon:'automations',label:'Automatizaciones',detail:'Rutinas que ayudan'},
 {tab:'respaldos',module:'backups',icon:'backups',label:'Respaldos',detail:'Protege tu información'},
 {tab:'diagnostico',module:'diagnostics',icon:'diagnostics',label:'Estado de la app',detail:'Revisa que todo funcione'}
] as const;
export function normalizeAppearance(raw:unknown):Appearance{
 const x=(raw&&typeof raw==='object'?raw:{}) as Partial<Appearance>;
 const favorites=Array.isArray(x.favorites)?Array.from(new Set(x.favorites.filter(t=>moduleCatalog.some(m=>m.tab===t)))).slice(0,6):defaultAppearance.favorites;
 const accent=typeof x.accent==='string'?(legacyAccents[x.accent]||x.accent):'';
 return {accent:appearanceAccents.some(a=>a.id===accent)?accent as AppearanceAccent:defaultAppearance.accent,focus:x.focus==='plans'?'plans':'balance',view:x.view==='complete'?'complete':x.view==='essential'?'essential':defaultAppearance.view,favorites,cover:typeof x.cover==='string'&&/^data:image\/(jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(x.cover)&&x.cover.length<=900000?x.cover:''};
}
export function appearanceKey(userId:string,householdId:string){return 'nh:appearance:'+userId+':'+householdId}
export function readAppearance(key:string){try{return normalizeAppearance(JSON.parse(localStorage.getItem(key)||'{}'))}catch{return {...defaultAppearance}}}

/** Home finance lens: the whole household or only the signed-in member's personal records. */
export type FinanceScope='household'|'personal';
export function scopeKey(userId:string,householdId:string){return 'nh:finance-scope:'+userId+':'+householdId}
export function readScope(key:string):FinanceScope{try{return localStorage.getItem(key)==='personal'?'personal':'household'}catch{return 'household'}}
export function saveScope(key:string,scope:FinanceScope){try{localStorage.setItem(key,scope)}catch{/* private mode: keep the in-memory choice */}}
export async function makeCover(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Elige una imagen JPG, PNG o WEBP de hasta 20 MB.');
 const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No pudimos preparar la imagen.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let result=canvas.toDataURL('image/jpeg',.78);if(result.length>900000)result=canvas.toDataURL('image/jpeg',.5);if(result.length>900000)throw new Error('La imagen sigue siendo muy grande. Elige una foto más pequeña.');return result}finally{bitmap.close()}
}
