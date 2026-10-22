import type {AppEnvironment as Environment} from './lib/appConfig';

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
