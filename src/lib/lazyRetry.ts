import {lazy, type ComponentType} from 'react';

const KEY = 'nh:chunk-reload';
/**
 * After a new version is published, a tab still running the old code may request module files that no longer
 * exist. Reload once to pick up the new version instead of showing the error screen; a second failure is real.
 */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{default: T}>) {
  return lazy(() =>
    factory()
      .then(module => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* storage unavailable */
        }
        return module;
      })
      .catch(error => {
        let retried = false;
        try {
          retried = sessionStorage.getItem(KEY) === '1';
          if (!retried) sessionStorage.setItem(KEY, '1');
        } catch {
          retried = true;
        }
        if (!retried) {
          window.location.reload();
          return new Promise<{default: T}>(() => undefined);
        }
        throw error;
      })
  );
}
