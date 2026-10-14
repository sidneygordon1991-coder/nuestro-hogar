import type {SupabaseClient} from '@supabase/supabase-js';
export const RECEIPT_BUCKET='finance-receipts';
export const MAX_RECEIPT_BYTES=15*1024*1024;
export const RECEIPT_ACCEPT='.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export type Receipt={id:string;transaction_id:string;file_path:string;original_filename:string;mime_type:string;file_size:number;purchase_detail:string;created_at:string};
const formats:Record<string,{mime:string;extension:string}>={pdf:{mime:'application/pdf',extension:'pdf'},jpg:{mime:'image/jpeg',extension:'jpg'},jpeg:{mime:'image/jpeg',extension:'jpg'},png:{mime:'image/png',extension:'png'},webp:{mime:'image/webp',extension:'webp'}};
export function receiptFormat(file:Pick<File,'name'|'type'|'size'>){
 if(!file.size)throw new Error('El archivo está vacío.');
 if(file.size>MAX_RECEIPT_BYTES)throw new Error('Cada comprobante puede pesar hasta 15 MB.');
 const format=formats[file.name.split('.').pop()?.toLowerCase()||''];
 if(!format||file.type&&file.type!==format.mime)throw new Error('Usa PDF, JPG, PNG o WEBP.');
 return format;
}
export async function validateReceipt(file:File){
 const format=receiptFormat(file),bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 const valid=format.extension==='pdf'?ascii(0,5)==='%PDF-':format.extension==='jpg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:format.extension==='png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
 if(!valid)throw new Error('El contenido del archivo no coincide con su formato.');
 return format;
}
export function receiptPath(householdId:string,transactionId:string,id:string,extension:string){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(![householdId,transactionId,id].every(value=>uuid.test(value))||!['pdf','jpg','png','webp'].includes(extension))throw new Error('Movimiento o ruta de comprobante inválidos.');
 return `${householdId.toLowerCase()}/${transactionId.toLowerCase()}/${id.toLowerCase()}.${extension}`;
}
export function purchaseLines(detail:string){return detail.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);}
export function receiptSize(bytes:number){return bytes<1024*1024?Math.ceil(bytes/1024)+' KB':(bytes/1024/1024).toFixed(1)+' MB';}

const uploadIdentities=new WeakMap<File,Map<string,{id:string;attempted:boolean}>>();
function uploadIdentity(file:File,scope:string){
 let scopes=uploadIdentities.get(file);if(!scopes){scopes=new Map();uploadIdentities.set(file,scopes)}
 let identity=scopes.get(scope);if(!identity){identity={id:crypto.randomUUID(),attempted:false};scopes.set(scope,identity)}
 return identity;
}
const receiptColumns='id,transaction_id,file_path,original_filename,mime_type,file_size,purchase_detail,created_at';

/** This function never writes transactions or totals. Partial failures remain retryable. */
export async function uploadReceipts(client:SupabaseClient,householdId:string,transactionId:string,files:File[]){
 const saved:Receipt[]=[],failed:{file:File;message:string}[]=[];
 for(const file of files){
  let path='',uploaded=false,linked=false;
  try{
   const format=await validateReceipt(file);
   const identity=uploadIdentity(file,householdId+'/'+transactionId);
   path=receiptPath(householdId,transactionId,identity.id,format.extension);
   const {data:existing,error:lookupError}=await client.from('finance_receipts').select(receiptColumns).eq('id',identity.id).eq('household_id',householdId).eq('transaction_id',transactionId).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing){saved.push(existing as Receipt);continue}
   if(identity.attempted){const {error:cleanupError}=await client.storage.from(RECEIPT_BUCKET).remove([path]);if(cleanupError)throw cleanupError;}
   identity.attempted=true;
   const {error:uploadError}=await client.storage.from(RECEIPT_BUCKET).upload(path,file,{upsert:false,contentType:format.mime,cacheControl:'300'});
   if(uploadError)throw uploadError;uploaded=true;
   const {data,error}=await client.from('finance_receipts').insert({id:identity.id,household_id:householdId,transaction_id:transactionId,file_path:path,original_filename:file.name.slice(0,250),mime_type:format.mime,file_size:file.size}).select(receiptColumns).single();
   if(error)throw error;
   if(!data)throw new Error('No se pudo vincular el comprobante.');
   linked=true;saved.push(data as Receipt);
  }catch(error){
   // Cleanup is deliberately best effort: a failed upload never deletes a movement.
   if(uploaded&&!linked)try{await client.storage.from(RECEIPT_BUCKET).remove([path])}catch{/* retry remains available */}
   failed.push({file,message:error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String(error.message):'No se pudo subir este comprobante.'});
  }
 }
 return {saved,failed};
}
