import {maskAmountsIn} from './lib/money';
import {AlertTriangle,Bell,CalendarClock,CheckCircle2,ChevronRight,Clock3,CreditCard,FileText,Landmark,Package,PartyPopper,Target} from 'lucide-react';
import type {ReactNode} from 'react';
import ModuleIcon from './ModuleIcon';
import type {HomeAction} from './lib/homeOverview';
import type {DailyAgendaItem} from './lib/dailyAgenda';

export type Attention={id:string;type:string;severity:'info'|'warning'|'danger'|'success';title:string;body:string|null;action_tab:string|null;created_at:string};

type Row={key:string;tone:'accent'|'neutral'|'warning'|'danger'|'success';icon:ReactNode;title:string;detail:string;onClick:()=>void};

/**
 * "Lo importante hoy": urgent notifications first, then concrete next steps derived from the
 * household's own records (reconcile, categorize, prepare the next payment) and overdue activities.
 */
export default function HomeToday({notifications,actions,overdue,agendaError,onOpenNotification,onNavigate,limit=3}:{
 notifications:Attention[];actions:HomeAction[];overdue:DailyAgendaItem[];agendaError:string;
 onOpenNotification:(item:Attention)=>void;onNavigate:(tab:string)=>void;limit?:number;
}){
 const hasPaymentNotice=notifications.some(n=>n.type==='payment');
 const rows:Row[]=[
  ...notifications.map(item=>({key:'n-'+item.id,tone:item.severity==='danger'?'danger' as const:'warning' as const,icon:attentionIcon(item.type),title:item.title,detail:item.body||'Revisa este aviso',onClick:()=>onOpenNotification(item)})),
  ...actions.filter(a=>!(a.kind==='payment'&&hasPaymentNotice)).map(action=>({key:'a-'+action.id,tone:action.kind==='reconcile'||action.kind==='recap'?'accent' as const:action.kind==='review'?'neutral' as const:'warning' as const,
   icon:action.kind==='reconcile'?<Landmark/>:action.kind==='review'?<FileText/>:action.kind==='card'?<CreditCard/>:action.kind==='recap'?<PartyPopper/>:<CalendarClock/>,title:action.title,detail:action.detail,onClick:()=>onNavigate(action.route)})),
  ...overdue.map(item=>({key:'o-'+item.id,tone:'warning' as const,icon:<Clock3/>,title:item.title,detail:'Pendiente de días anteriores',onClick:()=>onNavigate(item.tab)}))
 ];
 const visible=rows.slice(0,limit);
 return <section className="home-card home-today" aria-labelledby="home-today-title">
  <div className="home-card-head">
   <h3 id="home-today-title"><span className="home-today-title-desktop">Lo importante hoy</span><span className="home-today-title-mobile">Acción para hoy</span></h3>
   {rows.length>limit&&<button type="button" className="home-link" onClick={()=>window.dispatchEvent(new CustomEvent('nh:notifications'))}>Ver todo</button>}
  </div>
  {visible.length?<ul className="home-today-list">{visible.map(row=><li key={row.key}><button type="button" onClick={row.onClick}>
   <span className={'home-tile home-tile--'+row.tone} aria-hidden="true">{row.icon}</span>
   <span className="home-today-copy"><strong>{maskAmountsIn(row.title)}</strong><small>{maskAmountsIn(row.detail)}</small></span>
   <ChevronRight className="home-row-chevron" size={18} aria-hidden="true"/>
  </button></li>)}</ul>
  :<div className="home-today-empty"><span className="home-tile home-tile--success" aria-hidden="true"><CheckCircle2/></span><div><strong>{agendaError?'Hay actividades por verificar':'Todo en orden por hoy'}</strong><small>{agendaError||'No hay pagos vencidos ni avisos urgentes.'}</small></div></div>}
 </section>;
}

function attentionIcon(type:string){
 if(type==='payment')return <CalendarClock/>;
 if(type==='task')return <ModuleIcon name="lists"/>;
 if(type==='event')return <ModuleIcon name="calendar"/>;
 if(type==='birthday')return <ModuleIcon name="family"/>;
 if(type==='budget')return <AlertTriangle/>;
 if(type==='goal')return <Target/>;
 if(type==='document')return <ModuleIcon name="documents"/>;
 if(type==='maintenance')return <ModuleIcon name="maintenance"/>;
 if(type==='pantry')return <Package/>;
 if(type==='planning')return <ModuleIcon name="planning"/>;
 return <Bell/>;
}
