import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {storageLabel,storageState} from './lib/platform';
export default function HouseholdStorageNote({householdId,version}:{householdId:string;version:string}){
 const [usage,setUsage]=useState<{status:string;used_bytes:number;quota_bytes:number}|null>(null);
 useEffect(()=>{let live=true;setUsage(null);supabase.rpc('get_my_household_storage',{p_household_id:householdId}).then(({data,error})=>{if(live&&!error)setUsage(data)});return()=>{live=false}},[householdId,version]);
 if(!usage||usage.status==='active'&&storageState(usage.used_bytes,usage.quota_bytes)==='normal')return null;
 return <div className="household-storage-note" role="status">{usage.status==='archived'?<><strong>Familia archivada.</strong> Puedes consultar tus registros. Contacta al master para reactivar los cambios.</>:<><strong>Archivos: {storageLabel(usage.used_bytes)} de {storageLabel(usage.quota_bytes)}.</strong> Contacta al master si necesitas ampliar tu cuota.</>}</div>;
}
