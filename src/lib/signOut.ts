import {supabase} from './supabase';

/**
 * Signs out after detaching this device from push: otherwise a shared phone or tablet keeps receiving the previous
 * person's finance alerts, and the next person cannot register the same device (the endpoint is unique).
 * Every step is best-effort; signing out never waits on, or fails because of, push cleanup.
 */
export async function signOutDevice(){
 let timer:ReturnType<typeof setTimeout>|undefined;
 const cleanup=(async()=>{try{
  const {data:{session}}=await supabase.auth.getSession();
  const userId=session?.user.id;if(!userId)return;
  const reg='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration():undefined;
  const subscription=reg&&'pushManager' in reg?await reg.pushManager.getSubscription():null;
  if(subscription){
   await supabase.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',userId);
   await subscription.unsubscribe().catch(()=>false);
  }
 }catch{/* push cleanup is optional */}})();
 await Promise.race([cleanup,new Promise<void>(resolve=>{timer=setTimeout(resolve,2500)})]);
 clearTimeout(timer);
 await supabase.auth.signOut();
}
