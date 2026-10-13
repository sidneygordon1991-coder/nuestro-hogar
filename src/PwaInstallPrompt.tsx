import {useEffect,useState} from 'react';
import {Download,Home,X} from 'lucide-react';

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>};

export default function PwaInstallPrompt(){
 const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null),[hidden,setHidden]=useState(false);
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
  if(standalone)return;
  const before=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallEvent)};
  const installed=()=>{setInstallEvent(null);setHidden(true)};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installed);
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installed)};
 },[]);
 if(!installEvent||hidden)return null;
 async function install(){await installEvent!.prompt();const choice=await installEvent!.userChoice;if(choice.outcome==='accepted')setHidden(true);setInstallEvent(null)}
 return <aside className="pwa-install"><span className="pwa-install-icon"><Home/></span><div><strong>Instalar Nuestro Hogar</strong><small>Ábrelo como una app desde tu teléfono y tenlo siempre a mano.</small></div><button className="pwa-install-button" onClick={install}><Download/> Instalar</button><button className="pwa-install-close" onClick={()=>setHidden(true)} aria-label="Cerrar"><X/></button></aside>
}
