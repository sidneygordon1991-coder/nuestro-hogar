import type {SupabaseClient} from '@supabase/supabase-js';
export type PlatformFamily={id:string;name:string;status:'active'|'archived';quota_bytes:number;used_bytes:number;members:number;member_limit:number;movements:number;files:number;created_at:string};
export type PlatformMember={user_id:string;name:string|null;email:string;role:string};
export type PlatformAudit={id:number;action:string;detail:{reason?:string;status?:string;role?:string};created_at:string;household_name:string|null;actor_name:string|null};
export type PlatformOverview={plan:string;database_bytes:number;database_limit_bytes:number;storage_bytes:number;allocated_bytes:number;storage_limit_bytes:number;households:PlatformFamily[];audit:PlatformAudit[]};
export function storageLabel(bytes:number){if(!Number.isFinite(bytes)||bytes<=0)return '0 MB';if(bytes<1000000)return (bytes/1000).toLocaleString('es-GT',{maximumFractionDigits:1})+' KB';if(bytes<1000000000)return (bytes/1000000).toLocaleString('es-GT',{maximumFractionDigits:1})+' MB';return (bytes/1000000000).toLocaleString('es-GT',{maximumFractionDigits:2})+' GB';}
export function usagePercent(used:number,limit:number){return limit>0?Math.max(0,Math.min(100,used/limit*100)):0;}
export function storageState(used:number,limit:number){const value=usagePercent(used,limit);return value>=95?'critical':value>=80?'warning':'normal';}
export function quotaBytes(value:string,maximum:number,currentUsage:number){const amount=Number(value);if(!value.trim()||!Number.isFinite(amount)||amount<1||amount>maximum/1000000)throw new Error('La cuota debe estar entre 1 MB y el límite global.');const bytes=Math.round(amount*1000000);if(bytes<currentUsage)throw new Error('La cuota no puede ser menor que los archivos ya almacenados.');return bytes;}
export function platformError(error:unknown){return error&&typeof error==='object'&&'message' in error?String(error.message):'No se pudo completar la operación. Intenta de nuevo.';}

export async function checkHouseholdUpload(client:SupabaseClient,householdId:string,bytes:number){
 const {data,error}=await client.rpc('get_my_household_storage',{p_household_id:householdId});
 if(error)throw error;
 if(!data)throw new Error('No se pudo verificar el espacio disponible.');
 if(data.status!=='active')throw new Error('Esta familia está archivada. Contacta al master para reactivarla.');
 if(Number(data.used_bytes)+bytes>Number(data.quota_bytes))throw new Error('Este archivo supera el espacio disponible de la familia. Contacta al master para ampliar la cuota.');
}
