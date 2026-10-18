# Integración v33 — 18 de octubre de 2026

## Origen y conservación

- Base publicada: `48ba95d6b1b63eedecc98df90ed7268c870d144b` (v32).
- Paquete: `Nuestro_Hogar_v33_Codigo_Completo.zip`, SHA-256 `1aac7ea7c4128b0f9e8a12bfb80b5ff531b1e5fafe5779734796f46276e2383f`.
- Rama: `feat/v33-integration`. Integración comparada con v32 original y v32 publicada; conserva las correcciones de tarjetas, importación sin duplicados, cierre de sesión y seguridad de v32.
- La migración de seguridad v32 ya publicada se conserva intacta y **no se vuelve a ejecutar**.

## Archivos y funcionalidades

- `src/finance/useFinanceWorkspace.tsx`, `src/finance/sections/*`, `src/Finance.tsx`: separación del módulo financiero, cuotas de tarjetas y cuentas USD.
- `src/PayCenter.tsx`, `src/lib/guatemalaPay.ts`: perfil de sueldo privado y planificación de prestaciones. No crean ingresos reales automáticamente ni incluyen salarios en respaldos del hogar.
- `src/AllowanceCenter.tsx`, `src/lib/allowance.ts`: mesadas, frascos, pagos y retiros.
- `src/WeeklySummaryCard.tsx`, `src/VoiceEntryButton.tsx`, `src/lib/{features,forecast,localQuestions,subscriptions,weekly,zeroBased}.ts`: funciones opcionales apagadas por defecto, por usuario y hogar.
- `src/PlatformActivity.tsx`: métricas agregadas con autorización master y MFA; excluyen movimientos privados.
- `src/styles/*`, `src/ui/*`, `public/fonts/*`: tokens, componentes y fuentes locales; conserva la navegación, apariencia y módulos existentes.
- `public/sw.js`: caché v33, fuentes precargadas, actualización explícita y conservación de datos locales.
- `scripts/db-{baseline,types}.sh`, `docs/ENTORNOS_Y_BASE_DE_DATOS.md`: exportación y generación atómicas. No reparan el historial de producción automáticamente.
- `supabase/migrations/20261018130000_platform_activity_metrics.sql` y `20261018140000_guatemala_pay_cards_allowance.sql`: únicas migraciones nuevas del servidor. Tablas adicionales con RLS, integridad, índices y respaldos compatibles.

## Correcciones adicionales de esta integración

- No guardar cambios en cuentas cuando no se pudo verificar su moneda. Un error al leer cuotas no convierte una cuenta USD a GTQ. Renombrar una cuenta USD conserva su valor contable original en quetzales.
- Los saldos USD derivados de movimientos sin importe nativo o transferencias sin cambio histórico se indican como **estimados**. Los informes conservan sus valores contables en GTQ.
- El ISR de 2026 no se extiende silenciosamente a 2027: la interfaz indica el año de las reglas y avisa al llegar un año no verificado.
- Los retiros de mesada usan un identificador estable y verifican un reintento contra el registro guardado. El bloqueo de la mesada en PostgreSQL serializa pagos/retiros; no se puede reescribir o borrar directamente el historial de frascos.
- Lecturas completas y paginadas para mesadas, frascos, monedas, cuotas y resumen semanal. Los errores de lectura no se presentan como saldos cero ni permiten sobreescribir los datos no verificados.
- El resumen semanal excluye aportaciones de ahorro del gasto y respeta la instantánea de pagos recurrentes.

## Validación

- 423 pruebas unitarias, 49 archivos: aprobadas.
- Compilación de producción y revisión estricta de TypeScript: aprobadas.
- Formato Prettier y `git diff --check`: aprobados.
- 17 escenarios SQL sobre reconstrucción aislada del esquema real de referencia, sus funciones, RLS, permisos y triggers: aprobados; ambas migraciones v33 también aplicadas dos veces para verificar idempotencia.
- SQL cubre sueldo privado, adolescente sin finanzas, pagos atómicos, duplicados, límite de retiro, historial protegido, cuotas inválidas, respaldos nuevos y antiguos, master con MFA y exclusión de actividad privada.
- Prueba nativa de PWA: actualización v32→v33, marcador local conservado, pantalla de acceso offline, recuperación de red lenta en 3.6 segundos y cero errores JavaScript.
- Función `send-web-push`: código equivalente al despliegue activo v5 después de normalizar formato; no requiere redespliegue ni rotación de claves.
- Navegador: 92 de 93 escenarios pasaron en la primera batería completa; se corrigió la respuesta incompleta de métricas master y se añadió una prueba. Los 14 escenarios afectados pasaron después del ajuste. El CI vuelve a verificar los 94 escenarios finales.
- Servidor: ambas migraciones nuevas aplicadas. Conteos y huellas de movimientos, cuentas (sin columnas nuevas), aportes y recurrentes idénticos antes/después. RLS activo en las cuatro tablas nuevas; acceso anónimo denegado, nonmember sin visibilidad, RPC de pago denegada y actividad master protegida. Sin nuevas advertencias de seguridad; avisos informativos de índices nuevos sin uso esperado.
- Batería de navegador y publicación: consultar los checks de la pull request y el despliegue de GitHub Pages correspondiente a este commit.

## Límites y pendientes explícitos

- Pruebas de navegador usan datos simulados. Las SQL usan identidades sintéticas y rollback en una base aislada. No se envían correos, no se prueban pagos con dinero real y no se ejercitan las cuentas reales de otras familias.
- El cálculo de nómina es una estimación para asalariados de Guatemala. Reglas verificadas hasta 2026. La deducción anual aplicable desde 2027 requiere actualización antes de ofrecer un cálculo con ese año.
- Fuentes primarias revisadas: [Congreso, actualización de ISR 2026/2027](https://www.congreso.gob.gt/noticias_congreso/16092/2026/) e [IGSS, cuota laboral](https://www.igssgt.org/noticias/2026/05/01/el-igss-reconoce-la-labor-de-todos-los-trabajadores-en-su-dia/).
- Las preguntas y proyecciones usan reglas locales; no son asesoría automática ni movimientos reales. La voz usa el servicio de dictado del navegador; Chrome puede procesar el audio en Google, como informa la configuración.
- La consolidación completa del historial de migraciones y los tipos generados quedan como trabajo separado; no se afirma que el repositorio pueda reconstruir un Supabase vacío por orden alfabético.
- La verificación de PWA cubre Chromium y la pantalla de acceso, no la entrega push física en todos los dispositivos.

## Recuperación

Revertir el frontend a v32 si fuera necesario; conservar las nuevas tablas y columnas, sin borrarlas ni borrar registros. Las funciones nuevas son adicionales. No revertir la protección de seguridad v32 ni ejecutar migraciones históricas sobre producción. Antes de cualquier corrección del servidor, exportar únicamente la definición afectada y usar una migración correctiva pequeña y verificable.
