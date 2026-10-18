import {describe, expect, it} from 'vitest';
import {
  appearanceAccents,
  appearanceKey,
  defaultAppearance,
  normalizeAppearance,
  readScope,
  saveScope,
  scopeKey
} from './appearance';
describe('device appearance preferences', () => {
  it('offers green, blue, black and purple, keeping saved preferences and mapping retired finishes', () => {
    expect(appearanceAccents.map(a => a.id)).toEqual(['forest', 'ocean', 'graphite', 'iris']);
    expect(appearanceAccents.map(a => a.label)).toEqual(['Verde', 'Azul', 'Negro', 'Morado']);
    for (const {id} of appearanceAccents) expect(normalizeAppearance({accent: id}).accent).toBe(id);
    expect(normalizeAppearance({accent: 'aurora'}).accent).toBe('iris');
    expect(defaultAppearance.accent).toBe('forest');
  });
  it('remembers the finance lens per account and household, defaulting to the shared view', () => {
    const store = new Map<string, string>();
    const previous = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      }
    };
    try {
      expect(scopeKey('a', 'h')).not.toBe(scopeKey('a', 'other'));
      expect(readScope(scopeKey('a', 'h'))).toBe('household');
      saveScope(scopeKey('a', 'h'), 'personal');
      expect(readScope(scopeKey('a', 'h'))).toBe('personal');
      store.set(scopeKey('a', 'h'), 'garbage');
      expect(readScope(scopeKey('a', 'h'))).toBe('household');
    } finally {
      (globalThis as any).localStorage = previous;
    }
  });
  it('accepts valid preferences and removes unknown or duplicate favorite modules', () => {
    expect(
      normalizeAppearance({accent: 'forest', focus: 'plans', favorites: ['listas', 'bad', 'listas', 'familia']})
    ).toEqual({accent: 'forest', focus: 'plans', view: 'essential', favorites: ['listas', 'familia'], cover: ''});
  });
  it('starts simple (essential) by default and keeps a saved complete view', () => {
    expect(normalizeAppearance({}).view).toBe('essential');
    expect(normalizeAppearance({view: 'complete'}).view).toBe('complete');
    expect(normalizeAppearance({view: 'essential'}).view).toBe('essential');
  });
  it('rejects remote, SVG and oversized covers while retaining supported raster data', () => {
    for (const cover of [
      'https://example.invalid/photo.png',
      'data:image/svg+xml;base64,AAAA',
      'data:image/png;base64,' + 'A'.repeat(900001)
    ])
      expect(normalizeAppearance({cover}).cover).toBe('');
    expect(normalizeAppearance({cover: 'data:image/png;base64,AAAA'}).cover).toBe('data:image/png;base64,AAAA');
  });
  it('keeps preferences separated by both authenticated account and household', () => {
    expect(appearanceKey('a', 'home')).not.toBe(appearanceKey('b', 'home'));
    expect(appearanceKey('a', 'home')).not.toBe(appearanceKey('a', 'other'));
  });
  it('recovers malformed values and limits favorites without inventing financial data', () => {
    expect(normalizeAppearance(null)).toEqual(defaultAppearance);
    expect(normalizeAppearance({accent: 'other', focus: 'other', favorites: []})).toEqual({
      ...defaultAppearance,
      favorites: []
    });
  });
});
