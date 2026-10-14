import {describe,expect,it,vi} from 'vitest';
import {checkHouseholdUpload,quotaBytes,storageLabel,storageState,usagePercent} from './platform';
describe('platform storage controls',()=>{
 it('uses decimal MB to match configured provider quotas',()=>{expect(quotaBytes('100',1000000000,0)).toBe(100000000);expect(storageLabel(1000000000)).toBe('1 GB');expect(storageLabel(0)).toBe('0 MB')});
 it('rejects invalid quotas and reductions below stored evidence',()=>{for(const value of ['', 'NaN','Infinity','-1','0','1001'])expect(()=>quotaBytes(value,1000000000,0)).toThrow();expect(()=>quotaBytes('1',1000000000,1100000)).toThrow();expect(quotaBytes('1.1',1000000000,1100000)).toBe(1100000)});
 it('warns before quota exhaustion without rendering overfilled meters',()=>{expect(storageState(79999999,100000000)).toBe('normal');expect(storageState(80000000,100000000)).toBe('warning');expect(storageState(95000000,100000000)).toBe('critical');expect(usagePercent(200,100)).toBe(100);expect(usagePercent(0,0)).toBe(0)});
});

import type {SupabaseClient} from '@supabase/supabase-js';
describe('upload quota preflight',()=>{
 it('blocks archived, full and unverifiable storage before uploading bytes',async()=>{
  const rpc=vi.fn(),client={rpc} as unknown as SupabaseClient;
  rpc.mockResolvedValueOnce({data:{status:'active',used_bytes:80,quota_bytes:100},error:null});
  await expect(checkHouseholdUpload(client,'household',20)).resolves.toBeUndefined();
  rpc.mockResolvedValueOnce({data:{status:'active',used_bytes:80,quota_bytes:100},error:null});
  await expect(checkHouseholdUpload(client,'household',21)).rejects.toThrow('espacio disponible');
  rpc.mockResolvedValueOnce({data:{status:'archived',used_bytes:0,quota_bytes:100},error:null});
  await expect(checkHouseholdUpload(client,'household',1)).rejects.toThrow('archivada');
  rpc.mockResolvedValueOnce({data:null,error:null});
  await expect(checkHouseholdUpload(client,'household',1)).rejects.toThrow('verificar');
 });
});
