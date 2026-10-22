export type AppEnvironment = 'production' | 'staging' | 'test';
type Environment = Record<string, string | boolean | undefined>;
const productionHost = 'dchihxrjtngwabbvsqap.supabase.co';

/** No implicit backend: a missing or mislabeled environment must fail before creating a client. */
export function getAppConfig(env: Environment) {
  const environment = env.VITE_APP_ENV;
  if (!['production', 'staging', 'test'].includes(String(environment)))
    throw new Error('Define VITE_APP_ENV como production, staging o test.');
  const rawUrl = String(env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!rawUrl || !publishableKey)
    throw new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('VITE_SUPABASE_URL debe ser una URL válida.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Usa la URL HTTPS del proyecto Supabase, o HTTP únicamente para un backend local.');
  if (!publishableKey.startsWith('sb_publishable_') || publishableKey.length <= 'sb_publishable_'.length)
    throw new Error('Usa una clave publicable de Supabase en el cliente.');
  if (environment !== 'production' && url.hostname === productionHost)
    throw new Error('El entorno de pruebas no puede conectarse al proyecto de producción. Configura otro proyecto.');
  if (environment === 'production' && local)
    throw new Error('La publicación de producción requiere un proyecto Supabase remoto.');
  return {environment: environment as AppEnvironment, url: url.origin, publishableKey};
}
