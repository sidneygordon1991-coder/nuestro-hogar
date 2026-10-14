import {describe,expect,it} from 'vitest';
import {compressPhoto,photoDimensions} from './photoCompression';
describe('photo compression safeguards',()=>{
 it('fits large portrait and landscape photos without stretching or upscaling',()=>{expect(photoDimensions(6000,4000)).toEqual({width:2400,height:1600});expect(photoDimensions(3000,6000)).toEqual({width:1200,height:2400});expect(photoDimensions(400,600)).toEqual({width:400,height:600})});
 it('preserves non-photos and caches the same source for safe upload retries',async()=>{const file=new File(['%PDF-test'],'invoice.pdf',{type:'application/pdf'});const first=compressPhoto(file);expect(compressPhoto(file)).toBe(first);expect(await first).toBe(file)});
 it('preserves small photos rather than recompressing them',async()=>{const file=new File([new Uint8Array([255,216,255])],'photo.jpg',{type:'image/jpeg'});expect(await compressPhoto(file)).toBe(file)});
});
