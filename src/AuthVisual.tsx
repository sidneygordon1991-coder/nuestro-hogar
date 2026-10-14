import {ArrowUpRight,Check,LockKeyhole,Sparkles} from 'lucide-react';
import ModuleIcon from './ModuleIcon';

export default function AuthVisual(){
 return <section className="auth-story" aria-label="Nuestro Hogar, tu vida en equilibrio">
  <a className="auth-wordmark" href={import.meta.env.BASE_URL}><span><ModuleIcon name="home" size={29}/></span><strong>Nuestro Hogar<small>UN ESPACIO PARA LOS TUYOS</small></strong></a>
  <div className="auth-story-copy"><p className="auth-badge"><Sparkles size={14}/> Menos pendientes. Más vida.</p><h2>Todo tu hogar.<br/><em>En armonía.</em></h2><p>Conecta los planes, las finanzas y los pequeños detalles que hacen grande tu vida en familia.</p></div>
  <div className="auth-scene" aria-hidden="true">
   <div className="auth-orbit auth-orbit-one"/><div className="auth-orbit auth-orbit-two"/>
   <svg className="auth-connections" viewBox="0 0 480 290" fill="none"><path d="M80 70h100l60 80h115M80 230h110l50-80V35"/><circle cx="80" cy="70" r="4"/><circle cx="80" cy="230" r="4"/><circle cx="355" cy="150" r="4"/></svg>
   <div className="auth-home-core"><ModuleIcon name="home" size={66}/><span>Tu hogar, conectado</span></div>
   <div className="auth-mini auth-mini-finance"><span className="auth-mini-icon"><ModuleIcon name="finance" size={23}/></span><div><small>FINANZAS EN ORDEN</small><strong>Más claridad<ArrowUpRight size={16}/></strong><div className="auth-spark-bars">{[35,58,46,72,61,84,100].map((h,i)=><i key={i} style={{height:h+'%'}}/>)}</div></div></div>
   <div className="auth-mini auth-mini-plans"><span className="auth-mini-icon"><ModuleIcon name="calendar" size={23}/></span><div><small>PLANES COMPARTIDOS</small><strong>Tiempo para ustedes</strong><span className="auth-mini-check"><Check size={13}/> Todo en un mismo lugar</span></div></div>
   <span className="auth-scene-label">UNA VISTA DE LO QUE PUEDEN ORGANIZAR</span>
  </div>
  <div className="auth-story-footer"><LockKeyhole size={15}/><span>Un espacio privado para cada familia</span><span className="auth-footer-dot"/><span>Hecho para compartir</span></div>
 </section>;
}
