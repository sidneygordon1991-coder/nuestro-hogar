import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({getSession: vi.fn(), signOut: vi.fn(), from: vi.fn()}));
vi.mock('./supabase', () => ({
  supabase: {auth: {getSession: mocks.getSession, signOut: mocks.signOut}, from: mocks.from}
}));
import {signOutDevice} from './signOut';
describe('device sign out', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({data: {session: {user: {id: 'previous-user'}}}});
    mocks.signOut.mockResolvedValue({error: null});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('removes only the current user endpoint before unsubscribing and signing out', async () => {
    const eq = vi.fn();
    eq.mockReturnValue({eq});
    mocks.from.mockReturnValue({delete: () => ({eq})});
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {getSubscription: async () => ({endpoint: 'https://push.example/device', unsubscribe})}
        })
      }
    });
    await signOutDevice();
    expect(eq.mock.calls).toEqual([
      ['endpoint', 'https://push.example/device'],
      ['user_id', 'previous-user']
    ]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('signs out within 2.5 seconds even if service worker discovery hangs', async () => {
    vi.stubGlobal('navigator', {serviceWorker: {getRegistration: () => new Promise(() => {})}});
    const signingOut = signOutDevice();
    await vi.advanceTimersByTimeAsync(2500);
    await signingOut;
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it('still signs out when push cleanup is unavailable', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: async () => {
          throw new Error('blocked');
        }
      }
    });
    await signOutDevice();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
