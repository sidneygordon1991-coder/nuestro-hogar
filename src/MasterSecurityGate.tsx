import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {KeyRound,ShieldCheck} from 'lucide-react';
import {supabase} from './lib/supabase';
import {platformError} from './lib/platform';
export default function MasterSecurityGate({children}:{children:ReactNode}){
 const [ready,setReady]=useState(false),[loading,setLoading]=useState(true),[factor,setFactor]=useState(''),[enrollment,setEnrollment]=useState<{qr:string;secret:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState('');
 useEffect(()=>{let live=true;(async()=>{try{
  const assurance=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.error)throw assurance.error;
  if(assurance.data.currentLevel==='aal2'){if(live)setReady(true);return}
  const factors=await supabase.auth.mfa.listFactors();if(factors.error)throw factors.error;
  if(live)setFactor(factors.data.totp.find(f=>f.status==='verified')?.id||'');
 }catch(err){if(live)setError(platformError(err))}finally{if(live)setLoading(false)}})();return()=>{live=false}},[]);
 async function enroll(){setBusy(true);setError('');try{
  const factors=await supabase.auth.mfa.listFactors();if(factors.error)throw factors.error;
  const verified=factors.data.totp.find(f=>f.status==='verified');if(verified){setFactor(verified.id);return}
  for(const old of factors.data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){const r=await supabase.auth.mfa.unenroll({factorId:old.id});if(r.error)throw r.error}
  const result=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Nuestro Hogar master',issuer:'Nuestro Hogar'});if(result.error)throw result.error;
  setFactor(result.data.id);setEnrollment({qr:result.data.totp.qr_code,secret:result.data.totp.secret});
 }catch(err){setError(platformError(err))}finally{setBusy(false)}}
 async function verify(event:FormEvent){event.preventDefault();if(!factor||!/^\d{6}$/.test(code))return;setBusy(true);setError('');try{
  const result=await supabase.auth.mfa.challengeAndVerify({factorId:factor,code});if(result.error)throw result.error;
  const level=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(level.error)throw level.error;if(level.data.currentLevel!=='aal2')throw new Error('No se pudo verificar la sesión.');
  setEnrollment(null);setCode('');setReady(true);
 }catch(err){setCode('');setError(platformError(err))}finally{setBusy(false)}}
 if(ready)return <>{children}</>;
 return <section className="sharing-security sharing-card"><span className="sharing-icon"><ShieldCheck/></span><p className="eyebrow">PROTECCIÓN MASTER</p><h2>{factor?'Verifica tu acceso':'Activa la doble verificación'}</h2><p>El panel global requiere un código de tu aplicación autenticadora. Tu hogar sigue disponible desde “Volver al hogar”.</p>{loading?<p role="status">Comprobando seguridad…</p>:<>
  {!factor&&<><p>Usa Google Authenticator, Microsoft Authenticator u otra aplicación compatible. Conserva el respaldo de tu autenticador para recuperar el acceso si cambias de teléfono.</p><button className="sharing-primary" disabled={busy} onClick={enroll}><KeyRound/>{busy?'Preparando…':'Configurar autenticador'}</button></>}
  {enrollment&&<div className="sharing-enrollment"><p>Escanea este código desde tu autenticador o introduce la clave manualmente.</p>{enrollment.qr.startsWith('data:image/')&&<img src={enrollment.qr} alt="Código QR para configurar tu autenticador"/>}<details><summary>Mostrar clave de configuración</summary><code>{enrollment.secret}</code></details></div>}
  {factor&&<form onSubmit={verify}><label>Código de seis dígitos<input autoFocus aria-label="Código de autenticador" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} pattern="[0-9]{6}" onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required/></label><button className="sharing-primary" disabled={busy||code.length!==6}>{busy?'Verificando…':'Verificar y abrir panel'}</button></form>}
 </>}{error&&<p className="sharing-error" role="alert">{error}</p>}</section>;
}
