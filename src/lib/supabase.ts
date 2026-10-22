import {createClient} from '@supabase/supabase-js';
import {getAppConfig} from './appConfig';
const config = getAppConfig({
  VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
});
export const supabase = createClient(config.url, config.publishableKey);
