import {useEffect,useRef,useState} from 'react';
import {ChartNoAxesCombined,CalendarRange,ChevronDown,House,UsersRound,WalletCards,Download,Palette,Plus,Settings2,ShieldCheck,X} from 'lucide-react';
import ModuleIcon from './ModuleIcon';
import {permittedWorkspaceGroups,workspaceGroup,type WorkspaceGroup} from './lib/workspaceNavigation';
import {useFocusTrap} from './lib/useFocusTrap';
const primaryIcons={today:House,money:WalletCards,plan:CalendarRange,progress:ChartNoAxesCombined,home:UsersRound};
export default function DesktopRail({currentTab,access,isMaster,onNavigate,onAppearance,essential=false,favorites=[]}:{currentTab:string;access:Record<string,string>;isMaster:boolean;onNavigate:(tab:string)=>void;onAppearance:()=>void;essential?:boolean;favorites?:string[]}){
 const [section,setSection]=useState(()=>new URLSearchParams(location.search).get('finance'));
 const [menu,setMenu]=useState<WorkspaceGroup|null>(null),[expanded,setExpanded]=useState(false);
 const panel=useRef<HTMLElement>(null);useFocusTrap(panel,menu!==null,()=>setMenu(null));
 useEffect(()=>{const update=()=>setSection(new URLSearchParams(location.search).get('finance'));window.addEventListener('popstate',update);window.addEventListener('nh:finance-section',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('nh:finance-section',update)}},[]);
 useEffect(()=>{if(!menu)return;document.body.classList.add('workspace-navigation-open');return()=>document.body.classList.remove('workspace-navigation-open')},[menu]);
 const groups=permittedWorkspaceGroups(access),active=workspaceGroup(currentTab,section),selected=groups.find(g=>g.id===menu);
 const tools=[{route:'automatizaciones',label:'Automatizaciones',module:'automations'},{route:'respaldos',label:'Respaldos',module:'backups'},{route:'diagnostico',label:'Diagnóstico',module:'diagnostics'}].filter(t=>access[t.module]!=='none');
 function navigate(route:string){setMenu(null);onNavigate(route)}
 const isCurrent=(route:string)=>route===(currentTab==='presupuesto'?'presupuesto:'+(section||'summary'):currentTab);
 return <>
  <aside className="desktop-rail premium-rail" aria-label="Navegación de escritorio"><a className="rail-brand" href={import.meta.env.BASE_URL} onClick={e=>{e.preventDefault();navigate('inicio')}}><span><ModuleIcon name="home" size={29}/></span><strong>Nuestro Hogar<small>TU VIDA, EN EQUILIBRIO</small></strong></a><button className="rail-add" onClick={()=>window.dispatchEvent(new CustomEvent('nh:quick-add'))}><Plus size={18}/> Registrar</button>
   <div role="navigation" aria-label="Espacios principales" className="rail-groups premium-rail-groups">{groups.map(g=><section key={g.id}><button className={'premium-rail-main '+(g.id===active?'active':'')} aria-current={g.id==='today'&&active==='today'?'page':undefined} onClick={()=>navigate(g.items[0].route)}><PrimaryIcon group={g.id}/>{g.label}{g.id===active&&<i/>}</button>{g.id===active&&g.id!=='today'&&<div className="premium-rail-links">{g.items.map(i=><button key={i.route} className={isCurrent(i.route)?'current':''} aria-current={isCurrent(i.route)?'page':undefined} onClick={()=>navigate(i.route)}>{i.label}</button>)}</div>}</section>)}
    {essential&&<button className="rail-mode-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Volver a lo esencial':'Ver todas las secciones'}</button>}
    {(!essential||expanded)&&<details className="premium-rail-tools"><summary><Settings2 size={17}/> Otros controles <ChevronDown size={14}/></summary>{tools.map(t=><button key={t.route} aria-current={currentTab===t.route?'page':undefined} onClick={()=>navigate(t.route)}>{t.label}</button>)}</details>}
    {favorites.length>0&&<span className="premium-rail-hint">Tus favoritos siguen disponibles en Hoy.</span>}
   </div><div className="rail-footer">{isMaster&&<button onClick={()=>navigate('master')}><ShieldCheck size={18}/> Panel master</button>}<button onClick={onAppearance}><Palette size={18}/> Personalizar</button><button onClick={()=>window.dispatchEvent(new CustomEvent('nh:install-help'))}><Download size={18}/> Instalar app</button><small>Un espacio para avanzar.</small></div>
  </aside>
  <nav className="premium-mobile-nav" aria-label="Navegación principal">{groups.map(g=><button key={g.id} className={g.id===active?'active':''} aria-label={g.label} aria-current={g.id===active?'page':undefined} aria-haspopup={g.id==='today'?undefined:'dialog'} onClick={()=>g.id==='today'?navigate('inicio'):setMenu(g.id)}><PrimaryIcon group={g.id}/><span>{g.short}</span></button>)}</nav>
  {Object.values(access).includes('edit')&&<button className="premium-mobile-quick" aria-label="Agregar rápido" onClick={()=>window.dispatchEvent(new CustomEvent('nh:quick-add'))}><Plus size={20}/><span>Registrar</span></button>}
  {selected&&<div className="workspace-navigation-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMenu(null)}}><section ref={panel} className="workspace-navigation-sheet" role="dialog" aria-modal="true" aria-labelledby="workspace-navigation-title"><div><h2 id="workspace-navigation-title">{selected.label}</h2><button aria-label="Cerrar navegación" onClick={()=>setMenu(null)}><X size={20}/></button></div>{selected.items.map(i=><button key={i.route} aria-current={isCurrent(i.route)?'page':undefined} onClick={()=>navigate(i.route)}>{i.label}<ChevronDown size={16}/></button>)}<p>Todos tus controles, en su lugar.</p></section></div>}
 </>;
}

function PrimaryIcon({group}:{group:WorkspaceGroup}){const Icon=primaryIcons[group];return <Icon size={21} strokeWidth={1.7} aria-hidden="true"/>}
