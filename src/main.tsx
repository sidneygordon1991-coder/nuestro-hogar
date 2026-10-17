import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import {initializeTheme} from './AppMenu';import './styles.css';import './theme-light.css';initializeTheme();import './premium.css';import './studio.css';import './experience.css';import './refinement.css';import './daily-flow.css';import './workspace-header.css';import './connected-finance.css';import './shell.css';import './home.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if('serviceWorker' in navigator){
 // A background tab that is still on the previous version reloads when another tab activates the update.
 const hadController=Boolean(navigator.serviceWorker.controller);let refreshing=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController||refreshing||document.visibilityState==='visible')return;refreshing=true;window.location.reload()});
 window.addEventListener('load',()=>{navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL}).then(registration=>{
  registration.update().catch(()=>undefined);
  if(registration.waiting)window.dispatchEvent(new CustomEvent('nh:update-ready',{detail:{registration}}));
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)window.dispatchEvent(new CustomEvent('nh:update-ready',{detail:{registration}}))});
  });
 }).catch(()=>undefined)})}
