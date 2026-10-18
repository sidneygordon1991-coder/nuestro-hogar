# Integración de Nuestro Hogar v32

18 de octubre de 2026. Base: v31 publicada, `4a2eb60ea1403cca10c4b13f39146c426cafff77`.

## Procedencia y alcance

Paquete recibido: `Nuestro_Hogar_v32_Codigo_Completo.zip`, SHA-256 `845a8741957115ae228fe45960440b42132fd65a81f4a3226dfcfafb1b8409f0`. Se compararon sus archivos con la base exacta del repositorio; no faltan archivos rastreados y no cambiaron dependencias ni el archivo de bloqueo. Los documentos de exportación y su inventario anterior no se incorporan al repositorio: describían la instantánea v31, no las correcciones de integración v32.

Las mejoras funcionales y visuales del paquete se describen en [V32_MEJORAS.md](V32_MEJORAS.md). Se conservan módulos, datos históricos, autenticación, PWA y aislamiento por hogar. No se reproduce todo el historial SQL en la base existente.

## Correcciones durante la integración

| Archivos | Corrección verificada |
| --- | --- |
| `src/ImportStatement.tsx` | La compilación detectó que un comentario absorbía la declaración de `requestId`. Se restauró la declaración para mantener los IDs estables y la importación atómica. La consulta de duplicados conserva los campos necesarios y su contrato anterior. |
| `src/lib/creditCards.ts`, `src/HomeMoneyWorkspace.tsx` | Un recurrente genérico «Pago tarjeta» no oculta la deuda de todas las tarjetas. Solo se compensa el importe de un pago pendiente identificado inequívocamente por el nombre de una tarjeta. Se respetan la fecha, el tipo, la cuenta y los detalles históricos del vencimiento. |
| `src/lib/signOut.ts`, `src/App.tsx` | La limpieza push tiene un plazo global de 2.5 segundos; no bloquea indefinidamente la salida y limita la eliminación al usuario anterior. La apariencia elegida se conserva durante la sesión si el navegador bloquea la escritura local. |
| Migración v32 | Los intentos de invitación se guardan en el esquema interno `household_integrity`, con RLS y sin acceso directo para usuarios. Una exclusión mutua por usuario impide evadir el límite con solicitudes paralelas. No se agregan índices equivalentes a los existentes. |
| Pruebas SQL y TypeScript | Se comprueban denegaciones específicas bajo el rol `authenticated`, usuario ajeno, permisos propios, anónimo y contadores independientes. Se agregan casos de tarjetas, cierre de sesión y despachador push, sin enviar notificaciones reales. |
| Pruebas de navegador | Se actualizan las expectativas de diseño que cambiaron en v32: fondo oscuro, descripción opcional y explicación del cálculo de tarjetas. Se conservan las comprobaciones funcionales y de accesibilidad. |

## Seguridad y publicación

La revisión del servidor confirmó las guardas vulnerables ante `NULL` en las tres funciones administrativas. La migración reemplaza esas guardas, conserva los permisos de invocación autenticada y exige identidad antes de consultar roles.

La única migración nueva es `20261018120000_security_null_safe_guards.sql`. También fortalece los códigos futuros, renueva los códigos heredados de menos de 16 caracteres y limita las invitaciones incorrectas a diez por cuenta en quince minutos. Los enlaces/códigos cortos anteriores deberán compartirse de nuevo desde Familia. La cuenta master existente ya exigía MFA y tenía autenticador verificado; la migración mantiene esa exigencia.

La función `send-web-push` conserva `verify_jwt=true` y el secreto del despachador. Se actualiza con `index.ts` y su dependencia relativa `notificationUrl.ts`, sin regenerar VAPID ni otros secretos. Las pruebas del despachador simulan el servidor push y no equivalen a una entrega física en Android/iOS.

Antes y después de aplicar la migración se comparan conteos y huellas agregadas de movimientos, cuentas, aportes y recurrentes, sin exportar sus registros. Los escenarios con identidades ficticias se ejecutan solamente en PostgreSQL aislado, reconstruido desde los metadatos del esquema vigente y las migraciones v31. No se crean cuentas de prueba en producción.

## Validación

- `npm test`: 385 pruebas aprobadas en 43 archivos, incluidos los casos nuevos de seguridad del despachador, tarjetas y salida.
- `npm run build`: TypeScript estricto y compilación de producción aprobados.
- Los 16 archivos `supabase/tests/*.sql` aprobaron en PostgreSQL aislado, con RLS, grants, funciones y triggers de la base de referencia.
- Prueba nativa de PWA v31 → v32: nueva caché activa, caché anterior retirada, marcador local conservado, carcasa disponible sin red y recuperación de una navegación lenta en 3,592 ms, sin errores JavaScript.
- Las comprobaciones completas de navegador y de publicación quedan registradas en el PR y GitHub Actions. Las pruebas usan registros simulados e interceptan el backend.

## Recuperación y límites

Se puede recuperar el frontend v31 conservando la migración de seguridad y los códigos reforzados. No restaurar las funciones vulnerables ni borrar datos para recuperar la interfaz. La v31 todavía puede mostrar un aviso menos claro cuando un código es inválido: v32 maneja explícitamente el retorno `null` del servidor.

La aplicación sigue siendo PWA. El modo sin conexión conserva su carcasa y los borradores soportados; no promete operaciones financieras completas fuera de línea. Los importes y recomendaciones dependen de los registros; los pagos recurrentes de tarjeta sin un nombre inequívoco no se presumen ya cubiertos. La comprobación de experiencia en teléfonos físicos y la recepción real de push requieren validación manual.
