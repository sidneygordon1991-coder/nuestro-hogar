import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
});
