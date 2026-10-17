import {financeSection} from './financeNavigation';
export const workspaceGroups=[
 {id:'today',label:'Hoy',short:'Hoy',icon:'home',items:[{label:'Inicio',route:'inicio'}]},
 {id:'money',label:'Mi dinero',short:'Dinero',icon:'finance',items:[{label:'Resumen financiero',route:'presupuesto:summary',module:'finance'},{label:'Movimientos y comprobantes',route:'presupuesto:transactions',module:'finance'},{label:'Ingresos',route:'presupuesto:income',module:'finance'},{label:'Cuentas y transferencias',route:'presupuesto:accounts',module:'finance'}]},
 {id:'plan',label:'Mi plan',short:'Plan',icon:'planning',items:[{label:'Presupuesto',route:'presupuesto:budget',module:'finance'},{label:'Quincenas',route:'presupuesto:fortnight',module:'finance'},{label:'Aportes y reglas',route:'presupuesto:contributions',module:'finance'},{label:'Metas de ahorro',route:'presupuesto:goals',module:'finance'},{label:'Pagos recurrentes',route:'presupuesto:recurring',module:'finance'},{label:'Planeación',route:'planeacion',module:'planning'}]},
 {id:'progress',label:'Mi progreso',short:'Progreso',icon:'health',items:[{label:'Salud del hogar',route:'salud',module:'health'},{label:'Comparación entre meses',route:'presupuesto:comparison',module:'finance'},{label:'Patrimonio',route:'presupuesto:networth',module:'finance'},{label:'Cierre mensual',route:'cierre',module:'monthly_close'}]},
 {id:'home',label:'Mi hogar',short:'Hogar',icon:'family',items:[{label:'Agenda y calendario',route:'calendario',module:'calendar'},{label:'Familia y permisos',route:'familia'},{label:'Listas y compras',route:'listas',module:'lists'},{label:'Comidas y despensa',route:'comidas',module:'meals'},{label:'Documentos',route:'documentos',module:'documents'},{label:'Mantenimiento',route:'mantenimiento',module:'maintenance'}]}
] as const;
export type WorkspaceGroup=typeof workspaceGroups[number]['id'];
export function workspaceGroup(tab:string,section:string|null):WorkspaceGroup{
 const route=tab==='presupuesto'?tab+':'+financeSection(section):tab;
 return workspaceGroups.find(g=>g.items.some(i=>i.route===route))?.id||'home';
}
export function permittedWorkspaceGroups(access:Record<string,string>){return workspaceGroups.map(g=>({...g,items:g.items.filter(i=>!('module'in i)||access[i.module]!=='none')})).filter(g=>g.items.length>0)}
