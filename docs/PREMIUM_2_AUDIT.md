# Nuestro Hogar 2.0: auditoría y registro de validación

## Línea base

16 de octubre de 2026 UTC. Rama `feat/nuestro-hogar-2-premium`, origen `f149832220f64951fce7199d3fc5e96b2625a281`, árbol `4ca693019260e292605d8520181948bcfe0b1eb9`. Antes de modificar: árbol limpio, 165 pruebas/20 archivos aprobados y compilación Vite 6.4.4 correcta. React 18, TypeScript, Supabase JS 2.117.3 fijado, Lucide, Vitest y PWA v21. No hay API Node independiente ni React Router.

## Hallazgos comprobados en el código

| Prioridad | Hallazgo | Consecuencia | Corrección prevista |
| --- | --- | --- | --- |
| Alta | Inicio usa referencias antiguas de ingreso, mientras Finanzas admite planes por mes/persona | El cierre mostrado puede diferir entre módulos | Compartir cálculo de compromisos y planes mensuales |
| Alta | Inicio y el resumen de Finanzas suman movimientos futuros como reales; Salud los excluye | Balance y ahorro inconsistentes para la misma fecha | Separar registrado a la fecha de movimientos futuros visibles |
| Alta | Proyección de Inicio/Finanzas suma recurrentes variables además del presupuesto variable pendiente | Un compromiso puede descontarse dos veces | Máximo entre pendiente y presupuesto por categoría, como Salud |
| Alta | Las respuestas de datos/permisos en App no están ligadas a una generación del hogar/sesión | Una respuesta tardía puede reemplazar la vista actual | Invalidar respuestas anteriores y remontar estado por hogar/usuario |
| Media | Varias consultas fallidas se convierten en listas vacías/cero en el resumen | Un error puede parecer ausencia de movimientos | Estado explícito de error y reintento; no mostrar cero como dato verificado |
| Media | Componentes de sección, estados vacíos y ayudas están implementados de forma distinta | Densidad, lectura y orientación variables entre módulos | Componentes y estilos compartidos con verificación en todos los módulos |
| Media | El alta de ahorro borra el borrador antes de conocer el resultado | Una falla obliga a escribir el importe otra vez | Conservar importe y validar envío con fecha explícita |
| Pendiente de servidor | Ahorro admite importes positivos; no hay retiro explícito | No debe simularse un retiro como ingreso ni borrar historia | Requiere operación de libro validada y migración compatible antes de habilitarse |

## Superficie de módulos examinada

Se revisaron el shell y catálogo, Inicio, las once secciones de Finanzas, Agenda, Familia, Listas, Comidas, Documentos, Mantenimiento, Planeación, Salud, Cierre mensual, Automatizaciones, Respaldos, Diagnóstico, master, acceso, notificaciones, personalización y ventanas compartidas. Existe un contrato de colores semánticos `--nh-*` y pruebas de paridad claro/oscuro. La mejora lo amplía y conserva; no reemplaza la arquitectura.

## Seguridad y servicio

Se consultaron únicamente metadatos/políticas y el asesor de seguridad; no se leyeron registros de usuarios ni se modificaron datos reales. Se verificaron las políticas de Finanzas, documentos privados, comprobantes y membresías. Las claves del cliente son públicas. La función push usa credenciales únicamente en servidor. El acceso master y MFA siguen comprobándose en servidor.

El asesor informa 50 funciones `SECURITY DEFINER` públicas ejecutables por usuarios autenticados, dos extensiones en `public` (`pg_net`, `pg_trgm`) y una tabla interna de solicitudes con RLS sin políticas (denegación por defecto). Un aviso de función privilegiada no demuestra por sí mismo una fuga: requiere revisar permisos y controles de cada función antes de moverla o reemplazarla. No se cambian masivamente funciones ni políticas en producción como parte de una mejora visual.

Referencias de revisión: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable y https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public . El changelog revisado anuncia cambios TLS para clientes antiguos; no requiere cambiar las APIs del cliente React actual.

## Alcance de la validación

Las verificaciones de navegador usarán hogares y usuarios ficticios con peticiones interceptadas. Ningún resultado de una prueba interceptada se presentará como validación de escritura real o aislamiento real del servidor. Las futuras migraciones se prepararán y probarán por separado, sin aplicación automática a producción. Las pruebas SQL existentes y la inspección de RLS no sustituyen una prueba completa de un backend nuevo.

## Registro de fases

1. Auditoría: línea base y hallazgos documentados; rama creada.
2. Interfaz: `WorkspaceTitle.tsx`, `lib/moduleGuides.ts`, `refinement.css`, importación en `main.tsx`, cabeceras de los 13 módulos y contrato de temas. Pruebas de esta fase: 166 unitarias y compilación aprobadas. Navegador con datos ficticios: 13 módulos por 2 temas por 4 anchos (320/390/768/1440), ayudas desplegables, sin desbordamientos ni errores JS. Revisión visual de Documentos móvil y Planeación escritorio. No cambió el esquema. La prueba de anchos no implica revisar manualmente cada control.
3. Finanzas: `lib/cashFlow.ts` y sus 10 pruebas unifican importes a la fecha y el máximo entre recurrentes/presupuesto por categoría. `App.tsx`, `Finance.tsx` y `HomeDashboard.tsx` comparten planes mensuales por persona; respuestas atrasadas se descartan por sesión/hogar. Inicio incorpora compromisos, ingreso esperado y margen del plan; las fallas muestran reintento y no cifras no verificadas. `SavingsEntryDialog.tsx` y la migración `20261016044336_savings_ledger_withdrawals.sql` preparan retiros sin inventar ingresos, con bloqueo por meta, saldo por fecha, validación diferida para respaldos e idempotencia. `savingsLedger.test.ts`: 13 casos aprobados en PostgreSQL aislado, con helpers de acceso de prueba. Los positivos existentes conservan su significado y autor. La función se ofrece solo si el servidor confirma capacidad. **Migración no aplicada; requiere autorización y validación de integración en un backend de prueba compatible antes de activarla en producción.**

   Riesgos: modificar una aportación que ya financió retiros puede rechazarse para proteger el saldo. Revertir a código sin retiros después de haberlos registrado requiere revisar interpretación y respaldos; no basta con volver a imponer la restricción positiva. No se alteraron transacciones ni cuentas reales.
