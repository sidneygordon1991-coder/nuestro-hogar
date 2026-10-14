# Compartir, proteger y recuperar Nuestro Hogar

## Bienvenida

Cada hogar nuevo recibe una bienvenida de tres pasos: ingresos mensuales de referencia y método de aportes, presupuesto del mes y revisión con código de invitación. Las familias existentes no se reconfiguran automáticamente. Un administrador puede abrirla desde Familia > Configuración guiada. Guardar es atómico e idempotente por envío; no crea transacciones, pagos, repartos ni contribuciones de ahorro.

## Master y autenticador

El panel global requiere una sesión verificada con un autenticador TOTP (nivel `aal2`), además de la cuenta master autorizada en el servidor. La pantalla permite registrar un autenticador y validar su código. El alta solo termina cuando el usuario lo verifica. No se registran sus claves en el repositorio ni se conceden permisos mediante metadatos editables del perfil.

Durante el despliegue se conserva el indicador de transición de las cuentas existentes para no bloquear el panel antiguo. Una vez publicada la interfaz de autenticador, se activa `mfa_required` para las cuentas master existentes. Las nuevas cuentas master requieren MFA por defecto. El acceso al propio hogar sigue disponible sin entrar al panel global. No hay un mecanismo automático para omitir MFA si se pierde el teléfono; conserva el respaldo del autenticador y utiliza la administración de autenticación de Supabase para recuperaciones autorizadas.

## Respaldo con archivos

Respaldos > Preparar respaldo ZIP crea paquetes locales que incluyen los registros del hogar, comprobantes financieros y documentos accesibles. También incluye los documentos privados del usuario que exporta; los documentos privados de otros integrantes quedan fuera. No contiene contraseñas, sesiones, claves de autenticación o factores MFA ni exporta la administración de toda la plataforma.

Las colecciones grandes se dividen en partes; descarga todas. La parte 1 incluye el JSON de registros. Cada archivo y el JSON tienen un hash SHA-256 en el manifiesto para detectar daños. El hash verifica integridad y no autentica al autor del respaldo; los permisos del servidor siguen validando cada restauración. El archivo ZIP no está cifrado, por lo que conviene guardarlo en una ubicación personal protegida.

Para restaurar, elige primero la parte 1 y luego las demás. Se exige la misma familia, se comprueban rutas y límites de descompresión antes de escribir y solo se restauran registros o archivos faltantes. La información existente se conserva. Las cargas fallidas quedan reportadas y se pueden reintentar con la misma parte; los reintentos no duplican el respaldo de metadatos. Si todavía no existen los movimientos correspondientes, restaura primero los registros de la parte 1.

Cada paquete admite hasta 50 MB de contenido descomprimido; los archivos se agrupan en partes de aproximadamente 38 MB, además del manifiesto y hasta 10 MB de registros en la parte 1. El ZIP descargado admite como máximo 55 MB. Esto mantiene las operaciones dentro de tamaños razonables en teléfono. Los archivos conservan el límite de 15 MiB y las cuotas del hogar se aplican también al recuperarlos.

## Fotos

Las fotos JPG, PNG y WEBP de más de 750 KB se reducen, cuando ayuda, a un lado máximo de 2400 píxeles. Se conserva el formato y la proporción. La compresión solo sustituye el archivo seleccionado si ahorra al menos un 10%; se mantiene el original si no se puede procesar. No modifica PDF, Word o Excel. El procesamiento ocurre en el dispositivo, sin un servicio externo. Puedes desmarcar Optimizar fotos para conservar la foto original. Revisa la legibilidad de los comprobantes antes de subirlos.

## PDF mensual

Cierre mensual > Descargar resumen PDF exporta el mes seleccionado, su comparación, categorías, organización, hallazgos y prioridades. Los cierres guardados usan sus notas guardadas; las vistas previas se identifican como tales. El reporte se genera en el navegador, sin escribir movimientos ni contratar un servicio de PDF. Respaldos también permite descargar el último resumen mensual.
