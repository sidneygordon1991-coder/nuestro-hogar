import {describe, expect, it} from 'vitest';
import {authCallbackError, emailAuthMessage} from './emailAuth';
describe('verified email access errors', () => {
  it('handles expired or already-used links and malformed URL descriptions without throwing', () => {
    expect(authCallbackError('#error=access_denied&error_code=otp_expired&error_description=Invalid+token')).toContain(
      'venció'
    );
    expect(() => authCallbackError('#error_description=100%25')).not.toThrow();
    expect(authCallbackError('#access_token=valid-session')).toBe('');
  });
  it('does not claim delivery when the recipient or SMTP service is not allowed', () => {
    expect(emailAuthMessage({code: 'email_address_not_authorized'})).toContain('remitente');
    expect(emailAuthMessage({message: 'Error sending confirmation email'})).toContain('No pudimos enviar');
  });
  it('distinguishes rate limits, wrong passwords and unconfirmed addresses', () => {
    expect(emailAuthMessage({code: 'over_email_send_rate_limit'})).toContain('Espera');
    expect(emailAuthMessage({code: 'invalid_credentials'})).toContain('contraseña');
    expect(emailAuthMessage({code: 'email_not_confirmed'})).toContain('confirmar');
  });
});
