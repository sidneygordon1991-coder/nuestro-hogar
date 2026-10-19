# Quincenas personales y pagos fuera del presupuesto · 0.34.0

## Comportamiento

En Finanzas → Ingresos, cada integrante define dos días de inicio con su plan mensual. Los inicios 14 y 29 producen 14–28 y 29–13 del mes siguiente. El primero puede ser 1–28 y el segundo debe ser posterior, hasta 31. Un segundo inicio que no existe en un mes corto pasa al primer día del siguiente mes: febrero de 2027 queda 14–28 de febrero y 1–13 de marzo; en 2028, el segundo tramo empieza el 29 de febrero. Los tramos son contiguos y no se superponen.

Las fechas se guardan con cada plan mensual. Un mes nuevo propone el último ciclo anterior de cada persona; no toma configuraciones futuras ni reinterpreta planes anteriores. La consulta respeta RLS y no crea datos al navegar.

En Quincenas, «Fechas para comparar» permite elegir calendario o el ciclo de una persona. El mes del selector indica dónde empieza el ciclo. Se cargan todos sus movimientos y aportes, incluidos los del siguiente mes, con paginación, límite al día actual, control de respuestas obsoletas y error explícito si falta información. La preferencia dura durante la sesión y se separa por usuario y hogar.

Todos los integrantes se comparan en **un mismo rango elegido**, usando la distribución del plan del mes de inicio. No se suman ventanas personales superpuestas. Las fechas de cobro se mantienen como configuración independiente. Los repartos históricos no se reescriben. La revisión guiada y Salud del hogar conservan sus períodos calendario; esta versión incorpora una vista de comparación del ciclo, no un cierre contable nuevo.

Al crear o editar un gasto, incluido Registrar rápido, «Tratamiento del gasto» permite excluirlo del presupuesto. Se conserva el movimiento real, su cuenta, sus comprobantes y sus repartos. Elegir una cuenta de ahorro no lo excluye automáticamente: el usuario confirma la clasificación. En un pago recurrente esta selección corresponde al pago registrado, no modifica las futuras ocurrencias.

Las barras de Inicio, presupuesto, quincenas y los remanentes del plan no consumen pagos excluidos. El arrastre opcional del presupuesto también los respeta. El cierre mensual calcula su porcentaje con el gasto presupuestario y mantiene el gasto real para el saldo, el histórico y el PDF. Un pago excluido sí puede disminuir la liquidez real: se muestra separado para que el saldo no resulte ficticio. Las obligaciones entre personas permanecen incluidas.

## Implementación

- `src/lib/payCycles.ts`: fechas civiles UTC, validación, límites y etiquetas.
- `src/lib/budgetTreatment.ts`: clasificación compartida y compatibilidad con datos anteriores.
- `MonthlyIncomePlan.tsx`, `monthlyIncome.ts`, `finance/useFinanceWorkspace.tsx`: edición de ciclos, snapshots y propuesta del último ciclo anterior.
- `finance/sections/FinanceFortnight.tsx`, `FortnightBudget.tsx`, `financePeriods.ts`: selección, consulta paginada y comparación por rango.
- `GlobalCommandCenter.tsx`, `FinanceDialogs.tsx`, `FinanceParts.tsx`: clasificación al crear/editar y etiquetas visibles.
- `budgetProgress.ts`, `cashFlow.ts`, `homeOverview.ts`, secciones de Presupuesto/Resumen/Optional, `HomeMoneyWorkspace.tsx`, `fortnightReview.ts`, `MonthlyCloseCenter.tsx`, `FinancialDiagnosis.tsx`, `monthlyPdf.ts`: gasto real separado del presupuesto.
- `supabase/migrations/20261019023634_personal_cycles_budget_treatment.sql`: tres columnas aditivas, extensión transaccional del escritor idempotente, fuentes de lectura, porcentajes de cierre, compatibilidad de respaldos anteriores y RPC de propuesta de ciclos con seguridad del invocante.
- `public/sw.js`, paquetes y prueba de versión: PWA v34 / aplicación 0.34.0.

## Verificación

431 pruebas unitarias y 19 escenarios SQL aislados aprobados. Los 4 escenarios nuevos de navegador pasan en ambos temas, con accesibilidad y comprobaciones de ancho. La actualización PWA v33.1→v34 conserva los datos locales, abre la pantalla de acceso sin conexión y responde al respaldo de navegación lenta en aproximadamente 3.6 segundos, sin errores de JavaScript. Las pruebas usan datos sintéticos. La nueva migración se verifica dos veces en una reconstrucción aislada del esquema y su RLS. Se prueban cruce de año, febrero normal/bisiesto, límites, continuidad de fechas, distintas personas, reintentos, permisos, restauración de respaldos antiguos, saldos, repartos y separación de gastos. Los escenarios de navegador verifican guardado, edición, fallos de lectura, temas claro/oscuro, tamaños 320/390/1440 y accesibilidad.

Los resultados finales y la compilación están en los checks de la pull request. Para el servidor se comparan huellas de las columnas anteriores de movimientos y planes antes/después. Los valores nuevos predeterminados conservan el comportamiento histórico; no se reclasifican pagos reales durante la publicación.

## Recuperación y límites

La migración no borra datos, tablas ni políticas. Mantener sus columnas y lectores si se necesita desactivar temporalmente la nueva interfaz: una interfaz antigua ignoraría la clasificación presupuestaria nueva. La recuperación debe conservarla o avanzar con una corrección, sin borrar los indicadores guardados. Las funciones SQL existentes se amplían con anclas comprobadas y conservan su seguridad, permisos y rutas de búsqueda.

El CLI había intentado telemetría ajena a esta operación en una tarea anterior y recibió un rechazo automático. No se repitió esa acción; el SQL se preparó localmente y se verificó en la base aislada antes de usar la herramienta de migración del proyecto.
