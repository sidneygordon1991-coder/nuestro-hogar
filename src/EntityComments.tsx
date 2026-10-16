import {useEffect,useRef,useState,type FormEvent} from 'react';
import {MessageCircle,RefreshCw,Send,Trash2} from 'lucide-react';
import {supabase} from './lib/supabase';
type Comment={id:string;body:string;created_by:string;created_at:string};
export default function EntityComments({householdId,transactionId,listItemId,readOnly=false}:{householdId:string;transactionId?:string;listItemId?:string;readOnly?:boolean}){
 const [enabled,setEnabled]=useState(false),[user,setUser]=useState(''),[rows,setRows]=useState<Comment[]>([]),[names,setNames]=useState<Record<string,string>>({}),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[limit,setLimit]=useState(30),[more,setMore]=useState(false);
 const request=useRef<string>(crypto.randomUUID()),generation=useRef(0),snapshot=useRef('');
 const column=transactionId?'transaction_id':'list_item_id',entity=transactionId||listItemId||'';
 useEffect(()=>{let live=true;setEnabled(false);Promise.all([supabase.rpc('get_household_comments_capability',{p_household_id:householdId}),supabase.auth.getUser()]).then(([cap,auth])=>{if(live){setEnabled(!cap.error&&cap.data===true);setUser(auth.data.user?.id||'')}});return()=>{live=false;generation.current++}},[householdId]);
 useEffect(()=>{if(enabled)void load();return()=>{generation.current++}},[enabled,householdId,entity,limit]);
 async function load(){
  const gen=++generation.current;setLoading(true);setError('');
  const {data,error}=await supabase.from('household_comments').select('id,body,created_by,created_at').eq('household_id',householdId).eq(column,entity).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1);
  if(gen!==generation.current)return;
  if(error){setError('No pudimos consultar los comentarios. Reintenta para ver el historial.');setLoading(false);return}
  const comments=(data||[]).slice(0,limit) as Comment[],ids=[...new Set(comments.map(c=>c.created_by))];
  const profiles=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[]};
  if(gen!==generation.current)return;setRows(comments.reverse());setMore((data?.length||0)>limit);setNames(Object.fromEntries((profiles.data||[]).map(p=>[p.id,p.full_name||'Integrante'])));setLoading(false);
 }
 async function submit(e:FormEvent){
  e.preventDefault();const submittedForm=e.currentTarget as HTMLFormElement;if(busy||readOnly||!user||!body.trim())return;setBusy(true);setError('');const text=body.trim();
  if(snapshot.current&&snapshot.current!==text){setError('El intento anterior tenía otro texto. Recupera ese texto o actualiza el historial antes de iniciar un comentario nuevo.');setBusy(false);return}
  snapshot.current=text;
  try{
   const {error}=await supabase.from('household_comments').insert({id:request.current,household_id:householdId,[column]:entity,body:text,created_by:user});
   if(error){if(error.code!=='23505')throw error;const {data,error:verify}=await supabase.from('household_comments').select('body,created_by').eq('id',request.current).eq('household_id',householdId).single();if(verify||data?.body!==text||data?.created_by!==user)throw error}
   setBody('');submittedForm.reset();snapshot.current='';request.current=crypto.randomUUID();await load();
  }catch{setError('No se confirmó el comentario. Conserva el texto y reintenta para evitar duplicados.')}finally{setBusy(false)}
 }
 async function remove(row:Comment){if(busy||readOnly||row.created_by!==user)return;setBusy(true);setError('');try{const {error}=await supabase.from('household_comments').delete().eq('id',row.id).eq('household_id',householdId).eq('created_by',user);if(error)throw error;await load()}catch{setError('No pudimos eliminar tu comentario.')}finally{setBusy(false)}}
 if(!enabled)return null;
 return <section className="entity-comments" aria-label="Comentarios del registro"><div className="entity-comments-heading"><h4><MessageCircle size={18}/> Conversación del hogar</h4><button type="button" aria-label="Actualizar comentarios" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={16}/></button></div><p className="muted">Visible para quienes pueden consultar este registro. Cada persona puede eliminar sus propios comentarios.</p>
  {loading&&<p role="status" className="muted">Consultando comentarios…</p>}{error&&<p role="alert" className="sharing-error">{error}</p>}
  <div className="comment-history">{more&&<button type="button" disabled={loading} onClick={()=>setLimit(n=>n+30)}>Ver comentarios anteriores</button>}{rows.map(row=><article key={row.id}><div><strong>{names[row.created_by]||'Integrante'}</strong><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es-GT',{dateStyle:'short',timeStyle:'short'})}</time>{!readOnly&&row.created_by===user&&<button type="button" aria-label="Eliminar mi comentario" disabled={busy} onClick={()=>void remove(row)}><Trash2 size={15}/></button>}</div><p>{row.body}</p></article>)}</div>
  {!loading&&!rows.length&&!error&&<p className="muted">Aún no hay comentarios. Puedes aclarar un gasto o coordinar este pendiente aquí.</p>}
  {!readOnly&&<form onSubmit={submit}><label>Nuevo comentario<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={1000} rows={3} required placeholder="Ej. Esta compra incluye los productos de la semana."/></label><small>{body.length}/1000</small><button className="secondary-action" disabled={busy||!user||!body.trim()}><Send size={15}/>{busy?'Guardando…':'Comentar'}</button></form>}
 </section>
}
