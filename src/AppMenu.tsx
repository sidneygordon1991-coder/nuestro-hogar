import {useFocusTrap} from './lib/useFocusTrap';
import ModuleIcon from './ModuleIcon';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronRight,Download,Monitor,Menu,Moon,Settings2,ShieldCheck,Sun,X} from 'lucide-react';

type AccessLevel='none'|'view'|'edit';
type Theme='system'|'dark'|'light';

type Item={tab:string;module?:string;label:string;description:string;icon:React.ReactNode};
const groups:{label:string;items:Item[]}[]=[
 {label:'Día a día',items:[
  {tab:'inicio',label:'Inicio',description:'Resumen y prioridades',icon:<ModuleIcon name="home"/>},
  {tab:'calendario',module:'calendar',label:'Agenda',description:'Eventos y fechas importantes',icon:<ModuleIcon name="calendar"/>},
  {tab:'listas',module:'lists',label:'Listas',description:'Tareas y compras',icon:<ModuleIcon name="lists"/>},
  {tab:'presupuesto',module:'finance',label:'Finanzas',description:'Presupuesto y movimientos',icon:<ModuleIcon name="finance"/>}
 ]},
 {label:'Organización',items:[
  {tab:'comidas',module:'meals',label:'Comidas',description:'Menú, recetas y despensa',icon:<ModuleIcon name="meals"/>},
  {tab:'documentos',module:'documents',label:'Documentos',description:'Bóveda y vencimientos',icon:<ModuleIcon name="documents"/>},
  {tab:'mantenimiento',module:'maintenance',label:'Mantenimiento',description:'Casa, vehículos y garantías',icon:<ModuleIcon name="maintenance"/>},
  {tab:'planeacion',module:'planning',label:'Planeación',description:'Objetivos y roadmap',icon:<ModuleIcon name="planning"/>}
 ]},
 {label:'Análisis',items:[
  {tab:'salud',module:'health',label:'Salud del hogar',description:'Indicadores integrados',icon:<ModuleIcon name="health"/>},
  {tab:'cierre',module:'monthly_close',label:'Cierre mensual',description:'Fotografía y reflexión',icon:<ModuleIcon name="monthly_close"/>},
  {tab:'automatizaciones',module:'automations',label:'Automatizaciones',description:'Reglas y acciones',icon:<ModuleIcon name="automations"/>}
 ]},
 {label:'Administración',items:[
  {tab:'familia',label:'Familia',description:'Perfiles y permisos',icon:<ModuleIcon name="family"/>},
  {tab:'respaldos',module:'backups',label:'Respaldos',description:'Copias y recuperación',icon:<ModuleIcon name="backups"/>},
  {tab:'diagnostico',module:'diagnostics',label:'Diagnóstico',description:'Calidad y confiabilidad',icon:<ModuleIcon name="diagnostics"/>}
 ]}
];

export default function AppMenu({currentTab,access,onNavigate,isMaster=false}:{currentTab:string;access:Record<string,AccessLevel>;onNavigate:(tab:string)=>void;isMaster?:boolean}){
 const [open,setOpen]=useState(false),[theme,setTheme]=useState<Theme>(()=>readThemePreference());
 const panel=useRef<HTMLElement>(null);useFocusTrap(panel,open,()=>setOpen(false));
 const available=useMemo(()=>groups.map(group=>group.label==='Administración'&&isMaster?{...group,items:[...group.items,{tab:'master',label:'Panel master',description:'Familias y almacenamiento',icon:<ShieldCheck/>} as Item]}:group).map(group=>({...group,items:group.items.filter(item=>!item.module||access[item.module]!=='none')})).filter(group=>group.items.length),[access,isMaster]);

 useEffect(()=>{
  if(!open)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};
  document.body.classList.add('app-menu-open');
  window.addEventListener('keydown',key);
  return()=>{document.body.classList.remove('app-menu-open');window.removeEventListener('keydown',key)}
 },[open]);

 useEffect(()=>{
  const sync=()=>setTheme(readThemePreference());
  window.addEventListener('nh:theme-change',sync);
  return()=>window.removeEventListener('nh:theme-change',sync);
 },[]);


 function chooseTheme(next:Theme){setTheme(next);setThemePreference(next)}
 function go(tab:string){setOpen(false);onNavigate(tab)}

 return <>
  <button className="app-menu-trigger" onClick={()=>setOpen(true)} aria-label="Abrir navegación" aria-expanded={open}><Menu/></button>
  {open&&<>
   <button className="app-menu-scrim" onClick={()=>setOpen(false)} aria-label="Cerrar navegación"/>
   <aside ref={panel} className="app-menu-drawer" role="dialog" aria-modal="true" aria-label="Navegación de Nuestro Hogar">
    <div className="app-menu-head"><div><p className="eyebrow">NUESTRO HOGAR</p><h2>Todo en un lugar</h2></div><button onClick={()=>setOpen(false)} aria-label="Cerrar"><X/></button></div>
    <div className="app-menu-groups">{available.map(group=><section key={group.label}><small>{group.label}</small><div>{group.items.map(item=><button key={item.tab} className={currentTab===item.tab?'active':''} onClick={()=>go(item.tab)}><span>{item.icon}</span><div><strong>{item.label}</strong><em>{item.description}</em></div><ChevronRight/></button>)}</div></section>)}</div>
    <section className="app-menu-theme"><div><span><Settings2/></span><div><strong>Apariencia</strong><small>Se guarda en este dispositivo</small></div></div><div className="theme-segment"><button className={theme==='system'?'active':''} onClick={()=>chooseTheme('system')}><Monitor/>Auto</button><button className={theme==='dark'?'active':''} onClick={()=>chooseTheme('dark')}><Moon/>Oscuro</button><button className={theme==='light'?'active':''} onClick={()=>chooseTheme('light')}><Sun/>Claro</button></div></section><button className="menu-install-action" onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent('nh:install-help'))}}><Download size={17}/> Instalar Nuestro Hogar</button>
   </aside>
  </>}
 </>;
}

export function readThemePreference():Theme {
 const saved=localStorage.getItem('nh-theme');
 return saved==='light'||saved==='dark'?saved:'system';
}

function setThemePreference(theme:Theme) {
 localStorage.setItem('nh-theme',theme);
 applyTheme(theme);
 window.dispatchEvent(new CustomEvent('nh:theme-change',{detail:theme}));
}

export function toggleTheme(){
 setThemePreference(document.documentElement.dataset.theme==='light'?'dark':'light');
}

export function useEffectiveTheme(){
 const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme||'dark');
 useEffect(()=>{
  const sync=()=>setTheme(document.documentElement.dataset.theme||'dark');
  window.addEventListener('nh:theme-change',sync);
  return()=>window.removeEventListener('nh:theme-change',sync);
 },[]);
 return theme;
}

let initialized=false;
export function initializeTheme(){
 applyTheme(readThemePreference());
 if(initialized)return;
 initialized=true;
 const sync=()=>{
  applyTheme(readThemePreference());
  window.dispatchEvent(new CustomEvent('nh:theme-change'));
 };
 window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{
  if(readThemePreference()==='system')sync();
 });
 window.addEventListener('storage',event=>{if(event.key==='nh-theme'||event.key===null)sync()});
}

function applyTheme(theme:Theme){
 const effective=theme==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;
 document.documentElement.dataset.theme=effective;
 document.documentElement.dataset.themePreference=theme;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',effective==='light'?'#f3f7fb':'#0d141c');
}
