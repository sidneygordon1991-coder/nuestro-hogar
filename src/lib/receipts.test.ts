import {describe,expect,it,vi} from 'vitest';
import {MAX_RECEIPT_BYTES,purchaseLines,receiptFormat,receiptPath,uploadReceipts,validateReceipt} from './receipts';
import type {SupabaseClient} from '@supabase/supabase-js';
const household='11111111-1111-4111-8111-111111111111',tx='22222222-2222-4222-8222-222222222222';
const pdf=(name='invoice.pdf')=>new File(['%PDF-1.7\nreceipt QA'],name,{type:'application/pdf'});
function fakeClient({failUpload=false,failMetadata=false,ambiguousMetadata=false}:{failUpload?:boolean;failMetadata?:boolean;ambiguousMetadata?:boolean}={}){
 const records=new Map<string,Record<string,unknown>>();let lookupId='';const tables:string[]=[];
 const upload=vi.fn(async(_path:string,_file:File,_options:{upsert:boolean;contentType:string;cacheControl:string})=>({data:{path:'qa'},error:failUpload?new Error('Upload failed'):null}));
 const remove=vi.fn(async()=>({data:[],error:null}));
 const insert=vi.fn((payload:Record<string,unknown>)=>({select:()=>({single:async()=>{
  if(!failMetadata||ambiguousMetadata)records.set(String(payload.id),{...payload,purchase_detail:'',created_at:'2026-10-13T00:00:00Z'});
  return {data:failMetadata?null:records.get(String(payload.id)),error:failMetadata?new Error('Metadata failed'):null};
 }})}));
 const from=vi.fn((table:string)=>{tables.push(table);return {
  insert,select:()=>{const query={eq:(field:string,id:string)=>{if(field==='id')lookupId=id;return query},maybeSingle:async()=>({data:records.get(lookupId)||null,error:null})};return query}
 }});
 const storageFrom=vi.fn(()=>({upload,remove}));
 return {client:{from,storage:{from:storageFrom}} as unknown as SupabaseClient,records,tables,upload,remove,insert,storageFrom};
}
describe('receipt validation',()=>{
 it('accepts PDF and supported photo signatures including an empty browser MIME',async()=>{
  await expect(validateReceipt(pdf())).resolves.toEqual({mime:'application/pdf',extension:'pdf'});
  const png=new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],'photo.PNG');
  await expect(validateReceipt(png)).resolves.toEqual({mime:'image/png',extension:'png'});
  await expect(validateReceipt(new File([new Uint8Array([255,216,255,0])],'photo.jpeg',{type:'image/jpeg'}))).resolves.toEqual({mime:'image/jpeg',extension:'jpg'});
  await expect(validateReceipt(new File(['RIFFxxxxWEBPxx'],'photo.webp',{type:'image/webp'}))).resolves.toEqual({mime:'image/webp',extension:'webp'});
 });
 it('rejects empty, oversized, unsupported and disguised executable content',async()=>{
  expect(()=>receiptFormat({name:'invoice.pdf',type:'application/pdf',size:0})).toThrow('vacío');
  expect(()=>receiptFormat({name:'invoice.pdf',type:'application/pdf',size:MAX_RECEIPT_BYTES+1})).toThrow('15 MB');
  expect(()=>receiptFormat({name:'invoice.html',type:'text/html',size:40})).toThrow('Usa PDF');
  await expect(validateReceipt(new File(['<script>alert(1)</script>'],'invoice.pdf',{type:'application/pdf'}))).rejects.toThrow('contenido');
 });
 it('builds a household and movement scoped path without user-controlled filenames',()=>{
  expect(receiptPath(household,tx,tx,'pdf')).toBe(`${household}/${tx}/${tx}.pdf`);
  expect(()=>receiptPath(household,'../other',tx,'pdf')).toThrow('inválidos');
  expect(()=>receiptPath(household,tx,tx,'html')).toThrow('inválidos');
 });
 it('lists purchase lines as plain text rather than calculating totals or rendering HTML',()=>{
  expect(purchaseLines(' Milk · 2\r\n\nBread · 1 \n<img src=x>')).toEqual(['Milk · 2','Bread · 1','<img src=x>']);
 });
});
describe('evidence uploads are isolated from finance operations',()=>{
 it('stores several files with unique paths and never writes movement tables',async()=>{
  const mock=fakeClient(),files=[pdf('one.pdf'),pdf('two.pdf')];
  const result=await uploadReceipts(mock.client,household,tx,files);
  expect(result.saved).toHaveLength(2);expect(result.failed).toHaveLength(0);
  expect(new Set(result.saved.map(row=>row.file_path)).size).toBe(2);
  expect(mock.tables.every(table=>table==='finance_receipts')).toBe(true);
  expect(mock.upload.mock.calls[0][2]).toEqual({upsert:false,contentType:'application/pdf',cacheControl:'300'});
 });
 it('retains upload failures for retry without creating evidence metadata',async()=>{
  const mock=fakeClient({failUpload:true}),file=pdf();
  const result=await uploadReceipts(mock.client,household,tx,[file]);
  expect(result.failed[0].file).toBe(file);expect(result.saved).toHaveLength(0);expect(mock.insert).not.toHaveBeenCalled();
 });
 it('cleans up an unlinked file after a metadata failure',async()=>{
  const mock=fakeClient({failMetadata:true});const result=await uploadReceipts(mock.client,household,tx,[pdf()]);
  expect(result.failed).toHaveLength(1);expect(mock.remove).toHaveBeenCalledTimes(1);expect(mock.tables).not.toContain('transactions');
 });
 it('does not duplicate an upload when a successful metadata response was lost',async()=>{
  const mock=fakeClient({failMetadata:true,ambiguousMetadata:true}),file=pdf();
  expect((await uploadReceipts(mock.client,household,tx,[file])).failed).toHaveLength(1);
  const retry=await uploadReceipts(mock.client,household,tx,[file]);
  expect(retry.saved).toHaveLength(1);expect(retry.failed).toHaveLength(0);expect(mock.upload).toHaveBeenCalledTimes(1);expect(mock.records.size).toBe(1);
 });
 it('can attach the same local file to a different movement without reusing its identity',async()=>{
  const mock=fakeClient(),file=pdf();
  const a=await uploadReceipts(mock.client,household,tx,[file]);
  const b=await uploadReceipts(mock.client,household,'33333333-3333-4333-8333-333333333333',[file]);
  expect(a.saved[0].id).not.toBe(b.saved[0].id);expect(mock.records.size).toBe(2);
 });
 it('continues with other selected files when one file has an invalid signature',async()=>{
  const mock=fakeClient();const bad=new File(['not a PDF'],'bad.pdf',{type:'application/pdf'});
  const result=await uploadReceipts(mock.client,household,tx,[bad,pdf()]);
  expect(result.failed).toHaveLength(1);expect(result.saved).toHaveLength(1);expect(mock.upload).toHaveBeenCalledTimes(1);
 });
});
