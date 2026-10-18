import {describe, expect, it} from 'vitest';
import {draftKey, draftLifetime, parseDraft} from './formDrafts';
describe('scoped, bounded local drafts', () => {
  const now = Date.now(),
    draft = {
      version: 1,
      requestId: '12345678-1234-4234-8234-123456789abc',
      updatedAt: now,
      fields: {amount: '10.25', shared: false},
      attempted: true
    };
  it('retains request identity and false checkboxes after a lost response', () =>
    expect(parseDraft(JSON.stringify(draft), now)).toEqual(draft));
  it('rejects expired, invalid, huge or malformed drafts', () => {
    for (const value of [
      'bad',
      JSON.stringify({...draft, updatedAt: now - draftLifetime - 1}),
      JSON.stringify({...draft, requestId: 'bad'}),
      JSON.stringify({...draft, fields: {amount: 'a'.repeat(4001)}})
    ])
      expect(parseDraft(value, now)).toBeNull();
  });
  it('separates users, homes and forms', () => {
    expect(
      new Set([
        draftKey('a', 'h', 'expense'),
        draftKey('b', 'h', 'expense'),
        draftKey('a', 'x', 'expense'),
        draftKey('a', 'h', 'income')
      ]).size
    ).toBe(4);
  });
});
