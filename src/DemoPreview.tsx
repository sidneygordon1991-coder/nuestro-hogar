import {useEffect,useMemo,useRef} from 'react';
import {Sparkles,X} from 'lucide-react';
import HomeMoneyWorkspace from './HomeMoneyWorkspace';
import {demoHome,demoMembers,DEMO_ME} from './lib/demoData';

const localToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};

/** "Ver un ejemplo": the real Inicio rendered with a fictitious household, entirely in the browser. */
export default function DemoPreview({onClose,onStart}:{onClose:()=>void;onStart?:()=>void}){
 const demo=useMemo(()=>demoHome(localToday()),[]);
 const dialog=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 // The example is look-only: inert removes it from focus and clicks (React 18 has no inert prop).
 useEffect(()=>{canvas.current?.setAttribute('inert','')},[]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current()};window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('keydown',key);previous?.focus?.()}},[]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div ref={dialog} className="finance-modal demo-preview" role="dialog" aria-modal="true" aria-labelledby="demo-preview-title">
   <div className="modal-head"><div><p className="eyebrow">EJEMPLO</p><h3 id="demo-preview-title">Así se verá tu Inicio</h3></div><button type="button" aria-label="Cerrar ejemplo" onClick={onClose}><X/></button></div>
   <p className="demo-preview-note"><Sparkles size={16} aria-hidden="true"/> Datos ficticios de un hogar de dos personas. Nada de esto se guarda; tus cifras aparecerán cuando registres tus cuentas, ingresos y presupuesto.</p>
   <div ref={canvas} className="demo-preview-canvas">
    <HomeMoneyWorkspace householdId="demo" userId={DEMO_ME} scope="household" shared members={demoMembers} canEdit={false} demoAccounts={demo.accounts}
     finance={demo.finance} onNavigate={()=>undefined} onRefresh={()=>undefined} agenda={null} today={{notifications:[],overdue:[],agendaError:'',onOpenNotification:()=>undefined}} canHealth cover=""/>
   </div>
   <div className="demo-preview-actions"><button type="button" className="finance-primary" onClick={()=>{onClose();onStart?.()}}>Configurar mi hogar</button><button type="button" className="home-link" onClick={onClose}>Seguir explorando</button></div>
  </div>
 </div>;
}
