import {useEffect,useRef,useState} from 'react';
import {ChartNoAxesCombined,CalendarRange,ChevronDown,ChevronRight,House,UsersRound,WalletCards,Download,Plus,Settings,Settings2,ShieldCheck,X} from 'lucide-react';
import BrandMark from './BrandMark';
import ProfileAvatar from './ProfileAvatar';
import {permittedWorkspaceGroups,workspaceGroup,type WorkspaceGroup} from './lib/workspaceNavigation';
import {useFocusTrap} from './lib/useFocusTrap';

const primaryIcons={today:House,money:WalletCards,plan:CalendarRange,progress:ChartNoAxesCombined,home:UsersRound};

/** Desktop sidebar, mobile bottom navigation with its section sheet, and the mobile "Registrar" action. */
export default function DesktopRail({currentTab,access,isMaster,onNavigate,onAppearance,essential=false,favorites=[],shared=false}:{currentTab:string;access:Record<string,string>;isMaster:boolean;onNavigate:(tab:string)=>void;onAppearance:()=>void;essential?:boolean;favorites?:string[];shared?:boolean}){
 const [section,setSection]=useState(()=>new URLSearchParams(location.search).get('finance'));
 const [menu,setMenu]=useState<WorkspaceGroup|null>(null),[expanded,setExpanded]=useState(false);
 const panel=useRef<HTMLElement>(null);useFocusTrap(panel,menu!==null,()=>setMenu(null));
 useEffect(()=>{const update=()=>setSection(new URLSearchParams(location.search).get('finance'));window.addEventListener('popstate',update);window.addEventListener('nh:finance-section',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('nh:finance-section',update)}},[]);
 useEffect(()=>{if(!menu)return;document.body.classList.add('workspace-navigation-open');return()=>document.body.classList.remove('workspace-navigation-open')},[menu]);
 const groups=permittedWorkspaceGroups(access,{essential:essential&&!expanded,favorites:[...favorites,currentTab],shared}),active=workspaceGroup(currentTab,section),selected=groups.find(g=>g.id===menu);
 const tools=[{route:'automatizaciones',label:'Automatizaciones',module:'automations'},{route:'respaldos',label:'Respaldos',module:'backups'},{route:'diagnostico',label:'Diagnóstico',module:'diagnostics'}].filter(t=>access[t.module]!=='none');
 const canRegister=Object.values(access).includes('edit');
 function navigate(route:string){setMenu(null);onNavigate(route)}
 const dockButton=(g:typeof groups[number])=><button type="button" key={g.id} className={g.id===active?'active':''} aria-label={g.label} aria-current={g.id===active?'page':undefined} aria-haspopup={g.id==='today'?undefined:'dialog'} onClick={()=>g.id==='today'?navigate('inicio'):setMenu(g.id)}><PrimaryIcon group={g.id}/><span>{g.short}</span></button>;
 const isCurrent=(route:string)=>route===(currentTab==='presupuesto'?'presupuesto:'+(section||'summary'):currentTab);
 return <>
  <aside className="desktop-rail app-rail" aria-label="Navegación de escritorio">
   <a className="rail-brand" href={import.meta.env.BASE_URL} onClick={e=>{e.preventDefault();navigate('inicio')}}><BrandMark size={34}/><strong>Nuestro Hogar</strong></a>
   <div role="navigation" aria-label="Espacios principales" className="rail-nav">
    {groups.map(g=><section key={g.id}>
     <button type="button" className={'rail-item'+(g.id===active?' active':'')} aria-current={g.id===active&&(g.id==='today'||isCurrent(g.items[0].route))?'page':undefined} onClick={()=>navigate(g.items[0].route)}><PrimaryIcon group={g.id}/><span>{g.label}</span></button>
     {g.id===active&&g.id!=='today'&&<div className="rail-sublinks">{g.items.map(i=><button type="button" key={i.route} className={isCurrent(i.route)?'current':''} aria-current={isCurrent(i.route)?'page':undefined} onClick={()=>navigate(i.route)}>{i.label}</button>)}</div>}
    </section>)}
    {essential&&<button type="button" className="rail-mode-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Volver a lo esencial':'Ver todas las secciones'}</button>}
    {(!essential||expanded)&&tools.length>0&&<details className="rail-tools"><summary><Settings2 size={17} aria-hidden="true"/> Otros controles <ChevronDown size={14} aria-hidden="true"/></summary>{tools.map(t=><button type="button" key={t.route} aria-current={currentTab===t.route?'page':undefined} onClick={()=>navigate(t.route)}>{t.label}</button>)}</details>}
   </div>
   <div className="rail-footer">
    {isMaster&&<button type="button" className="rail-item" onClick={()=>navigate('master')}><ShieldCheck size={20} aria-hidden="true"/><span>Panel master</span></button>}
    <button type="button" className="rail-item" onClick={onAppearance}><Settings size={20} aria-hidden="true"/><span>Configuración</span></button>
    <button type="button" className="rail-item rail-item--quiet" onClick={()=>window.dispatchEvent(new CustomEvent('nh:install-help'))}><Download size={18} aria-hidden="true"/><span>Instalar app</span></button>
    <ProfileAvatar variant="chip" onClick={()=>navigate('familia')}/>
   </div>
  </aside>
  {/* Mobile dock: the register action sits in the middle of the bar, always within thumb reach, never over content. */}
  <nav className="mobile-nav" aria-label="Navegación principal" style={{'--nh-dock-columns':groups.length+(canRegister?1:0)} as React.CSSProperties}>{[...groups.slice(0,Math.floor(groups.length/2)).map(dockButton),
   ...(canRegister?[<button type="button" key="register" className="mobile-nav-register" aria-label="Registrar un movimiento o actividad" onClick={()=>window.dispatchEvent(new CustomEvent('nh:quick-add'))}><span className="mobile-nav-register-icon"><Plus size={24} strokeWidth={2.4} aria-hidden="true"/></span><span>Registrar</span></button>]:[]),
   ...groups.slice(Math.floor(groups.length/2)).map(dockButton)]}</nav>
  {selected&&<div className="workspace-navigation-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMenu(null)}}><section ref={panel} className="workspace-navigation-sheet" role="dialog" aria-modal="true" aria-labelledby="workspace-navigation-title"><div><h2 id="workspace-navigation-title">{selected.label}</h2><button type="button" aria-label="Cerrar navegación" onClick={()=>setMenu(null)}><X size={20}/></button></div>{selected.items.map(i=><button type="button" key={i.route} aria-current={isCurrent(i.route)?'page':undefined} onClick={()=>navigate(i.route)}>{i.label}<ChevronRight size={16} aria-hidden="true"/></button>)}{essential?<button type="button" className="workspace-navigation-more" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Volver a lo esencial':'Ver todas las secciones'}</button>:<p>Todos tus controles, en su lugar.</p>}</section></div>}
 </>;
}

function PrimaryIcon({group}:{group:WorkspaceGroup}){const Icon=primaryIcons[group];return <Icon size={21} strokeWidth={1.8} aria-hidden="true"/>}
