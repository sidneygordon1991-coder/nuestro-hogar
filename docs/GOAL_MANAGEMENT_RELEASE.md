# Metas: editar, archivar, reactivar y eliminar — v0.33.1

Las tarjetas de metas solo permitían agregar aportes. Esta corrección añade acciones visibles con texto y conserva los registros financieros existentes.

## Uso

- Abre **Mi plan → Metas de ahorro** en el menú de escritorio, o **Plan → Metas** desde Finanzas en móvil.
- **Editar:** cambia nombre, monto objetivo y fecha. No modifica aportes, retiros ni saldos.
- **Archivar:** quita la meta de Activas y conserva su ahorro, historial y vínculos. Puedes consultarla en **Archivadas**.
- **Reactivar:** devuelve una meta archivada a Activas.
- **Eliminar:** requiere confirmación y solo funciona sin aportes, retiros ni vínculos con presupuesto o planeación. Una meta cuyo saldo neto sea cero puede conservar historial y debe archivarse.
- Los ingresos y gastos registrados muestran los botones **Editar** y **Eliminar** con texto en Movimientos; el ingreso esperado por quincena continúa editable en Ingresos.

## Archivos

- `src/FinanceParts.tsx`: acciones explícitas en tarjetas de metas y filas de movimientos.
- `src/finance/sections/FinanceGoals.tsx`: vistas Activas/Archivadas y acceso a las acciones.
- `src/finance/GoalManagementDialog.tsx`: formularios, confirmaciones y errores legibles; mantiene los datos escritos si falla el guardado.
- `src/finance/useFinanceWorkspace.tsx`: lectura completa y paginada de metas; impide gestionar información incompleta.
- `src/styles/modules/finance-management.css`: disposición adaptable, botones táctiles y ambos temas.
- `supabase/migrations/20261018181048_savings_goal_management.sql`: RPC con permisos del hogar, RLS, bloqueo de la meta y comprobación de cambios desde otra sesión; trigger privado que impide borrar historial por cascada.
- `supabase/tests/savings_goal_management.sql`: edición, validación, archivo/reactivación, respaldos, saldo cero con historial, vínculos, reintentos de borrado y autorización.
- `tests/e2e/goal-management.e2e.mjs`: ambos temas, móvil/escritorio, acciones visibles, ciclo completo y fallos de carga/permisos/concurrencia lógica.
- `package.json`, `package-lock.json`, `public/sw.js`: versión 0.33.1 y actualización explícita de PWA.

## Validación

- Compilación y revisión estricta de TypeScript aprobadas.
- 423 pruebas unitarias aprobadas.
- 18 escenarios SQL aprobados sobre una reconstrucción aislada del esquema, permisos, RLS, funciones y triggers reales de referencia; la nueva migración se aplica también dos veces para verificar idempotencia.
- Los resultados finales de los 98 escenarios de navegador, formato y compilación están en los checks de la pull request correspondiente.
- Las pruebas usan identidades sintéticas y datos simulados. No se editan ni eliminan las metas reales del usuario durante la verificación.

## Publicación y recuperación

Aplicar únicamente la migración nueva después de la validación aislada. Comparar conteos y huellas de metas, aportes y movimientos antes/después, comprobar permisos y asesores de seguridad. Publicar frontend después de aprobar el CI, verificar Pages y comparar los archivos públicos con la compilación probada.

La protección del servidor permanece activa si se revierte el frontend. No es necesario borrar columnas, tablas o datos para recuperar la versión anterior. Los respaldos conservan las metas archivadas y sus contribuciones.
