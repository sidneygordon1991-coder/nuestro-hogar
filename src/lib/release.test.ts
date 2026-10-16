import {describe,expect,it} from 'vitest';
import manifestRaw from '../../public/manifest.webmanifest?raw';
import serviceWorkerRaw from '../../public/sw.js?raw';
import indexRaw from '../../index.html?raw';
import supabaseClientRaw from './supabase.ts?raw';

describe('commercial release safeguards',()=>{
  it('keeps the PWA scoped to the GitHub Pages application path',()=>{
    const manifest=JSON.parse(manifestRaw);
    expect(manifest.start_url).toBe('/nuestro-hogar/');
    expect(manifest.scope).toBe('/nuestro-hogar/');
    expect(manifest.display).toBe('standalone');
  });

  it('ships installable raster icons with a maskable option',()=>{
    const manifest=JSON.parse(manifestRaw);
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({src:'/nuestro-hogar/icon-192.png',sizes:'192x192',type:'image/png'}),
      expect.objectContaining({src:'/nuestro-hogar/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}),
      expect.objectContaining({src:'/nuestro-hogar/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'})
    ]));
    expect(indexRaw).toContain('apple-touch-icon');
    expect(indexRaw).toContain('icon-192.png');
  });

  it('keeps the service worker lifecycle and offline shell protections',()=>{
    expect(serviceWorkerRaw).toContain("nuestro-hogar-v25");
    expect(serviceWorkerRaw).toContain("self.clients.claim()");
    expect(serviceWorkerRaw).toContain("SKIP_WAITING");
    expect(serviceWorkerRaw).toContain("icon-192.png");
    expect(serviceWorkerRaw).toContain("icon-512.png");
  });

  it('never embeds elevated Supabase credentials in the public client',()=>{
    expect(supabaseClientRaw).not.toContain('sb_secret_');
    expect(supabaseClientRaw).not.toContain('service_role');
    expect(supabaseClientRaw).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
  });
});
