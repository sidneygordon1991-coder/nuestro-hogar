import {useEffect,useMemo,useState} from 'react';
import {Activity,CalendarDays,CheckSquare,ChevronRight,ClipboardCheck,FileText,HardDrive,HeartPulse,Home,Landmark,ListChecks,Map,Menu,Moon,Settings2,Sun,Users,Utensils,WalletCards,Wrench,X,Zap} from 'lucide-react';

type AccessLevel='none'|'view'|'edit';
type Theme='system'|'dark'|'light';

type Item={tab:string;module?:string;label:string;description:string;icon:React.ReactNode};
const groups:{label:string;items:Item[]}[]=[
 {label:'Día a día',items:[
  {tab:'inicio',label:'Inicio',description:'Resumen y prioridades',icon:<Home/>},
  {tab:'calendario',module:'calendar',label:'Agenda',description:'Eventos y fechas importantes',icon:<CalendarDays/>},
  {tab:'listas',module:'lists',label:'Listas',description:'Tareas y compras',icon:<ListChecks/>},
  {tab:'presupuesto',module:'finance',label:'Finanzas',description:'Presupuesto y movimientos',icon:<WalletCards/>}
 ]},
 {label:'Organización',items:[
  {tab:'comidas',module:'meals',label:'Comidas',description:'Menú, recetas y despensa',icon:<Utensils/>},
  {tab:'documentos',module:'documents',label:'Documentos',description:'Bóveda y vencimientos',icon:<FileText/>},
  {tab:'mantenimiento',module:'maintenance',label:'Mantenimiento',description:'Casa, vehículos y garantías',icon:<Wrench/>},
  {tab:'planeacion',module:'planning',label:'Planeación',description:'Objetivos y roadmap',icon:<Map/>}
 ]},
 {label:'Análisis',items:[
  {tab:'salud',module:'health',label:'Salud del hogar',description:'Indicadores integrados',icon:<HeartPulse/>},
  {tab:'cierre',module:'monthly_close',label:'Cierre mensual',description:'Fotografía y reflexión',icon:<ClipboardCheck/>},
  {tab:'automatizaciones',module:'automations',label:'Automatizaciones',description:'Reglas y acciones',icon:<Zap/>}
 ]},
 {label:'Administración',items:[
  {tab:'familia',label:'Familia',description:'Perfiles y permisos',icon:<Users/>},
  {tab:'respaldos',module:'backups',label:'Respaldos',description:'Copias y recuperación',icon:<HardDrive/>},
  {tab:'diagnostico',module:'diagnostics',label:'Diagnóstico',description:'Calidad y confiabilidad',icon:<Activity/>}
 ]}
];

export default function AppMenu({currentTab,access,onNavigate}:{currentTab:string;access:Record<string,AccessLevel>;onNavigate:(tab:string)=>void}){
 const [open,setOpen]=useState(false),[theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('nh-theme') as Theme)||'system');
 const available=useMemo(()=>groups.map(group=>({...group,items:group.items.filter(item=>!item.module||access[item.module]!=='none')})).filter(group=>group.items.length),[access]);

 useEffect(()=>{
  if(!open)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
  document.body.classList.add('app-menu-open');
  window.addEventListener('keydown',key);
  return()=>{document.body.classList.remove('app-menu-open');window.removeEventListener('keydown',key)}
 },[open]);

 useEffect(()=>{
  applyTheme(theme);
  const media=window.matchMedia('(prefers-color-scheme: light)');
  const update=()=>{if(theme==='system')applyTheme('system')};
  media.addEventListener?.('change',update);
  return()=>media.removeEventListener?.('change',update)
 },[theme]);

 function chooseTheme(next:Theme){setTheme(next);localStorage.setItem('nh-theme',next);applyTheme(next)}
 function go(tab:string){setOpen(false);onNavigate(tab)}

 return <>
  <button className="app-menu-trigger" onClick={()=>setOpen(true)} aria-label="Abrir navegación" aria-expanded={open}><Menu/></button>
  {open&&<>
   <button className="app-menu-scrim" onClick={()=>setOpen(false)} aria-label="Cerrar navegación"/>
   <aside className="app-menu-drawer" role="dialog" aria-modal="true" aria-label="Navegación de Nuestro Hogar">
    <div className="app-menu-head"><div><p className="eyebrow">NUESTRO HOGAR</p><h2>Todo en un lugar</h2></div><button onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button></div>
    <div className="app-menu-groups">{available.map(group=><section key={group.label}><small>{group.label}</small><div>{group.items.map(item=><button key={item.tab} className={currentTab===item.tab?'active':''} onClick={()=>go(item.tab)}><span>{item.icon}</span><div><strong>{item.label}</strong><em>{item.description}</em></div><ChevronRight/></button>)}</div></section>)}</div>
    <section className="app-menu-theme"><div><span><Settings2/></span><div><strong>Apariencia</strong><small>Se guarda en este dispositivo</small></div></div><div className="theme-segment"><button className={theme==='system'?'active':''} onClick={()=>chooseTheme('system')}><Landmark/>Auto</button><button className={theme==='dark'?'active':''} onClick={()=>chooseTheme('dark')}><Moon/>Oscuro</button><button className={theme==='light'?'active':''} onClick={()=>chooseTheme('light')}><Sun/>Claro</button></div></section>
   </aside>
  </>}
 </>;
}

export function initializeTheme(){
 const theme=(localStorage.getItem('nh-theme') as Theme)||'system';
 applyTheme(theme);
}

function applyTheme(theme:Theme){
 const effective=theme==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;
 document.documentElement.dataset.theme=effective;
 document.documentElement.dataset.themePreference=theme;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',effective==='light'?'#f4f7fa':'#0d1014');
}
