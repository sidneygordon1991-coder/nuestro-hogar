import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

type NotificationRow={id:string;user_id:string;household_id:string;title:string;body:string|null;action_tab:string|null;type:string;severity:string;created_at:string};
type SubscriptionRow={id:string;user_id:string;household_id:string;endpoint:string;p256dh:string;auth:string;enabled:boolean};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceRole)return json({error:"Missing server configuration"},500);
  const admin=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

  const {error:autoError}=await admin.rpc("run_household_automation");
  if(autoError)console.error("automation",autoError.message);

  let {data:vapid,error:vapidError}=await admin.rpc("get_web_push_vapid");
  if(vapidError)return json({error:vapidError.message},500);
  let details=Array.isArray(vapid)?vapid[0]:vapid;
  if(!details?.public_key||!details?.private_key){
    const generated=webpush.generateVAPIDKeys();
    const subject="https://sidneygordon1991-coder.github.io/nuestro-hogar/";
    const {error:createError}=await admin.rpc("ensure_web_push_vapid",{p_public_key:generated.publicKey,p_private_key:generated.privateKey,p_subject:subject});
    if(createError)return json({error:createError.message},500);
    const refreshed=await admin.rpc("get_web_push_vapid");
    if(refreshed.error)return json({error:refreshed.error.message},500);
    details=Array.isArray(refreshed.data)?refreshed.data[0]:refreshed.data;
  }

  webpush.setVapidDetails(details.subject,details.public_key,details.private_key);

  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const {data:notifications,error:notificationError}=await admin.from("notifications")
    .select("id,user_id,household_id,title,body,action_tab,type,severity,created_at")
    .is("push_sent_at",null).gte("created_at",since).order("created_at",{ascending:true}).limit(100);
  if(notificationError)return json({error:notificationError.message},500);
  if(!notifications?.length)return json({processed:0,sent:0,disabled:0});

  const userIds=[...new Set((notifications as NotificationRow[]).map(n=>n.user_id))];
  const {data:preferences,error:prefError}=await admin.from("notification_preferences")
    .select("household_id,user_id,browser_notifications").in("user_id",userIds);
  if(prefError)return json({error:prefError.message},500);
  const enabledPrefs=new Set((preferences||[]).filter((p:any)=>p.browser_notifications).map((p:any)=>p.household_id+":"+p.user_id));

  const {data:subscriptions,error:subError}=await admin.from("push_subscriptions")
    .select("id,user_id,household_id,endpoint,p256dh,auth,enabled").in("user_id",userIds).eq("enabled",true);
  if(subError)return json({error:subError.message},500);

  const subs=(subscriptions||[]) as SubscriptionRow[];
  let sent=0,disabled=0;
  for(const notification of notifications as NotificationRow[]){
    if(!enabledPrefs.has(notification.household_id+":"+notification.user_id))continue;
    const userSubs=subs.filter(s=>s.user_id===notification.user_id&&s.household_id===notification.household_id&&s.enabled);
    if(!userSubs.length)continue;
    let delivered=false;
    const payload=JSON.stringify({title:notification.title,body:notification.body||"",icon:"/nuestro-hogar/icon.svg",badge:"/nuestro-hogar/icon.svg",tag:"nh-"+notification.id,data:{url:"/nuestro-hogar/?tab="+(notification.action_tab||"inicio"),notification_id:notification.id},severity:notification.severity,type:notification.type});
    for(const subscription of userSubs){
      try{
        await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:3600,urgency:notification.severity==="danger"?"high":"normal"});
        delivered=true;sent++;
      }catch(error:any){
        const status=Number(error?.statusCode||0);
        console.error("push",subscription.id,status,error?.message||String(error));
        if(status===404||status===410){await admin.from("push_subscriptions").update({enabled:false}).eq("id",subscription.id);disabled++}
      }
    }
    if(delivered)await admin.from("notifications").update({push_sent_at:new Date().toISOString()}).eq("id",notification.id);
  }
  return json({processed:notifications.length,sent,disabled});
});
