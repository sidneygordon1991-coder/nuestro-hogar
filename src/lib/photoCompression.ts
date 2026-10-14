export const PHOTO_MAX_EDGE=2400;
const cache=new WeakMap<File,Promise<File>>();
export function photoDimensions(width:number,height:number,maxEdge=PHOTO_MAX_EDGE){const ratio=Math.min(1,maxEdge/Math.max(width,height));return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};}
/** Keeps the original whenever decoding fails, the image is small or recompression does not help. */
export function compressPhoto(file:File):Promise<File>{
 const previous=cache.get(file);if(previous)return previous;
 const task=(async()=>{
  if(file.size<750000||file.size>30000000||!['image/jpeg','image/png','image/webp'].includes(file.type)||typeof createImageBitmap==='undefined')return file;
  let bitmap:ImageBitmap|undefined;
  try{
   bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>80000000)return file;
   const dimensions=photoDimensions(bitmap.width,bitmap.height);
   const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
   const ctx=canvas.getContext('2d');if(!ctx)return file;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,file.type,.9));
   if(!blob||blob.type!==file.type||blob.size>=file.size*.9)return file;
   return new File([blob],file.name,{type:file.type,lastModified:file.lastModified});
  }catch{return file}finally{bitmap?.close()}
 })();cache.set(file,task);return task;
}