4. Diagnóstico: `lib/financialDiagnosis.ts`, sus 20 pruebas, `FinancialDiagnosis.tsx`, `BalanceFlow.tsx` y `FinancialVisuals.tsx`. El cálculo comparte el mismo motor; las recomendaciones explican el margen condicional y conservan prioridades de vencimientos/déficit. La tasa muestra ahorro neto, admite retiros y evita gráficos recortados para valores negativos. No agrega un servicio IA ni crea un segundo módulo. Se conservan fórmula, advertencias, reserva declarada y reglas de aportación. Riesgo: una proyección sigue dependiendo de la integridad de los registros y del cumplimiento del ingreso esperado.
5. Resto de módulos: `CalendarCenter.tsx`, `DocumentVault.tsx`, `MealsCenter.tsx`, `MonthlyCloseCenter.tsx` agregan nombres accesibles a filtros y cambios de período. `ListsCenter.tsx` conserva el formulario antes de esperar el guardado, para no usar un evento React liberado, e identifica sus campos. `DiagnosticCenter.tsx` consulta el registro disponible del service worker sin esperar indefinidamente. `AppMenu.tsx`, `GlobalCommandCenter.tsx` y `lib/useFocusTrap.ts` contienen foco, cierran con Escape y devuelven foco al botón de apertura. Orientación inicial e Inicio reconocen uso individual e invitaciones opcionales; `ConnectionStatus.tsx` explica una desconexión real. No se reemplazan los flujos operativos ni se duplican módulos.
6. Integración: `playwright.config.ts`, `tests/e2e/support.mjs`, `tests/e2e/premium.e2e.mjs`, `.github/workflows/quality.yml`, `vite.config.ts`, `public/sw.js` y pruebas de versión. Se agrega una suite reproducible de navegador, el flujo de revisión sin despliegue y separación de bibliotecas para caché. La PWA propuesta usa v22. Los resultados y pendientes de publicación se detallan abajo; no se marca como ejecutada la integración del nuevo SQL con producción.

## Matriz de verificación final

- 191 pruebas en 22 archivos, incluyendo 13 escenarios de PostgreSQL aislado; todas aprobadas.
- Compilación TypeScript/Vite aprobada. Bibliotecas React y Supabase separadas para caché estable. El bloque principal de aplicación queda en aproximadamente 136 KB sin comprimir, frente a 491 KB del bloque combinado inicial; los proveedores ahora se descargan por separado, por lo que no se interpreta como una reducción equivalente del total inicial transferido. Referencia de configuración: https://v6.vite.dev/guide/build .
- 13 módulos x 2 temas x 4 anchos; guías desplegables; sin desbordamientos ni errores JS en la matriz. Axe verifica ausencia de hallazgos críticos/graves en las vistas principales de ambos temas; esto no es una certificación WCAG ni cubre todas las combinaciones de contenido.
- 14 escenarios de navegador aprobados sobre el build de producción: resumen, errores y reintentos, retiros/opción ausente, solo lectura, modo sin conexión, respuesta tardía de otro hogar, carga fallida de hogares, borrador de ahorro, siete formularios a 320 x 640, foco de búsqueda/menú y guardado en Listas. Incluye regresión de edición de ahorro y retiro de recurrente, con conservación de pagos.
- `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades informadas para dependencias de producción en la consulta de esta entrega.
- Metadatos de servidor: 48 tablas públicas y 4 de plataforma con RLS activado. Las RPC revisadas de diagnóstico, master, recurrentes y alta rápida no conceden ejecución a `anon`; los avisos de funciones privilegiadas descritos arriba siguen pendientes de evaluación individual.

## Límites y autorización de publicación

No se desplegó la aplicación de esta rama, no se aplicó la migración de retiros y no se cambiaron registros reales al validar. Las pruebas de navegador interceptan las solicitudes: validan el cliente, no el envío SMTP, los permisos de producción ni la entrega push real. Los helpers de acceso de la prueba SQL son sintéticos; no equivalen a reproducir todo Supabase Auth/Storage. No se probó concurrencia entre conexiones Postgres reales.

La distinción Personal/Compartido de Finanzas define reparto y propiedad, **no privacidad individual del movimiento frente a otros miembros autorizados para ver Finanzas**. Los documentos privados sí conservan su aislamiento. Crear una privacidad financiera por registro en todo el sistema exige revisar también proyecciones, RPC privilegiadas, búsquedas, cierres, auditoría y respaldos; no se promete con un filtro del cliente.

Antes de llamarlo una edición comercial totalmente verificada, faltan ensayo de migración/recuperación y concurrencia en un backend de prueba compatible, revisión individual de los avisos del servidor y, si se requiere, definición y desarrollo de privacidad financiera por registro. La aplicación existente sigue operativa. La activación de retiros y la publicación deben aprobarse después de revisar la propuesta.
