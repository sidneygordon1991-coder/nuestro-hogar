import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {goalMilestone, goalPhotoKey, readGoalPhoto, saveGoalPhoto} from './goalVisuals';
describe('goal milestones based on net savings', () => {
  it('never announces a rounded milestone before the exact saved amount reaches it', () => {
    expect(goalMilestone(24.99, 100)).toEqual({reached: 0, next: 25, remaining: 0.01});
    expect(goalMilestone(25, 100)).toEqual({reached: 25, next: 50, remaining: 25});
    expect(goalMilestone(75, 100)).toEqual({reached: 75, next: 100, remaining: 25});
    expect(goalMilestone(110, 100)).toEqual({reached: 100, next: null, remaining: 0});
  });
  it('reflects withdrawals and does not invent progress without a valid target', () => {
    expect(goalMilestone(20, 100)).toEqual({reached: 0, next: 25, remaining: 5});
    expect(goalMilestone(-10, 100)).toEqual({reached: 0, next: 25, remaining: 25});
    expect(goalMilestone(100, 0)).toBeNull();
    expect(goalMilestone(100, NaN)).toBeNull();
  });
});
describe('personal goal photos', () => {
  const image = 'data:image/png;base64,aGVsbG8=',
    storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    vi.stubGlobal('window', {dispatchEvent: vi.fn()});
  });
  afterEach(() => vi.unstubAllGlobals());
  it('isolates a photo by user, household and goal and supports removing it', () => {
    const key = goalPhotoKey('me', 'home', 'trip');
    saveGoalPhoto(key, image);
    expect(readGoalPhoto(key)).toBe(image);
    for (const other of [
      goalPhotoKey('other', 'home', 'trip'),
      goalPhotoKey('me', 'other', 'trip'),
      goalPhotoKey('me', 'home', 'other')
    ])
      expect(readGoalPhoto(other)).toBe('');
    saveGoalPhoto(key, '');
    expect(readGoalPhoto(key)).toBe('');
  });
  it('rejects remote URLs and unsafe image formats and reports storage failures', () => {
    expect(() => saveGoalPhoto('key', 'https://example.com/photo.png')).toThrow();
    storage.set('key', 'data:image/svg+xml;base64,PHN2Zz4=');
    expect(readGoalPhoto('key')).toBe('');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('quota');
      }
    });
    expect(readGoalPhoto('key')).toBe('');
    expect(() => saveGoalPhoto('key', image)).toThrow(/espacio/);
  });
});
