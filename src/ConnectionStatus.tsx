import {useEffect,useState} from 'react';
import {WifiOff} from 'lucide-react';
export default function ConnectionStatus(){
 const [online,setOnline]=useState(()=>navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[]);
 return <div aria-live="polite">{!online&&<div className="workspace-status"><WifiOff size={20}/><p>Sin conexión. Puedes consultar lo que ya está cargado; guardar cambios y actualizar datos necesita conexión.</p></div>}</div>;
}
