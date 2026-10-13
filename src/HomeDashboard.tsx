import {CalendarDays,ChevronRight,Clock3,Home,ListChecks,Target,TrendingUp,WalletCards} from 'lucide-react';

type EventRow={id:string;title:string;event_date:string;start_time:string|null};
type FinanceHome={income:number;expense:number;saving:number;available:number;pending:number;projected:number;overdue:number;nextPayment:string|null;nextPaymentAmount:number;nextPaymentDate:string|null;goalName:string|null;goalProgress:number};

const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);

export default function HomeDashboard({finance,events,listCount,onNavigate}:{finance:FinanceHome;events:EventRow[];listCount:number;onNavigate:(tab:string)=>void}){
 const nextEvent=events[0];
 const paymentDate=finance.nextPaymentDate?new Date(finance.nextPaymentDate+'T12:00').toLocaleDateString('es-GT',{day:'numeric',month:'short'}):null;
 const hasFinance=finance.income||finance.expense||finance.saving||finance.pending;
 return <section className="home-dashboard">
  <section className={'hero smart-home-hero '+(finance.projected<0?'risk':'')}>
   <div><p className="eyebrow">CIERRE ESTIMADO DEL MES</p><h2>{hasFinance?money(finance.projected):'Todo bajo control'}</h2><p>{hasFinance?'Después de compromisos, ahorro y presupuesto pendiente.':'Empieza agregando finanzas, listas y eventos.'}</p></div>
   <div className="hero-icon"><TrendingUp/></div>
  </section>

  <div className="home-snapshot">
   <button onClick={()=>onNavigate('presupuesto')}><span className="home-snapshot-icon money"><WalletCards/></span><div><small>Disponible hoy</small><strong>{money(finance.available)}</strong><em>{finance.pending?money(finance.pending)+' comprometidos':'Sin compromisos pendientes'}</em></div><ChevronRight/></button>
   <button onClick={()=>onNavigate('presupuesto')}><span className="home-snapshot-icon due"><Clock3/></span><div><small>Próximo pago</small><strong>{finance.nextPayment||'Sin pendientes'}</strong><em>{finance.nextPayment?money(finance.nextPaymentAmount)+(paymentDate?' · '+paymentDate:''):'Todo al día'}</em></div><ChevronRight/></button>
   <button onClick={()=>onNavigate('presupuesto')}><span className="home-snapshot-icon goal"><Target/></span><div><small>Meta principal</small><strong>{finance.goalName||'Sin meta creada'}</strong><em>{finance.goalName?finance.goalProgress+'% completado':'Crea una meta de ahorro'}</em></div><ChevronRight/></button>
  </div>

  {finance.overdue>0&&<button className="home-alert" onClick={()=>onNavigate('presupuesto')}><Clock3/><span><strong>{finance.overdue} pago{finance.overdue===1?'':'s'} vencido{finance.overdue===1?'':'s'}</strong><small>Revisa Finanzas → Recurrentes.</small></span><ChevronRight/></button>}

  <div className="home-columns">
   <div className="home-panel">
    <div className="home-panel-head"><div><p className="eyebrow">AGENDA</p><h3>Lo próximo</h3></div><button onClick={()=>onNavigate('calendario')}>Calendario <ChevronRight/></button></div>
    {nextEvent?<div className="home-next-event"><span><strong>{new Date(nextEvent.event_date+'T12:00').getDate()}</strong><small>{new Date(nextEvent.event_date+'T12:00').toLocaleDateString('es-GT',{month:'short'})}</small></span><div><strong>{nextEvent.title}</strong><small>{nextEvent.start_time?.slice(0,5)||'Todo el día'}</small></div></div>:<div className="home-empty">No hay eventos próximos.</div>}
   </div>

   <div className="home-panel">
    <div className="home-panel-head"><div><p className="eyebrow">PENDIENTES</p><h3>Listas compartidas</h3></div><button onClick={()=>onNavigate('listas')}>Abrir <ChevronRight/></button></div>
    <button className="home-list-summary" onClick={()=>onNavigate('listas')}><span><ListChecks/></span><div><strong>{listCount} lista{listCount===1?'':'s'}</strong><small>Compras, tareas y pendientes del hogar.</small></div><ChevronRight/></button>
   </div>
  </div>

  <div className="section-title"><h3>Tu hogar</h3></div>
  <section className="grid home-module-grid">
   <button className="module" onClick={()=>onNavigate('listas')}><div><strong>Listas</strong><span>Compras y pendientes</span></div><span className="ico list"><ListChecks/></span></button>
   <button className="module" onClick={()=>onNavigate('calendario')}><div><strong>Calendario</strong><span>{nextEvent?'Próximo: '+nextEvent.title:'Sin eventos próximos'}</span></div><span className="ico calendar"><CalendarDays/></span></button>
   <button className="module" onClick={()=>onNavigate('presupuesto')}><div><strong>Finanzas</strong><span>{hasFinance?money(finance.projected)+' al cierre':'Organiza el presupuesto'}</span></div><span className="ico budget"><WalletCards/></span></button>
   <button className="module" onClick={()=>onNavigate('familia')}><div><strong>Mi familia</strong><span>Hogar compartido</span></div><span className="ico family"><Home/></span></button>
  </section>
 </section>
}
