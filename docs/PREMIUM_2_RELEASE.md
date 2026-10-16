# Propuesta Nuestro Hogar 2.0: revisión y activación

## Estado

Entrega autorizada para pruebas el 16 de octubre de 2026 (UTC). La migración de ahorro está aplicada en el backend y verificada con su esquema completo. El cliente PWA v22 se publica mediante el PR #1 y el flujo de Pages de `main`; comprobar el resultado del despliegue en GitHub Actions antes de dar por disponible la interfaz. La versión anterior es `f1498322` (PWA v21).

La auditoría y los resultados por fase están en `PREMIUM_2_AUDIT.md`. No se debe presentar esta propuesta como una edición comercial certificada o como una activación ya hecha.

## Comprobar localmente

```bash
npm ci
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador sirven `dist/` en el puerto 4173 e interceptan Supabase con datos ficticios. No usan credenciales de usuarios reales. Deben ejecutarse contra la configuración pública de prueba que documenta el fixture; si se cambia el proyecto de conexión, actualizar también el fixture antes de usarlas. El navegador de Playwright se instala aparte de las dependencias npm. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` permite usar un ejecutable existente en entornos administrados.

Las pruebas SQL aisladas usan PGlite y roles/helpers sintéticos. Verifican el SQL de la migración y las invariantes del ahorro, pero no reproducen todo Supabase, sus políticas históricas o múltiples conexiones concurrentes. La prueba de navegador de aislamiento valida respuestas tardías del cliente; el aislamiento real continúa dependiendo de RLS y las funciones del servidor.

La comprobación de pull requests en `.github/workflows/quality.yml` ejecuta pruebas, build y navegador sin despliegue. `deploy-pages.yml` mantiene su publicación desde `main`. Crear un pull request de esta rama no publica la aplicación.

## Activación y comprobaciones

1. Revisar y respaldar esquema/datos y archivos mediante los mecanismos del proyecto autorizado. El ZIP de código no es un respaldo de datos.
2. Probar `20261016052021_savings_ledger_withdrawals.sql` sobre un backend de prueba compatible, con las políticas, auditoría y restricciones de archivado reales. Verificar edición, eliminación, restauración, usuarios de lectura, hogares ajenos y concurrencia de retiros. No ejecutar indiscriminadamente las migraciones históricas sobre producción o una base vacía.
3. Confirmar que las contribuciones existentes permanecen positivas, con el mismo autor, fecha, destino e importe. La migración no las reescribe.
4. Tras aprobación, aplicar la migración revisada al proyecto correcto. La función `get_savings_ledger_capability` permite al cliente detectar la capacidad. Si no está disponible, el cliente conserva aportes y no ofrece retiros.
5. Publicar el cliente aprobado desde `main`, esperar el despliegue y verificar la actualización PWA v22, correo, master/MFA y permisos con cuentas de prueba autorizadas.
6. Verificar un aporte y un retiro con un hogar de prueba, las proyecciones y el respaldo/recuperación. No usar datos financieros reales para estas pruebas.

## Semántica del ahorro

Un importe positivo en `goal_contributions` es un aporte; uno negativo es un retiro. El saldo neto de la meta usa ambos. El retiro libera dinero previamente separado, no crea ingreso, gasto ni transferencia bancaria. Si después se usa para una compra, el gasto se registra como tal una sola vez.

El servidor bloquea la meta al modificar su libro y rechaza un saldo diario acumulado negativo, incluso si se modifica o elimina un aporte anterior. La comprobación diferida permite restaurar un conjunto de filas dentro de una transacción antes de verificar el saldo final. Un depósito con fecha posterior no financia un retiro anterior. El pago de recurrentes conserva su RPC atómico e idempotente existente.

## Recuperación y compatibilidad

Antes de registrar retiros, es posible volver al cliente anterior conservando el esquema ampliado. Después de registrar retiros, **no** se debe volver a imponer `amount > 0` ni borrar los negativos para hacer compatible una versión antigua. Primero revisar cómo interpretan el ahorro esa versión, los reportes y los respaldos. Si se pausa la función, deshabilitar nuevas operaciones en servidor y conservar el historial. Un rollback necesita probarse con los datos y la versión que realmente se vayan a usar.

## Pendientes de producto y seguridad

- Los avisos del asesor sobre funciones privilegiadas y extensiones siguen documentados; no se cambian masivamente sin evaluar dependencias y autorización.
- El reparto personal en Finanzas no equivale a privacidad por movimiento. El aislamiento por hogar y los documentos privados se conservan. Una privacidad financiera por registro necesita diseño y revisión de todas las rutas del servidor, reportes, búsquedas y respaldos.
- La integración con el backend completo pasó mediante `supabase/tests/savings_ledger_integration.sql`, con rollback de identidades y hogares sintéticos. Queda una prueba de carga con múltiples conexiones concurrentes y una recuperación completa de archivos/datos; se verificaron el bloqueo de meta, el orden diferido de restauración del libro y la inclusión de negativos en el respaldo. Estos resultados no certifican SMTP/push ni todos los estados posibles de todos los módulos.
- La PWA mantiene caché de interfaz; no se incorpora una cola general de cambios sin conexión ni sincronización bancaria.

## Evidencia de activación del backend

- Migración aplicada sin reescribir contribuciones existentes; huella del libro sin cambios antes/después.
- Integración real: aporte y retiro, reintento idéntico, conflicto de solicitud, sobregiro actual y retroactivo, edición/eliminación/movimiento que invalidaría el saldo, inserción directa, precisión y fechas, restauración diferida de filas, respaldo con retiros y ausencia de transacciones bancarias inventadas.
- Permisos reales: propietario, lector, usuario ajeno, anónimo y hogar archivado. Ningún usuario sintético persistió.
- RLS, auditoría, integridad de referencias y protección de archivados siguen activos. Las dos RPC nuevas son SECURITY INVOKER y no permiten ejecución anónima.
- Asesor de seguridad: mismos avisos de base (50 funciones privilegiadas existentes, dos extensiones públicas y una tabla privada con RLS sin políticas). Ninguna función privilegiada nueva.
- 191 pruebas locales aprobadas. La revisión previa de CI aprobó también los 14 escenarios de navegador.

El identificador local `20261016052021` coincide con el registro efectivo del servidor. Sustituye el nombre provisional de la propuesta; no ejecutar ambas versiones ni volver a aplicar la migración ya registrada.
