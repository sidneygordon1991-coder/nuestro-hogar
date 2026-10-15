import {useId} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {toCents} from './lib/financePeriods';
const money=(n:number)=>new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ',maximumFractionDigits:0}).format(n);
// This graphic shows recorded flows, never predicted income or bank balances.
export default function BalanceFlow({income,expense,saving,onOpen}:{income:number;expense:number;saving:number;onOpen?:()=>void}){
 const id=useId(),received=Math.max(0,toCents(income)),spent=Math.max(0,toCents(expense)),saved=Math.max(0,toCents(saving)),used=spent+saved,remaining=Math.max(0,received-used),total=Math.max(received,used,1);
 const rows=[{key:'spent',label:'Gastos',value:spent},{key:'saved',label:'Ahorro',value:saved},{key:'remaining',label:'Margen',value:remaining}];
 return <div className="balance-flow" aria-labelledby={id}>
  <div className="balance-flow-head"><span id={id}>Destino de tus ingresos</span>{onOpen&&<button type="button" onClick={onOpen} aria-label="Ver movimientos del mes"><ArrowUpRight size={16}/></button>}</div>
  <div className="balance-flow-track" role="img" aria-label={received||used?rows.map(r=>r.label+': '+money(r.value/100)).join('. '):'Sin movimientos registrados'}>{rows.map(r=><span key={r.key} className={r.key} style={{width:(r.value/total*100)+'%'}}/>)}</div>
  <div className="balance-flow-legend">{rows.map(r=><div key={r.key}><small><i className={r.key}/>{r.label}</small><strong>{money(r.value/100)}</strong></div>)}</div>
  <p>{used>received?'Los gastos y el ahorro registrados superan los ingresos en '+money((used-received)/100)+'.':received?'Distribución de los ingresos registrados este mes.':'Tu distribución aparecerá al registrar movimientos.'}</p>
 </div>;
}
