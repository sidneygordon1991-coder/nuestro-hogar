import {useEffect, useState} from 'react';
import {RefreshCw, X} from 'lucide-react';

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null),
    [hidden, setHidden] = useState(false),
    [updating, setUpdating] = useState(false);

  useEffect(() => {
    const ready = (event: Event) => {
      const detail = (event as CustomEvent<{registration?: ServiceWorkerRegistration}>).detail;
      setRegistration(detail?.registration || null);
      setHidden(false);
    };
    window.addEventListener('nh:update-ready', ready as EventListener);
    if ('serviceWorker' in navigator)
      navigator.serviceWorker
        .getRegistration()
        .then(reg => {
          if (reg?.waiting) setRegistration(reg);
        })
        .catch(() => undefined);
    return () => window.removeEventListener('nh:update-ready', ready as EventListener);
  }, []);

  async function apply() {
    if (!registration?.waiting) return;
    setUpdating(true);
    let reloaded = false;
    const changed = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed, {once: true});
    registration.waiting.postMessage({type: 'SKIP_WAITING'});
    window.setTimeout(() => {
      if (!reloaded) window.location.reload();
    }, 3500);
  }

  if (!registration || hidden) return null;
  return (
    <aside className="pwa-update" role="status" aria-live="polite">
      <span>
        <RefreshCw />
      </span>
      <div>
        <strong>Nueva versión disponible</strong>
        <small>Actualiza para usar las últimas mejoras sin perder tu sesión.</small>
      </div>
      <button onClick={apply} disabled={updating}>
        <RefreshCw />
        {updating ? 'Actualizando...' : 'Actualizar ahora'}
      </button>
      <button className="pwa-update-close" onClick={() => setHidden(true)} aria-label="Posponer actualización">
        <X />
      </button>
    </aside>
  );
}
