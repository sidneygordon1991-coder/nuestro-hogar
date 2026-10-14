import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL || 'https://dchihxrjtngwabbvsqap.supabase.co';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_1IQkLKO6xv1p4jiHDxepRQ_BZa_Sfbc';
export const supabase=createClient(url,key);
export async function googleLoginReady(){
 const response=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('No se pudo comprobar el ingreso con Google. Intenta de nuevo.');
 const settings=await response.json();return settings?.external?.google===true;
}
