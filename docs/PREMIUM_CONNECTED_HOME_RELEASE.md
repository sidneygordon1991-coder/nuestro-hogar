# Nuestro Hogar v28 — Inicio premium conectado

## Alcance

El diseño aprobado se implementa sobre la aplicación existente, con datos registrados y acceso a los controles actuales. No hay migraciones, cambios de RLS, altas de usuarios, modificaciones de información real ni servicios de pago nuevos.

La navegación principal se organiza en Hoy, Mi dinero, Mi plan, Mi progreso y Mi hogar. Conserva las rutas anteriores y las once secciones financieras. Agenda, familia, listas, comidas, documentos y mantenimiento siguen disponibles. Automatizaciones, respaldos y diagnóstico se conservan en Otros controles y en el menú general. Se mantienen personalización, favoritos, agenda primero, instalación y panel master.

## Comportamiento financiero

- **Margen del mes**: resultado real del mes (ingresos menos gastos menos ahorro neto), menos compromisos fijos/recurrencias pendientes y ahorro planificado pendiente. Reutiliza `buildCashFlow`; un presupuesto y su recurrencia no se suman como dos gastos. El cálculo se puede desplegar. No representa saldo bancario, no incorpora ingresos esperados y no descuenta presupuesto variable aún sin utilizar.
- **Mes y quincenas**: usa las asignaciones guardadas para cada período. Si no hay distribución quincenal, empieza mostrando el mes. Al consultar una quincena incompleta, lo indica y permite abrir el presupuesto o las reglas existentes. No divide automáticamente cantidades mensuales.
- **Curva registrada**: resultado acumulado del mes hasta cada fecha real; conserva el arrastre registrado al visualizar la segunda quincena. Las cifras del período y su resultado proyectado se presentan por separado. El resultado estimado de una quincena corresponde únicamente a esa quincena; no incluye el arrastre de la anterior.
- **Proyección**: usa los ingresos esperados y compromisos del período ya implementados. No inventa fechas de cobro ni dibuja una evolución futura con datos supuestos.
- **Presupuesto**: reutiliza `BudgetCategoryProgress`, sus iconos, porcentajes disponibles, importes, estados sin asignación y exceso. Las categorías de ahorro se consultan en Metas y no se convierten en gastos.
- **Cuentas**: saldos iniciales más ingresos/gastos y transferencias hasta el corte. Cálculos en centavos, consultas paginadas y filtros por hogar. El total líquido solo incluye efectivo y cuentas checking/savings activas de tipo activo. Las tarjetas, sus límites, inversiones y cuentas archivadas no aumentan ese total. Deudas visibles como deuda registrada. Una consulta fallida oculta los saldos sin mostrarlos como cero y permite reintentar por separado.
- **Metas**: importes netos históricos (depósitos menos retiros), excluyendo fechas futuras; se pueden abrir los controles existentes de metas y aportes. Las cifras financieras conservan centavos en el resumen de Finanzas.

## Calendario y controles

La agenda integra eventos, cumpleaños, tareas, pagos, comidas y mantenimiento. Conserva la deduplicación de mantenimiento enlazado, filtros por responsable, Hoy/Esta semana y selector de día; añade siete accesos de fecha. Muestra tres actividades inicialmente y permite desplegarlas todas. Los próximos recurrentes pendientes también aparecen en las prioridades cuando están registrados.

Los accesos desde Inicio abren las secciones existentes de cuentas/transferencias/conciliación, presupuesto, quincenas/aportes, metas, movimientos/comprobantes, calendario y Salud del hogar. Los cambios de sección financiera actualizan URL y selección del menú; la navegación entre secciones mantiene el módulo montado. El historial del navegador sigue siendo utilizable.

## Diseño y accesibilidad

Paleta compartida verde profundo, marfil y azul oscuro; temas claro y oscuro inmediatos; selector de tema junto al hogar. Escritorio usa el ancho disponible con columna principal y contexto. Móvil prioriza margen, cifras, evolución y presupuesto; la personalización de agenda primero se conserva. Navegación de cinco espacios con panel móvil accesible por teclado, Escape y restauración del foco. Registrar permanece accesible y se oculta al abrir superposiciones. Formularios conservan la protección existente del botón Guardar frente al menú inferior. Respeta movimiento reducido.

## Archivos principales

- `src/HomeMoneyWorkspace.tsx`, `src/lib/homeOverview.ts`: resumen conectado, cuentas, metas, gráfico y selección de período.
- `src/HomeDashboard.tsx`, `src/HomeAgenda.tsx`: agenda, prioridades, favoritos, preparación inicial y personalización.
- `src/DesktopRail.tsx`, `src/lib/workspaceNavigation.ts`: cinco espacios, permisos y navegación móvil/escritorio.
- `src/App.tsx`, `src/Finance.tsx`, `src/NotificationCenter.tsx`: datos existentes, enlaces financieros e integración de avisos.
- `src/theme-light.css`, `src/premium-home.css`, `src/main.tsx`: identidad visual y adaptación por tamaño.
- `public/sw.js`, `src/lib/release.test.ts`: versión PWA v28.
- `src/lib/homeOverview.test.ts`, `tests/e2e/premium-home.e2e.mjs`: nuevas comprobaciones de cálculos, permisos, fallos, integración y accesibilidad.
- Pruebas existentes de temas, navegación, agenda y resumen actualizadas para la nueva estructura; diagnóstico de desbordamiento más preciso en `tests/e2e/support.mjs`.

## Verificación

Línea base anterior a los cambios: 240 pruebas unitarias/SQL y compilación correctas. Verificación final local: **251 pruebas unitarias/SQL y 55 escenarios E2E correctos**, compilación de producción correcta y `git diff --check` limpio. La revisión incluye axe sin incidencias críticas o serias en las pantallas cubiertas.

Las pruebas de navegador utilizan respuestas sintéticas y sesión de QA local. No registran movimientos ni alteran cuentas reales. Incluyen 320, 390, 768, 1440, 1920 y 2560 px, temas claro/oscuro, axe, navegación, cuentas fallidas/reintentos, controles del calendario, integridad de futuros y acceso financiero restringido; la suite existente verifica los demás módulos y formularios.

## Límites y seguimiento

- El selector Personal/Compartido del concepto visual no se presenta como una garantía de privacidad. La privacidad financiera individual completa sigue pendiente; el permiso actual por hogar se conserva.
- Los saldos dependen de lo registrado y deben conciliarse; no hay conexión bancaria nueva ni movimientos automáticos de dinero.
- Lectura automática de comprobantes, nuevas importaciones bancarias y asistente conversacional no forman parte de esta entrega.
- La validación de uso con familias reales y teléfonos físicos sigue siendo una prueba manual posterior a la publicación.
- Reversión mediante revert del commit de interfaz y una nueva versión del worker; no requiere recuperar ni revertir datos.
