# Activar el ingreso con Google

El botón, la comprobación de disponibilidad y el retorno a la aplicación están implementados. Google seguirá pendiente hasta crear un cliente OAuth y conectarlo a Supabase. La cuenta con correo existente se conserva para que el propietario pueda entrar mientras termina esta configuración.

## 1. Google Cloud

Abre https://console.cloud.google.com/ y selecciona o crea el proyecto de Nuestro Hogar. En Google Auth Platform configura la marca con el nombre de la aplicación, correo de soporte y contacto del desarrollador. Usa audiencia Externa y los permisos básicos de identidad: `openid`, `email` y `profile`.

Para el piloto puedes usar el estado de prueba e incluir las cuentas de las familias como usuarios de prueba. Antes de abrirlo a más personas, revisa y publica la configuración de audiencia según las indicaciones de Google.

Crea un cliente OAuth de tipo **Aplicación web**.

**Orígenes autorizados** (sin ruta final):

```text
https://sidneygordon1991-coder.github.io
https://dchihxrjtngwabbvsqap.supabase.co
```

**URI de redirección autorizada**:

```text
https://dchihxrjtngwabbvsqap.supabase.co/auth/v1/callback
```

## 2. Supabase

En el proyecto `dchihxrjtngwabbvsqap`, abre Authentication > Sign In / Providers > Google. Activa Google y guarda allí el Client ID y Client Secret creados en Google Cloud.

El Client Secret se introduce únicamente en Supabase. No se incluye en GitHub, en el código del navegador ni en mensajes de soporte.

En Authentication > URL Configuration utiliza:

**Site URL**:

```text
https://sidneygordon1991-coder.github.io/nuestro-hogar/
```

**Redirect URL permitida**:

```text
https://sidneygordon1991-coder.github.io/nuestro-hogar/
```

## 3. Verificación

Abre la aplicación en una ventana privada, pulsa Continuar con Google y elige una cuenta autorizada para el piloto. Debe regresar a Nuestro Hogar con sesión iniciada y permitir crear un hogar propio o usar un código de invitación.

Para conservar la familia y el acceso master actuales, el propietario debe usar el mismo correo verificado de su cuenta existente. No se concede master a una cuenta nueva automáticamente. Supabase gestiona el enlace de identidades con correos verificados según su configuración; comprueba que la cuenta regrese a la familia existente.

El panel master además pide verificar un autenticador; la sesión de Google por sí sola no permite administrar otras familias.

Referencias oficiales: https://supabase.com/docs/guides/auth/social-login/auth-google y https://developers.google.com/identity/protocols/oauth2/web-server
