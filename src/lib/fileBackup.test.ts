import {describe,expect,it,vi} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import {backupParts,backupPath,downloadBackupPart,loadFileArchive,MAX_UNPACKED_BYTES,restoreFileArchive,validateZipBudget,type BackupPlan} from './fileBackup';
import type {SupabaseClient} from '@supabase/supabase-js';
const hh='11111111-1111-4111-8111-111111111111',tx='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
function plan():BackupPlan{return {id,snapshot:{product:'Nuestro Hogar',schema_version:1,household:{id:hh,name:'QA'},notes:{archive_id:id},tables:{}},parts:[[{bucket:'finance-receipts',path:hh+'/'+tx+'/'+id+'.pdf',name:'invoice.pdf',mime:'application/pdf',size:12,archive_path:'files/finance-receipts/'+hh+'/'+tx+'/'+id+'.pdf'}]]}}
const bytes=strToU8('%PDF-1.7\nQA!');
async function archive(){const client={storage:{from:()=>({download:async()=>({data:new Blob([bytes],{type:'application/pdf'}),error:null})})}} as unknown as SupabaseClient;return downloadBackupPart(client,plan(),0)}
describe('portable file backups',()=>{
 it('rejects cross-household paths and archive traversal',()=>{for(const path of ['../secret',hh+'/../x',hh+'/x\\y',hh+'//x'])expect(()=>backupPath('finance-receipts',path,hh)).toThrow();expect(()=>backupPath('public',hh+'/a',hh)).toThrow()});
 it('splits large collections into downloadable parts',()=>{const f=plan().parts[0][0];expect(backupParts([f,{...f,size:11}],20)).toHaveLength(2)});
 it('round-trips records and exact binary evidence with hashes',async()=>{const blob=await archive();const loaded=await loadFileArchive(new File([blob],'backup.zip'),hh);expect(loaded.snapshot?.household.id).toBe(hh);expect(loaded.files[0].bytes).toEqual(bytes);expect(loaded.files[0].ref.sha256).toHaveLength(64)});
 it('rejects other families and corrupted/missing files before any restore writes',async()=>{const blob=await archive();await expect(loadFileArchive(new File([blob],'backup.zip'),'other')).rejects.toThrow('otra familia');const {unzipSync}=await import('fflate');const entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));entries[plan().parts[0][0].archive_path]=strToU8('changed file');await expect(loadFileArchive(new File([zipSync(entries)],'bad.zip'),hh)).rejects.toThrow('dañado')});
 it('refuses declared decompression bombs before unzipping',()=>{const raw=zipSync({'manifest.json':strToU8('{}')});const view=new DataView(raw.buffer);for(let i=0;i<raw.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,MAX_UNPACKED_BYTES+1,true);break}expect(()=>validateZipBudget(raw)).toThrow('límite')});
 it('keeps current files without replacing them',async()=>{const loaded=await loadFileArchive(new File([await archive()],'backup.zip'),hh);const upload=vi.fn();const rpc=vi.fn(async(name:string)=>({data:name==='import_household_backup'?'backup':{restored_records:0},error:null}));const client={rpc,storage:{from:()=>({download:async()=>({data:new Blob(['current']),error:null}),upload})}} as unknown as SupabaseClient;const result=await restoreFileArchive(client,loaded);expect(result.preserved).toBe(1);expect(upload).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith('restore_household_backup_missing',{p_backup_id:'backup'})});
 it('reports upload failures while keeping the archive retryable',async()=>{
  const loaded=await loadFileArchive(new File([await archive()],'backup.zip'),hh);
  const rpc=vi.fn(async(name:string)=>({data:name==='import_household_backup'?'backup':name==='get_my_household_storage'?{status:'active',used_bytes:0,quota_bytes:1000000}:{restored_records:0},error:null}));
  const client={rpc,storage:{from:()=>({download:async()=>({data:null,error:{message:'Not found'}}),upload:async()=>({error:{message:'Upload failed'}})})}} as unknown as SupabaseClient;
  const result=await restoreFileArchive(client,loaded);expect(result.saved).toBe(0);expect(result.failed).toEqual(['invoice.pdf: Upload failed']);expect(loaded.files[0].bytes).toEqual(bytes);
 });

});
