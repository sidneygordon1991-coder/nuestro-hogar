import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {readQuickChoices, rememberQuickChoices} from './quickPreferences';
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value)
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('successful quick-entry preferences', () => {
  it('isolates accounts, households and movement types without retaining financial contents', () => {
    rememberQuickChoices('owner', 'home', 'expense', {category: 'food', account: 'bank'});
    rememberQuickChoices('owner', 'home', 'income', {category: 'salary', account: 'cash'});
    expect(readQuickChoices('owner', 'home')).toEqual({
      expense: {category: 'food', account: 'bank'},
      income: {category: 'salary', account: 'cash'}
    });
    expect(readQuickChoices('other', 'home')).toEqual({});
    expect(readQuickChoices('owner', 'other')).toEqual({});
    expect(readQuickChoices('', 'home')).toEqual({});
  });
  it('recovers malformed storage and tolerates unavailable browser storage', () => {
    store.set('nh:quick-choices:owner:home', '{broken');
    expect(readQuickChoices('owner', 'home')).toEqual({});
    store.set('nh:quick-choices:owner:home', JSON.stringify({expense: {category: 5, account: {}}, income: null}));
    expect(readQuickChoices('owner', 'home')).toEqual({});
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      }
    });
    expect(() => rememberQuickChoices('owner', 'home', 'expense', {category: 'food', account: 'bank'})).not.toThrow();
    expect(readQuickChoices('owner', 'home')).toEqual({});
  });
});
