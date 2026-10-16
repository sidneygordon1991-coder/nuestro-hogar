import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FileClock,RotateCcw,WifiOff} from 'lucide-react';
import {captureFields,draftKey,parseDraft,restoreFields,type FormDraft} from './lib/formDrafts';
export default function DraftForm({userId,householdId,kind,onSubmit,onSaved,children,className='finance-form',errorMessage=''}:{userId:string;householdId:string;kind:string;onSubmit:(form:HTMLFormElement,requestId:string)=>Promise<boolean>;onSaved?:()=>void;children:ReactNode;className?:string;errorMessage?:string}){
 const key=draftKey(userId,householdId,kind),form=useRef<HTMLFormElement>(null),request=useRef<string>(crypto.randomUUID()),attempted=useRef(false),active=useRef(true);
 const [pending,setPending]=useState<FormDraft|null>(()=>{try{return parseDraft(localStorage.getItem(key))}catch{return null}}),[status,setStatus]=useState(''),[saving,setSaving]=useState(false),[online,setOnline]=useState(()=>navigator.onLine),[failed,setFailed]=useState(false);
 useEffect(()=>{active.current=true;const sync=()=>setOnline(navigator.onLine);window.addEventListener('online',sync);window.addEventListener('offline',sync);return()=>{active.current=false;window.removeEventListener('online',sync);window.removeEventListener('offline',sync)}},[]);
 function persist(el:HTMLFormElement){
  if(!userId||pending)return;
  try{const previous=parseDraft(localStorage.getItem(key));if(previous&&previous.requestId!==request.current){setStatus('Hay otro borrador de este formulario abierto. Conserva esta ventana y revisa la otra antes de guardar.');return false}
   const draft:FormDraft={version:1,requestId:request.current,updatedAt:Date.now(),fields:captureFields(el),attempted:attempted.current};localStorage.setItem(key,JSON.stringify(draft));setStatus('Borrador guardado en este dispositivo.');return true;
  }catch{setStatus('Este navegador no pudo conservar el borrador. Mantén esta ventana abierta hasta confirmar el guardado.');return true}
 }
 function recover(){if(!pending||!form.current)return;restoreFields(form.current,pending.fields);request.current=pending.requestId;attempted.current=pending.attempted;setPending(null);setStatus('Borrador recuperado. Revisa los datos antes de guardar.');setFailed(false)}
 function discard(){try{const previous=parseDraft(localStorage.getItem(key));if(pending&&previous?.requestId===pending.requestId)localStorage.removeItem(key)}catch{};request.current=crypto.randomUUID();attempted.current=false;setPending(null);setStatus('Borrador descartado. Esto no elimina movimientos ya guardados.');form.current?.reset()}
 return <form ref={form} className={className} onChange={e=>persist(e.currentTarget)} onSubmit={async e=>{
  e.preventDefault();if(saving||pending)return;const el=e.currentTarget;if(!online){persist(el);setStatus('Sin conexión. Tu borrador queda aquí; revisa y guarda cuando vuelva internet.');return}
  attempted.current=true;if(persist(el)===false)return;setSaving(true);setFailed(false);
  try{const ok=await onSubmit(el,request.current);if(ok){try{const current=parseDraft(localStorage.getItem(key));if(current?.requestId===request.current)localStorage.removeItem(key)}catch{};if(active.current){request.current=crypto.randomUUID();attempted.current=false;setStatus('Guardado confirmado.');el.reset();onSaved?.()}}else if(active.current)setFailed(true)}catch{if(active.current)setFailed(true)}finally{if(active.current)setSaving(false)}
 }}>
  <div className="draft-status" role="status"><FileClock size={17}/><span>{status||'El formulario conserva un borrador local durante 7 días. Se borra al cerrar sesión.'}</span></div>
  {pending&&<div className="draft-recovery"><strong>Hay un borrador pendiente</strong><p>{pending.attempted?'Hubo un intento de guardado. Recupera el borrador para reintentar con la misma solicitud y evitar duplicados.':'Puedes continuar lo que estabas registrando.'}</p><small>{new Date(pending.updatedAt).toLocaleString('es-GT')}</small><div><button type="button" onClick={recover}><RotateCcw size={16}/> Recuperar borrador</button><button type="button" onClick={discard}>Descartar borrador</button></div><small>Descartar no elimina un movimiento que el servidor ya haya guardado.</small></div>}
  {!online&&<p className="connected-warning"><WifiOff size={17}/> Sin conexión. Puedes completar el borrador; el envío requiere internet.</p>}
  {failed&&<p className="sharing-error" role="alert">{errorMessage||'No se confirmó el guardado. Tus datos siguen aquí. Reintenta para comprobar la misma solicitud.'}</p>}
  <fieldset className="draft-fields" disabled={Boolean(pending)||saving||!userId}>{children}</fieldset>
 </form>
}
