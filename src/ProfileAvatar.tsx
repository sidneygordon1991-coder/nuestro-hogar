import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';

export default function ProfileAvatar(){
 const [name,setName]=useState(''),[avatar,setAvatar]=useState<string|null>(null);
 useEffect(()=>{load();const channel=supabase.channel('my-profile-avatar').on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},()=>load()).subscribe();return()=>{supabase.removeChannel(channel)}},[]);
 async function load(){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('profiles').select('full_name,avatar_url').eq('id',user.id).maybeSingle();setName(data?.full_name||user.user_metadata?.full_name||user.email||'');setAvatar(data?.avatar_url||null)}
 return <button className="avatar profile-avatar" title={name}>{avatar?<img src={avatar} alt=""/>:<span>{initials(name)}</span>}</button>
}
