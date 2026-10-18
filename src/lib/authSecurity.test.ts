import {describe, expect, it} from 'vitest';
import {validateStrongPassword} from './authSecurity';

describe('password policy', () => {
  it('accepts a strong password', () => {
    expect(validateStrongPassword('Hogar2026!Seguro')).toEqual({ok: true});
  });
  it('rejects passwords that are too short', () => {
    expect(validateStrongPassword('Aa1!short').ok).toBe(false);
  });
  it('requires upper, lower, digit and symbol', () => {
    expect(validateStrongPassword('hogar2026!seguro').ok).toBe(false);
    expect(validateStrongPassword('HOGAR2026!SEGURO').ok).toBe(false);
    expect(validateStrongPassword('HogarSeguro!').ok).toBe(false);
    expect(validateStrongPassword('Hogar2026Seguro').ok).toBe(false);
  });
});
