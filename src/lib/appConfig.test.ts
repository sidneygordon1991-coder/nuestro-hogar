import {describe, expect, it} from 'vitest';
import {getAppConfig} from './appConfig';

const staging = {
  VITE_APP_ENV: 'staging',
  VITE_SUPABASE_URL: 'https://staging-example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture'
};

describe('explicit backend configuration', () => {
  it('requires all settings without falling back to production', () => {
    expect(() => getAppConfig({})).toThrow('VITE_APP_ENV');
    for (const name of Object.keys(staging)) expect(() => getAppConfig({...staging, [name]: ''})).toThrow();
  });
  it('accepts a separate staging project and a local Supabase instance', () => {
    expect(getAppConfig(staging)).toMatchObject({environment: 'staging', url: staging.VITE_SUPABASE_URL});
    expect(getAppConfig({...staging, VITE_SUPABASE_URL: 'http://127.0.0.1:54321'}).url).toBe('http://127.0.0.1:54321');
  });
  it('blocks production data in staging and automated tests', () => {
    for (const environment of ['staging', 'test'])
      expect(() =>
        getAppConfig({
          ...staging,
          VITE_APP_ENV: environment,
          VITE_SUPABASE_URL: 'https://dchihxrjtngwabbvsqap.supabase.co'
        })
      ).toThrow('producción');
    expect(
      getAppConfig({
        ...staging,
        VITE_APP_ENV: 'production',
        VITE_SUPABASE_URL: 'https://dchihxrjtngwabbvsqap.supabase.co'
      }).environment
    ).toBe('production');
  });
  it('rejects unsafe endpoints and keys without exposing their values', () => {
    for (const url of [
      'invalid',
      'http://staging-example.supabase.co',
      'https://user:password@staging-example.supabase.co',
      'https://staging-example.supabase.co/rest/v1',
      'https://staging-example.supabase.co?key=private',
      'https://staging-example.supabase.co#fragment'
    ])
      expect(() => getAppConfig({...staging, VITE_SUPABASE_URL: url})).toThrow();
    for (const key of ['sb_secret_private', 'service_role', 'sb_publishable_']) {
      try {
        getAppConfig({...staging, VITE_SUPABASE_PUBLISHABLE_KEY: key});
        expect.fail('An invalid key was accepted');
      } catch (error) {
        expect((error as Error).message).toContain('publicable');
        expect((error as Error).message).not.toContain(key);
      }
    }
    expect(() =>
      getAppConfig({...staging, VITE_APP_ENV: 'production', VITE_SUPABASE_URL: 'http://localhost:54321'})
    ).toThrow('remoto');
  });
});
