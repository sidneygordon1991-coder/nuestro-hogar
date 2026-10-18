export const EMAIL_RESEND_DELAY = 60;
export function emailAuthMessage(error: unknown): string {
  const value = error && typeof error === 'object' ? (error as {code?: string; message?: string}) : {};
  const code = value.code || '',
    message = value.message || '';
  if (code === 'otp_expired' || /expired|invalid.*(link|token)|access_denied/i.test(code + ' ' + message))
    return 'El enlace venció o ya fue utilizado. Solicita uno nuevo para entrar.';
  if (code === 'email_address_not_authorized' || /email address.*not authorized/i.test(message))
    return 'El servicio de correo todavía no permite enviar a esta dirección. El administrador debe configurar el remitente de correo de Nuestro Hogar.';
  if (/rate_limit|too many requests/i.test(code + ' ' + message))
    return 'Se solicitaron varios correos seguidos. Espera un momento antes de volver a intentarlo.';
  if (code === 'invalid_credentials') return 'El correo o la contraseña no son correctos.';
  if (code === 'email_not_confirmed')
    return 'Necesitas confirmar tu correo. Usa el acceso por enlace para verificarlo.';
  if (code === 'signup_disabled' || code === 'email_provider_disabled')
    return 'El acceso por correo no está disponible en este momento. Contacta al administrador.';
  if (code === 'email_address_invalid' || /invalid email/i.test(message))
    return 'Revisa que el correo electrónico esté bien escrito.';
  if (/failed to fetch|network|fetch failed/i.test(message))
    return 'No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (/sending|smtp|email/i.test(message))
    return 'No pudimos enviar el correo. Inténtalo más tarde o contacta al administrador para revisar el servicio de envío.';
  return 'No pudimos completar la solicitud. Inténtalo nuevamente.';
}
export function authCallbackError(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('error') && !params.has('error_code') && !params.has('error_description')) return '';
  return emailAuthMessage({
    code: params.get('error_code') || params.get('error') || '',
    message: params.get('error_description') || ''
  });
}
