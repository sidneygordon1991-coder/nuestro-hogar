import {useState} from 'react';
import {supabase,googleLoginReady} from './lib/supabase';
import {platformError} from './lib/platform';
export default function GoogleSignIn(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(){setBusy(true);setError('');try{
  if(!await googleLoginReady())throw new Error('Falta activar la conexión con Google. Puedes usar tu cuenta actual mientras el administrador completa la configuración.');
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+import.meta.env.BASE_URL,queryParams:{prompt:'select_account'}}});
  if(error)throw error;
 }catch(err){const message=platformError(err);setError(/provider|enabled|unsupported/i.test(message)?'El ingreso con Google está preparado, pero todavía falta activar la conexión. Puedes usar tu cuenta actual mientras el administrador la configura.':message);setBusy(false)}}
 return <div className="google-signin"><button type="button" disabled={busy} onClick={login}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.6a4.8 4.8 0 0 1-2.1 3.2v2.6H19c2-1.8 3-4.4 3-7.7Z"/><path fill="#34a853" d="M12 22c2.8 0 5.1-.9 7-2.5l-3.5-2.6c-.9.6-2.1.9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10.5 10.5 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.2 13.5a6.3 6.3 0 0 1 0-3V7.8H2.7a10.4 10.4 0 0 0 0 8.4l3.5-2.7Z"/><path fill="#ea4335" d="M12 6.2c1.5 0 2.8.5 3.9 1.5l2.9-2.8A10.3 10.3 0 0 0 2.7 7.8l3.5 2.7C7 8 9.3 6.2 12 6.2Z"/></svg>{busy?'Abriendo Google…':'Continuar con Google'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
