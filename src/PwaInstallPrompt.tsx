import ModuleIcon from './ModuleIcon';
import {useEffect,useState} from 'react';
import {Download,Info,X} from 'lucide-react';

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>};
const DISMISS_KEY='nh:install-dismissed-at',DISMISS_DAYS=30;
/** A closed suggestion stays hidden for a month on this device instead of returning on every visit. */
function dismissedRecently(){try{const at=Number(localStorage.getItem(DISMISS_KEY)||0);return at>0&&Date.now()-at<DISMISS_DAYS*86400000}catch{return false}}

export default function PwaInstallPrompt(){
 const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null),[hidden,setHidden]=useState(dismissedRecently),[showHelp,setShowHelp]=useState(false),[installed,setInstalled]=useState(false);
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
  if(standalone){setInstalled(true);return}
  const help=()=>setShowHelp(true);window.addEventListener('nh:install-help',help);
  const before=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallEvent)};
  const installedHandler=()=>{setInstallEvent(null);setInstalled(true);setHidden(true)};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installedHandler);
  return()=>{window.removeEventListener('nh:install-help',help);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installedHandler)};
 },[]);
 useEffect(()=>{if(!showHelp)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setShowHelp(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[showHelp]);
 if(installed)return null;
 const ua=navigator.userAgent.toLowerCase(),isIOS=/iphone|ipad|ipod/.test(ua)||(/macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 // The banner appears only when installing is actually possible here: a browser install prompt, or Safari on iPhone/iPad.
 const canSuggest=Boolean(installEvent)||(isIOS&&/safari/.test(ua)&&!/crios|fxios|edgios/.test(ua));
 async function install(){
  if(installEvent){await installEvent.prompt();const choice=await installEvent.userChoice;if(choice.outcome==='accepted')setHidden(true);setInstallEvent(null)}
  else setShowHelp(true);
 }
 return <>
  {!hidden&&canSuggest&&<aside className="pwa-install"><span className="pwa-install-icon"><ModuleIcon name="home"/></span><div><strong>Instalar Nuestro Hogar</strong><small>{installEvent?'Instálalo como app en este dispositivo.':'Si no aparece el instalador automático, te mostramos cómo hacerlo.'}</small></div><button className="pwa-install-button" onClick={install}>{installEvent?<Download/>:<Info/>}{installEvent?'Instalar':'Cómo instalar'}</button><button className="pwa-install-close" onClick={()=>{setHidden(true);try{localStorage.setItem(DISMISS_KEY,String(Date.now()))}catch{}}} aria-label="Cerrar sugerencia de instalación"><X/></button></aside>}
  {showHelp&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowHelp(false)}}><div className="finance-modal pwa-help" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title"><div className="modal-head"><h3 id="pwa-help-title">Instalar Nuestro Hogar</h3><button type="button" aria-label="Cerrar instrucciones" onClick={()=>setShowHelp(false)}><X/></button></div><div className="pwa-help-body"><p>Si abriste el enlace dentro de ChatGPT, WhatsApp u otra app, primero usa <strong>Abrir en Chrome</strong> o <strong>Abrir en Safari</strong>.</p>{isIOS?<ol><li>Abre Nuestro Hogar en Safari.</li><li>Toca el botón <strong>Compartir</strong>.</li><li>Selecciona <strong>Agregar a pantalla de inicio</strong>.</li><li>Confirma con <strong>Agregar</strong>.</li></ol>:<ol><li>Abre Nuestro Hogar en Chrome.</li><li>Toca el menú <strong>⋮</strong>.</li><li>Selecciona <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</li><li>Confirma la instalación.</li></ol>}<p className="pwa-help-note">Después se abrirá en una ventana independiente, como una app normal.</p></div></div></div>}
 </>;
}
