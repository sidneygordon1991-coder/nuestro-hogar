import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';

const initial=(name:string)=>name.trim().charAt(0).toUpperCase()||'?';
let channelSequence=0;

/** Signed-in member's avatar. `chip` adds the first name, used at the bottom of the desktop sidebar. */
export default function ProfileAvatar({onClick,variant='icon'}:{onClick?:()=>void;variant?:'icon'|'chip'}){
 const [name,setName]=useState(''),[avatar,setAvatar]=useState<string|null>(null);
 useEffect(()=>{
  let live=true,channel:ReturnType<typeof supabase.channel>|null=null;
  async function load(){
   const {data:{user}}=await supabase.auth.getUser();if(!user||!live)return;
   const {data}=await supabase.from('profiles').select('full_name,avatar_url').eq('id',user.id).maybeSingle();
   if(!live)return;setName(data?.full_name||user.user_metadata?.full_name||user.email||'');setAvatar(data?.avatar_url||null);
   if(!channel)channel=supabase.channel('my-profile-avatar-'+(++channelSequence)).on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:'id=eq.'+user.id},()=>load()).subscribe();
  }
  load();
  return()=>{live=false;if(channel)supabase.removeChannel(channel)};
 },[]);
 const picture=avatar?<img src={avatar} alt=""/>:<span>{initial(name)}</span>;
 if(variant==='chip')return <button type="button" className="profile-chip" title={name} aria-label={'Abrir mi perfil'+(name?' ('+name+')':'')} onClick={onClick}><span className="avatar profile-avatar" aria-hidden="true">{avatar?<img src={avatar} alt=""/>:<span>{initial(name)}</span>}</span><span className="profile-chip-name">{name.split(/\s+/)[0]||'Mi perfil'}</span></button>;
 return <button type="button" className="avatar profile-avatar" title={name} aria-label="Abrir mi perfil" onClick={onClick}>{picture}</button>;
}
