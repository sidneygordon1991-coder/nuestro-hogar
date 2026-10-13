import {useEffect,useState} from 'react';
import {Download,Home,Info,X} from 'lucide-react';

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>};

export default function PwaInstallPrompt(){
 const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null),[hidden,setHidden]=useState(false),[showHelp,setShowHelp]=useState(false),[installed,setInstalled]=useState(false);
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
  if(standalone){setInstalled(true);return}
  const before=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallEvent)};
  const installedHandler=()=>{setInstallEvent(null);setInstalled(true);setHidden(true)};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installedHandler);
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installedHandler)};
 },[]);
 if(installed||hidden)return null;
 const ua=navigator.userAgent.toLowerCase(),isIOS=/iphone|ipad|ipod/.test(ua);
 async function install(){
  if(installEvent){await installEvent.prompt();const choice=await installEvent.userChoice;if(choice.outcome==='accepted')setHidden(true);setInstallEvent(null)}
  else setShowHelp(true);
 }
 return <>
  <aside className="pwa-install"><span className="pwa-install-icon"><Home/></span><div><strong>Instalar Nuestro Hogar</strong><small>{installEvent?'Instálalo como app en este dispositivo.':'Si no aparece el instalador automático, te mostramos cómo hacerlo.'}</small></div><button className="pwa-install-button" onClick={install}>{installEvent?<Download/>:<Info/>}{installEvent?'Instalar':'Cómo instalar'}</button><button className="pwa-install-close" onClick={()=>setHidden(true)} aria-label="Cerrar"><X/></button></aside>
  {showHelp&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowHelp(false)}}><div className="finance-modal pwa-help"><div className="modal-head"><h3>Instalar Nuestro Hogar</h3><button onClick={()=>setShowHelp(false)}><X/></button></div><div className="pwa-help-body"><p>Si abriste el enlace dentro de ChatGPT, WhatsApp u otra app, primero usa <strong>Abrir en Chrome</strong> o <strong>Abrir en Safari</strong>.</p>{isIOS?<ol><li>Abre Nuestro Hogar en Safari.</li><li>Toca el botón <strong>Compartir</strong>.</li><li>Selecciona <strong>Agregar a pantalla de inicio</strong>.</li><li>Confirma con <strong>Agregar</strong>.</li></ol>:<ol><li>Abre Nuestro Hogar en Chrome.</li><li>Toca el menú <strong>⋮</strong>.</li><li>Selecciona <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</li><li>Confirma la instalación.</li></ol>}<p className="pwa-help-note">Después se abrirá en una ventana independiente, como una app normal.</p></div></div></div>}
 </>;
}
