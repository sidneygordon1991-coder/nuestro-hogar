import {AlertTriangle,Car,GraduationCap,HeartPulse,House,PawPrint,PiggyBank,Plane,Plug,ReceiptText,ShoppingBasket,Shirt,Utensils,Wallet,type LucideIcon} from 'lucide-react';
import {budgetPercent,budgetProgress} from './lib/budgetProgress';
import {formatMoney as money} from './lib/money';
import './budget-progress.css';

const icons:Record<string,LucideIcon>={food:ShoppingBasket,shopping:ShoppingBasket,cart:ShoppingBasket,home:House,house:House,transport:Car,car:Car,health:HeartPulse,medical:HeartPulse,education:GraduationCap,school:GraduationCap,travel:Plane,plane:Plane,pet:PawPrint,pets:PawPrint,saving:PiggyBank,savings:PiggyBank,'piggy-bank':PiggyBank,utilities:Plug,bills:ReceiptText,clothing:Shirt,restaurant:Utensils};
export function categoryIcon(name:string,icon?:string):LucideIcon{
 if(icon&&icons[icon])return icons[icon];
 const text=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const byName:[RegExp,LucideIcon][]=[[/ahorro|reserva|emergencia/,PiggyBank],[/alimenta|supermerc|comida|despensa/,ShoppingBasket],[/restaura|comer fuera/,Utensils],[/casa|hogar|vivienda|alquiler/,House],[/transporte|combustible|gasolina|vehiculo/,Car],[/salud|medic|farmacia/,HeartPulse],[/educa|colegio|escuela/,GraduationCap],[/viaje|vacacion/,Plane],[/mascota/,PawPrint],[/servicio|luz|agua|internet/,Plug],[/ropa|vestuario/,Shirt]];
 return byName.find(([pattern])=>pattern.test(text))?.[1]||Wallet;
}

type Props={name:string;icon?:string;planned:number;spent:number;unavailable?:boolean;saving?:boolean;pending?:boolean;savings?:{linked:number;net:number}|null};
export default function BudgetCategoryProgress({name,icon,planned,spent,unavailable=false,saving=false,pending=false,savings}:Props){
 const data=unavailable?null:budgetProgress(planned,spent),Icon=saving?PiggyBank:categoryIcon(name,icon);
 const state=saving?'saving':data?.state||'unavailable';
 const status=!data?'No se pudo verificar este presupuesto.':saving?'Aportes registrados en Metas; sin asignación a este rubro.':data.state==='unplanned'?(data.spent>0?'Gasto sin presupuesto asignado':'Asigna un presupuesto para ver tu disponible.'):data.excess>0?`Excedido por ${money(data.excess)}`:data.state==='reached'?'Llegaste al límite de este rubro.':data.state==='near'?'Te acercas al límite de este rubro.':'';
 const available=data?.availablePercent==null?null:budgetPercent(data.availablePercent);
 return <section className={'budget-rubric '+state} aria-label={'Presupuesto de '+name}>
  <div className="budget-rubric-heading"><span className="budget-rubric-icon"><Icon size={22} aria-hidden="true"/></span><div><h4>{name}</h4><small>{saving?'Objetivo mensual guardado':'Presupuesto guardado'}{pending?' · Cambios sin guardar':''}</small></div></div>
  {!data?<p className="budget-rubric-note" role="status">{status}</p>:saving?<><strong className="budget-rubric-target">{money(data.planned)}</strong>{savings&&savings.linked>0?<><p className="budget-rubric-note">{money(savings.net)} aportados netos · {savings.linked} meta{savings.linked===1?'':'s'} vinculada{savings.linked===1?'':'s'}</p>{data.planned>0&&<div className="saving-rubric-track" role="progressbar" aria-label={'Avance de ahorro de '+name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,savings.net/data.planned*100))} aria-valuetext={money(savings.net)+' netos de '+money(data.planned)}><span style={{width:Math.min(100,Math.max(0,savings.net/data.planned*100))+'%'}}/></div>}<p className="budget-rubric-note">{data.planned>0?(savings.net>=data.planned?'Objetivo mensual cubierto':money(Math.max(0,Math.round(data.planned*100)-Math.round(savings.net*100))/100)+' por aportar para cubrir el objetivo'):'Define un objetivo para comparar el avance.'}{savings.net<0?' Este mes hay más retiros que depósitos.':''}</p></>:<p className="budget-rubric-note">{savings===null?'Vínculos de ahorro pendientes de verificar.':status}</p>}</>:<>
   <div className="budget-rubric-amounts"><div><strong>{available===null?'—':money(data.remaining)}</strong><span>{available===null?'Disponible sin definir':`${available} disponible`}</span></div><p><b>{money(data.spent)}</b> gastados de <b>{money(data.planned)}</b></p></div>
   {data.usedPercent!==null&&<div className="budget-rubric-track" role="progressbar" aria-label={'Presupuesto utilizado de '+name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.fill} aria-valuetext={`${budgetPercent(data.usedPercent)} utilizado; ${available} disponible, ${money(data.remaining)}${data.excess>0?`; excedido por ${money(data.excess)}`:''}`}><span style={{width:data.fill+'%'}}/></div>}
   <div className="budget-rubric-footer">{data.usedPercent!==null&&<span>{budgetPercent(data.usedPercent)} utilizado</span>}{status&&<p>{['near','reached','exceeded'].includes(data.state)&&<AlertTriangle size={14} aria-hidden="true"/>}{status}</p>}</div>
  </>}
 </section>;
}
