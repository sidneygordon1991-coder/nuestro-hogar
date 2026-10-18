import React from 'react';
import ReactDOM from 'react-dom/client';
import {initializeTheme} from './AppMenu';
import './styles.css';
import './styles/theme.css';
initializeTheme();
import './styles/layers/premium.css';
import './styles/layers/studio.css';
import './styles/layers/experience.css';
import './styles/layers/refinement.css';
import './styles/layers/daily-flow.css';
import './styles/layers/workspace-header.css';
import './styles/layers/connected-finance.css';
import './styles/layers/shell.css';
import './styles/layers/home.css';
// Global styles load first; App (and the stylesheets its modules import) comes after, and v32 refinements last.
import App from './App';
import './styles/components/ui.css';
import './styles/components/optional.css';
import './styles/refinements.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
if ('serviceWorker' in navigator) {
  // A background tab that is still on the previous version reloads when another tab activates the update.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing || document.visibilityState === 'visible') return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL})
      .then(registration => {
        registration.update().catch(() => undefined);
        if (registration.waiting) window.dispatchEvent(new CustomEvent('nh:update-ready', {detail: {registration}}));
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              window.dispatchEvent(new CustomEvent('nh:update-ready', {detail: {registration}}));
          });
        });
      })
      .catch(() => undefined);
  });
}
