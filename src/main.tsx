import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import {initializeTheme} from './AppMenu';import './styles.css';import './theme-light.css';initializeTheme();import './premium.css';import './studio.css';import './experience.css';import './refinement.css';import './daily-flow.css';import './workspace-header.css';ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL}).then(registration=>{
  registration.update().catch(()=>undefined);
  if(registration.waiting)window.dispatchEvent(new CustomEvent('nh:update-ready',{detail:{registration}}));
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)window.dispatchEvent(new CustomEvent('nh:update-ready',{detail:{registration}}))});
  });
 }).catch(()=>undefined)})}
