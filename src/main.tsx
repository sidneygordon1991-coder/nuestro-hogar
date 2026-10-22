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
// Keep the shell styles eager so loading App later cannot override the final refinements.
import './styles/components/sharing.css';
import './styles/components/master.css';
import './styles/modules/payment-budget.css';
import './styles/components/quick-entry.css';
import './styles/components/notifications.css';
import {getAppConfig} from './lib/appConfig';
import {AppEnvironment, AppStartupBoundary, ConfigurationError} from './AppEnvironment';
// Validate before loading App: its modules initialize the Supabase client at import time.
const App = React.lazy(() => import('./App'));
import './styles/components/ui.css';
import './styles/components/optional.css';
import './styles/refinements.css';
import './styles/layers/clarity.css';
let content: React.ReactNode;
let configured = false;
try {
  const config = getAppConfig(import.meta.env);
  configured = true;
  content = (
    <>
      <AppEnvironment environment={config.environment} />
      <AppStartupBoundary>
        <React.Suspense fallback={<p role="status">Cargando Nuestro Hogar…</p>}>
          <App />
        </React.Suspense>
      </AppStartupBoundary>
    </>
  );
} catch (error) {
  content = <ConfigurationError message={(error as Error).message} />;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{content}</React.StrictMode>);
if (configured && import.meta.env.VITE_APP_ENV === 'production' && 'serviceWorker' in navigator) {
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
