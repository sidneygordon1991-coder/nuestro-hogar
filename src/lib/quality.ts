export type QualityStatus='excellent'|'healthy'|'attention'|'risk';
export type CheckState='ok'|'info'|'warning'|'error';

export function qualityLabel(status:QualityStatus){
 return status==='excellent'?'Excelente':status==='healthy'?'Saludable':status==='attention'?'Requiere atención':'En riesgo';
}
export function qualityTone(score:number):QualityStatus{
 const n=Math.max(0,Math.min(100,Number(score)||0));
 return n>=95?'excellent':n>=85?'healthy':n>=70?'attention':'risk';
}
export function clientReadiness(input:{online:boolean;serviceWorkerSupported:boolean;serviceWorkerControlled:boolean;standalone:boolean;notifications:'granted'|'denied'|'default'|'unsupported'}){
 const checks=[
  {key:'online',ok:input.online,weight:35},
  {key:'service-worker',ok:input.serviceWorkerSupported&&input.serviceWorkerControlled,weight:30},
  {key:'install',ok:input.standalone,weight:20},
  {key:'notifications',ok:input.notifications==='granted',weight:15}
 ];
 const score=checks.reduce((sum,c)=>sum+(c.ok?c.weight:0),0);
 return {score,status:qualityTone(score),checks};
}
export function formatLatency(ms:number|null){
 if(ms==null||!Number.isFinite(ms))return 'Sin medición';
 if(ms<250)return Math.round(ms)+' ms · excelente';
 if(ms<600)return Math.round(ms)+' ms · normal';
 return Math.round(ms)+' ms · lento';
}
