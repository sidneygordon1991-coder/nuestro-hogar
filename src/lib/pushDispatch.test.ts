import {describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../../supabase/functions/send-web-push/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
async function dispatch({enabled=true,subscribed=true,allowed=true,failStatus=0,ageHours=1,secret='qa-dispatch'}={}){
 const notices=[{id:'notice',user_id:'user',household_id:'home',title:'QA',body:null,action_tab:'presupuesto:budget',type:'budget',severity:'warning',created_at:new Date(Date.now()-ageHours*3600000).toISOString()}];
 const writes:{table:string;values:unknown}[]=[];
 const rpc=vi.fn(async(name:string)=>({data:name==='get_web_push_dispatch_secret'?'qa-dispatch':name==='get_web_push_vapid'?{public_key:'qa-public',private_key:'qa-private',subject:'https://example.invalid'}:name==='notification_push_allowed'?allowed:null,error:null}));
 const admin={rpc,from:(table:string)=>{
  let write=false;const query:any={};
  for(const name of ['select','is','gte','order','limit','in','eq'])query[name]=()=>query;
  query.update=(values:unknown)=>{write=true;writes.push({table,values});return query};
  query.then=(resolve:(value:unknown)=>void)=>Promise.resolve({error:null,data:write?null:table==='notifications'?notices:table==='notification_preferences'?(enabled?[{household_id:'home',user_id:'user',browser_notifications:true}]:[]):subscribed?[{id:'subscription',household_id:'home',user_id:'user',enabled:true,endpoint:'https://example.invalid',p256dh:'qa',auth:'qa'}]:[]}).then(resolve);
  return query;
 }};
 const sendNotification=vi.fn(async()=>{if(failStatus)throw {statusCode:failStatus,message:'QA push unavailable'}});
 let handler!:(r:Request)=>Promise<Response>;
 vm.runInNewContext(source,{Deno:{env:{get:()=> 'qa-config'},serve:(fn:typeof handler)=>{handler=fn}},TextEncoder,Request,Response,Date,console:{error:()=>{}},createClient:()=>admin,webpush:{setVapidDetails:()=>{},sendNotification},notificationUrl:()=>'/nuestro-hogar/?tab=presupuesto&finance=budget'});
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-nh-dispatch-secret':secret}}));
 return {response,writes,sendNotification,rpc};
}
describe('push dispatch queue and authorization',()=>{
 it('rejects a wrong dispatch secret before running automation or sending anything',async()=>{
  const r=await dispatch({secret:'wrong'});expect(r.response.status).toBe(401);expect(r.sendNotification).not.toHaveBeenCalled();expect(r.rpc).toHaveBeenCalledTimes(1);
 });
 it.each([{enabled:false},{subscribed:false},{allowed:false}])('settles undeliverable notifications without sending them: %j',async opts=>{
  const r=await dispatch(opts);expect(r.sendNotification).not.toHaveBeenCalled();expect(r.writes).toContainEqual({table:'notifications',values:{push_sent_at:expect.any(String)}});
 });
 it('uses PNG icons and settles successful notifications',async()=>{
  const r=await dispatch();expect(r.sendNotification).toHaveBeenCalledOnce();expect(JSON.parse((r.sendNotification.mock.calls as any)[0][1]).icon).toMatch(/\.png$/);expect(r.writes).toHaveLength(1);
 });
 it('retries transient failures for six hours, then advances the queue',async()=>{
  expect((await dispatch({failStatus:503})).writes).toHaveLength(0);
  expect((await dispatch({failStatus:503,ageHours:7})).writes).toContainEqual({table:'notifications',values:{push_sent_at:expect.any(String)}});
 });
 it('disables an expired subscription and settles its notification',async()=>{
  const r=await dispatch({failStatus:410});expect(r.writes).toEqual([{table:'push_subscriptions',values:{enabled:false}},{table:'notifications',values:{push_sent_at:expect.any(String)}}]);
 });
});
