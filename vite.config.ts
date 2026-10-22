import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {getAppConfig} from './src/lib/appConfig';

export default defineConfig(({command, mode}) => {
  if (command === 'build') getAppConfig({...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env});
  return {
    plugins: [react()],
    base: '/nuestro-hogar/',
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase';
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          }
        }
      }
    }
  };
});
