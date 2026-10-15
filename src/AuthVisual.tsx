import {CalendarDays,Check,LockKeyhole,Sparkles,Wallet} from 'lucide-react';
import ModuleIcon from './ModuleIcon';

export default function AuthVisual(){
 return <section className="auth-story" aria-label="Nuestro Hogar, tu vida en equilibrio">
  <a className="auth-wordmark" href={import.meta.env.BASE_URL}><span><ModuleIcon name="home" size={29}/></span><strong>Nuestro Hogar<small>LA VIDA, EN CASA</small></strong></a>
  <div className="auth-story-copy"><p className="auth-badge"><Sparkles size={14}/> Tu espacio para vivir mejor</p><h2>Menos pendientes.<br/><em>Más vida.</em></h2><p>Finanzas claras, planes compartidos y espacio para lo que de verdad importa.</p></div>
  <div className="auth-scene" aria-hidden="true">
   <div className="auth-orbit auth-orbit-one"/><div className="auth-orbit auth-orbit-two"/>
   <svg className="auth-connections" viewBox="0 0 480 290" fill="none"><path d="M38 180 240 70l202 110-202 110zM85 180l155-85 155 85-155 85zM133 180l107-58 107 58-107 58z"/><path d="M240 70v220M38 180h404" strokeDasharray="3 7"/><circle cx="240" cy="180" r="80"/><circle cx="240" cy="180" r="113" strokeDasharray="2 9"/></svg>
   <div className="auth-home-core"><ModuleIcon name="home" size={72}/><span>Tu centro de conexión</span><i/></div>
   <div className="auth-mini auth-mini-finance"><span className="auth-mini-icon"><Wallet size={21}/></span><div><small>TU TRANQUILIDAD</small><strong>Finanzas con claridad</strong><span className="auth-mini-check"><Check size={13}/> Cada cuenta, en su lugar</span></div></div>
   <div className="auth-mini auth-mini-plans"><span className="auth-mini-icon"><CalendarDays size={21}/></span><div><small>LO QUE IMPORTA</small><strong>Tiempo para ustedes</strong><span className="auth-mini-check"><Check size={13}/> Conecten sus planes</span></div></div>
   <span className="auth-scene-label">UN HOGAR. TODO CONECTADO.</span>
  </div>
  <div className="auth-story-footer"><LockKeyhole size={15}/><span>Un espacio privado para cada familia</span></div>
 </section>;
}
