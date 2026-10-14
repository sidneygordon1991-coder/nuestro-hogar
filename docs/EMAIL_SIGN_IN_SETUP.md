# Acceso por correo verificado

La entrada principal solicita un correo y usa `signInWithOtp` con `shouldCreateUser:true` y `emailRedirectTo` a la aplicación. La persona recibe un enlace de un solo uso; Supabase verifica su correo y crea o recupera su cuenta antes de establecer la sesión. No se crea una familia ni se asigna master al solicitar el enlace. El alta del hogar ocurre después del acceso; la autorización master y su MFA se conservan.

Las cuentas que ya tienen contraseña conservan la opción "Ya tengo contraseña · usarla", además de recuperación. El acceso por Google ya no se ofrece. No se necesita un cliente OAuth de Google. No se desactiva la confirmación de correo.

## Configuración del proyecto

En Supabase Authentication > URL Configuration:

- Site URL: `https://sidneygordon1991-coder.github.io/nuestro-hogar/`
- Redirect URL permitida: `https://sidneygordon1991-coder.github.io/nuestro-hogar/`

En Authentication > Sign In / Providers > Email, conservar correo habilitado y confirmación obligatoria. El cliente público comprobó `external.email=true`, `disable_signup=false` y `mailer_autoconfirm=false`; esos valores no prueban que exista SMTP personalizado.

## Envío real a otras familias

Supabase exige configurar SMTP personalizado para entregar a destinatarios ajenos al equipo del proyecto. Su servicio predeterminado es de prueba, tiene límites reducidos y rechaza direcciones no autorizadas. Revisar Authentication > Email > SMTP Settings (o Authentication > SMTP según el panel) y conectar un servicio SMTP con remitente permitido.

La configuración requiere host, puerto, usuario, contraseña SMTP, correo remitente y nombre de remitente. Introducir las credenciales únicamente en Supabase; no en GitHub, en la aplicación pública ni en el chat. Elegir un proveedor con un remitente validado y revisar sus condiciones y límites antes de habilitarlo. La configuración SMTP privada no es visible en `/auth/v1/settings`, y las herramientas disponibles en esta sesión no permiten leerla ni modificarla. No se afirma que la entrega externa haya sido validada hasta realizar la prueba real.

En Email Templates, las plantillas Magic Link y Confirm signup deben conservar un enlace a `{{ .ConfirmationURL }}`. Un ejemplo para ambas:

```html
<h2>Accede a Nuestro Hogar</h2>
<p>Usa este enlace para verificar tu correo y entrar:</p>
<p><a href="{{ .ConfirmationURL }}">Verificar correo y entrar</a></p>
<p>Si no solicitaste este acceso, puedes ignorar este mensaje.</p>
```

La plantilla de recuperación de contraseña sigue siendo independiente. No sustituir `ConfirmationURL` por un enlace directo a la app, porque omitiría la verificación.

## Prueba final

Solicitar un enlace desde Chrome con una cuenta autorizada para la prueba y abrir el correo más reciente. Verificar regreso a la aplicación, cuenta/familia correctas, creación o unión de un hogar nuevo, acceso existente con contraseña y exigencia de autenticador al abrir master. Repetir con una cuenta de otra familia después de configurar SMTP. No iniciar pruebas de correo a terceros sin autorización.

Un enlace puede abrirse en Chrome aunque la PWA esté instalada; la sesión se establece donde se completa el acceso. No se promete que un navegador aislado o un WebView comparta automáticamente la sesión con la PWA.

Referencias: https://supabase.com/docs/guides/auth/auth-email-passwordless y https://supabase.com/docs/guides/auth/auth-smtp
