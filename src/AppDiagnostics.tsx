import {Component, ErrorInfo, ReactNode, useEffect} from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';
import {supabase} from './lib/supabase';

const APP_VERSION = 'v32';

function report(
  householdId: string,
  source: string,
  message: string,
  stack?: string | null,
  context: Record<string, unknown> = {}
) {
  void supabase
    .rpc('log_client_error', {
      p_household_id: householdId,
      p_source: source,
      p_message: String(message || 'Error desconocido').slice(0, 1000),
      p_stack: stack || null,
      p_context: context,
      p_app_version: APP_VERSION,
      p_url: window.location.href,
      p_user_agent: navigator.userAgent
    })
    .then(
      () => {},
      () => {}
    );
}

export function ClientErrorReporter({householdId}: {householdId: string}) {
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      report(householdId, 'window.error', event.message, event.error?.stack || null, {
        filename: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null
      });
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Promesa rechazada sin manejar';
      const stack = reason instanceof Error ? reason.stack || null : null;
      report(householdId, 'unhandledrejection', message, stack, {
        reason_type: reason?.constructor?.name || typeof reason
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, [householdId]);
  return null;
}

export class AppErrorBoundary extends Component<{householdId: string; children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {
    return {failed: true};
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    report(this.props.householdId, 'react.error-boundary', error.message, error.stack || null, {
      component_stack: info.componentStack?.slice(0, 3000) || null
    });
  }
  render() {
    if (this.state.failed)
      return (
        <main className="error-boundary-page">
          <section>
            <span>
              <AlertTriangle />
            </span>
            <p className="eyebrow">Recuperación segura</p>
            <h1>Algo no cargó correctamente</h1>
            <p>
              El error técnico quedó registrado para diagnóstico. Recarga la aplicación para intentar recuperar la
              sesión.
            </p>
            <button onClick={() => window.location.reload()}>
              <RefreshCw /> Recargar Nuestro Hogar
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}
