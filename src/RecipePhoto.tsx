import {useEffect,useState} from 'react';
import {Camera,Trash2} from 'lucide-react';
import ModuleIcon from './ModuleIcon';
import {makeCover,normalizeAppearance} from './lib/appearance';
import {supabase} from './lib/supabase';
export default function RecipePhoto({householdId,recipeId,name}:{householdId:string;recipeId:string;name:string}){
 const [key,setKey]=useState(''),[photo,setPhoto]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;supabase.auth.getUser().then(({data})=>{if(!live||!data.user)return;const k='nh:recipe-photo:'+data.user.id+':'+householdId+':'+recipeId;setKey(k);try{setPhoto(normalizeAppearance({cover:localStorage.getItem(k)||''}).cover)}catch{setPhoto('')}});return()=>{live=false}},[householdId,recipeId]);
 async function choose(file?:File){if(!file||!key)return;setBusy(true);setError('');try{const image=await makeCover(file);localStorage.setItem(key,image);setPhoto(image)}catch{setError('No pudimos guardar la foto. Elige otra imagen o libera espacio en este navegador.')}finally{setBusy(false)}}
 function clear(){try{localStorage.removeItem(key);setPhoto('');setError('')}catch{setError('No se pudo quitar la foto de este navegador.')}}
 return <div className={'studio-recipe-photo '+(photo?'has-photo':'')}>
  {photo?<img src={photo} alt={name} loading="lazy"/>:<div className="studio-recipe-art" aria-hidden="true"><div className="studio-plate"><span/><i/><b/><em/><strong/></div><ModuleIcon name="meals" size={37}/></div>}
  <div className="studio-recipe-photo-actions"><label title="Foto personal guardada en este dispositivo"><Camera size={15}/>{busy?'Preparando…':photo?'Cambiar foto':'Agregar foto'}<input aria-label={'Foto de '+name+' en este dispositivo'} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!key} onChange={e=>choose(e.target.files?.[0])}/></label>{photo&&<button onClick={clear} aria-label={'Quitar foto de '+name}><Trash2 size={15}/></button>}</div><small className="studio-recipe-photo-note">Foto personal · este dispositivo</small>{error&&<p role="alert">{error}</p>}
 </div>
}
