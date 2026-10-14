import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowLeft,Check,Mail,MailCheck,Moon,ShieldCheck,Sun} from 'lucide-react';
import AuthVisual from './AuthVisual';
import ModuleIcon from './ModuleIcon';
import {toggleTheme,useEffectiveTheme} from './AppMenu';
import {supabase} from './lib/supabase';
import {authCallbackError,emailAuthMessage,EMAIL_RESEND_DELAY} from './lib/emailAuth';

type Mode='email'|'password'|'reset';
export default function EmailAuth(){
 const [mode,setMode]=useState<Mode>('email'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(()=>authCallbackError(window.location.hash));
 const [sentTo,setSentTo]=useState(''),[resetRequested,setResetRequested]=useState(false),[retryAt,setRetryAt]=useState(0),[seconds,setSeconds]=useState(0);
 const theme=useEffectiveTheme();
 useEffect(()=>{if(authCallbackError(window.location.hash))window.history.replaceState({},'',window.location.pathname+window.location.search)},[]);
 useEffect(()=>{const tick=()=>setSeconds(Math.max(0,Math.ceil((retryAt-Date.now())/1000)));tick();if(!retryAt)return;const id=window.setInterval(tick,1000);return()=>window.clearInterval(id)},[retryAt]);
 function changeMode(next:Mode){if(busy)return;setMode(next);setError('');setResetRequested(false)}
 function redirect(){return window.location.origin+import.meta.env.BASE_URL}
 async function sendLink(address:string){
  if(busy||seconds>0)return;setBusy(true);setError('');
  try{const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:redirect(),shouldCreateUser:true}});if(error)throw error;setSentTo(address);setRetryAt(Date.now()+EMAIL_RESEND_DELAY*1000)}
  catch(err){setError(emailAuthMessage(err))}finally{setBusy(false)}
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget),address=email.trim().toLowerCase();setEmail(address);
  if(mode==='email'){await sendLink(address);return}
  setBusy(true);setError('');try{
   if(mode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(address,{redirectTo:redirect()});if(error)throw error;setResetRequested(true)}
   else{const {error}=await supabase.auth.signInWithPassword({email:address,password:String(form.get('password')||'')});if(error)throw error}
  }catch(err){setError(emailAuthMessage(err))}finally{setBusy(false)}
 }
 const sent=mode==='email'&&Boolean(sentTo);
 return <main className="auth auth-premium auth-email"><div className="auth-layout"><AuthVisual/><div className="auth-entry"><button type="button" className="auth-theme-toggle" onClick={toggleTheme} aria-label={theme==='dark'?'Activar tema claro':'Activar tema oscuro'}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><section className="auth-card"><p className="eyebrow">TU VIDA, MEJOR ORGANIZADA</p>
  <h1>{sent?'Revisa tu correo':mode==='reset'?'Recupera tu acceso':mode==='password'?'Entra con tu contraseña':'Bienvenido a casa'}</h1>
  <p className="muted">{sent?'Abre el enlace de acceso que solicitaste para verificar tu correo y entrar.':mode==='reset'?'Solicita un enlace para cambiar la contraseña de tu cuenta actual.':mode==='password'?'Utiliza la contraseña que ya tienes para este mismo correo.':'Escribe tu correo y recibe un enlace seguro para entrar. Sin crear una contraseña.'}</p>
  {sent?<div className="email-confirmation"><span className="email-confirmation-icon"><MailCheck size={31}/></span><p>Solicitud enviada a</p><strong>{sentTo}</strong><ol><li>Abre tu correo y revisa también Spam.</li><li>Pulsa el enlace de acceso más reciente.</li><li>Regresa a Nuestro Hogar para continuar.</li></ol><p className="email-confirmation-note"><ShieldCheck size={16}/> El enlace es de un solo uso. Si vence, solicita otro.</p><button className="email-resend" type="button" disabled={busy||seconds>0} onClick={()=>sendLink(sentTo)}>{busy?'Solicitando…':seconds>0?'Reenviar en '+seconds+' s':'Reenviar enlace de acceso'}</button><button type="button" className="link email-change" disabled={busy} onClick={()=>{setSentTo('');setError('')}}><ArrowLeft size={14}/> Cambiar correo</button></div>:<form onSubmit={submit}>
   <label>Correo electrónico<input name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com" required disabled={busy}/></label>
   {mode==='password'&&<label>Contraseña<input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required disabled={busy}/></label>}
   <button disabled={busy||(mode==='email'&&seconds>0)}>{busy?'Procesando…':mode==='email'?(seconds>0?'Solicitar de nuevo en '+seconds+' s':'Enviar enlace de acceso'):mode==='password'?'Entrar':'Enviar enlace de recuperación'}{!busy&&<ArrowRight size={18}/>}</button>
  </form>}
  {mode==='email'&&!sent&&<div className="email-first-time"><span><Check size={14}/></span><p>¿Primera vez? Verifica tu correo para activar tu cuenta. Luego podrás crear tu hogar o unirte con una invitación.</p></div>}
  {error&&<p className="email-auth-error" role="alert">{error}</p>}
  {resetRequested&&mode==='reset'&&<p className="email-reset-status" role="status">Si el correo corresponde a una cuenta, recibirás las instrucciones para cambiar tu contraseña. Revisa también Spam.</p>}
  {mode==='password'&&<button className="link" type="button" disabled={busy} onClick={()=>changeMode('reset')}>¿Olvidaste tu contraseña?</button>}
  <div className="auth-switch">{mode==='email'?<button className="link" type="button" disabled={busy} onClick={()=>changeMode('password')}>Ya tengo contraseña · usarla</button>:<button className="link" type="button" disabled={busy} onClick={()=>{changeMode('email');setSentTo('')}}><Mail size={14}/> Entrar con un enlace al correo</button>}</div>
  <p className="auth-private-note"><ModuleIcon name="family" size={18}/> Cada familia tiene su propio espacio.</p>
 </section><p className="auth-entry-footer">Nuestro Hogar · Conecta lo que importa</p></div></div></main>;
}
