/** The household's shopping list is always the OLDEST 'shopping' list (created_at, then id), read from the server so every screen agrees. */
type Client={from:(table:string)=>any};
const inflight=new Map<string,Promise<string>>();
export async function oldestShoppingListId(client:Client,householdId:string):Promise<string|null>{
 const {data,error}=await client.from('lists').select('id').eq('household_id',householdId).eq('list_type','shopping').order('created_at',{ascending:true}).order('id',{ascending:true}).limit(1);
 if(error)throw new Error(error.message||'No se pudo leer la lista de compras.');
 return (data&&data[0]?.id)||null;
}
/** Concurrent calls in this client share one request; another device's oldest list wins without deleting any list or its items. */
export function ensureShoppingList(client:Client,householdId:string,title='Supermercado'):Promise<string>{
 const pending=inflight.get(householdId);if(pending)return pending;
 const run=(async()=>{
  const found=await oldestShoppingListId(client,householdId);if(found)return found;
  const {data,error}=await client.from('lists').insert({household_id:householdId,title,list_type:'shopping'}).select('id').single();
  if(error||!data)throw new Error(error?.message||'No se pudo crear la lista de compras.');
  const winner=await oldestShoppingListId(client,householdId).catch(()=>data.id as string);
  if(winner&&winner!==data.id)return winner;
  return data.id as string;
 })();
 inflight.set(householdId,run);
 const clear=()=>{if(inflight.get(householdId)===run)inflight.delete(householdId)};run.then(clear,clear);
 return run;
}
