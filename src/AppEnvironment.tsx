import {Component, type ReactNode} from 'react';
import type {AppEnvironment as Environment} from './lib/appConfig';

/** The first application chunk can fail before App's own error boundary has loaded. */
export class AppStartupBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {
    return {failed: true};
  }
  render() {
    if (this.state.failed)
      return (
        <main className="auth">
          <section className="auth-card" role="alert">
            <h1>No pudimos abrir Nuestro Hogar</h1>
            <p>La aplicación no terminó de cargar. Puedes intentar abrirla de nuevo.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Volver a cargar
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}

export function AppEnvironment({environment}: {environment: Environment}) {
  if (environment === 'production') return null;
  return (
    <aside className="app-environment" aria-label="Entorno de la aplicación">
      {environment === 'test' ? 'Pruebas automatizadas · datos simulados' : 'Entorno de pruebas'}
    </aside>
  );
}

export function ConfigurationError({message}: {message: string}) {
  return (
    <main className="auth">
      <section className="auth-card" role="alert">
        <h1>Falta configurar este entorno</h1>
        <p>{message}</p>
        <p>Revisa la configuración del entorno y vuelve a iniciar la aplicación.</p>
      </section>
    </main>
  );
}
