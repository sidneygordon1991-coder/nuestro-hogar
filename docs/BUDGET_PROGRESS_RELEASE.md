# Presupuesto por rubro · PWA v24

## Comportamiento

- Finanzas → Presupuesto y Quincenas comparten tarjetas con icono, barra de gasto, porcentaje utilizado, porcentaje disponible y monto restante con centavos. La barra se llena con los gastos registrados, hasta el 100%; un exceso conserva el porcentaje real y muestra el monto excedido.
- La primera quincena incluye del 1 al 15; la segunda, del 16 al cierre. Cada vista usa su presupuesto guardado. No se distribuye automáticamente el presupuesto mensual pendiente de asignación.
- Solo se cuentan gastos del rubro y período seleccionado, hasta la fecha actual del dispositivo. Se excluyen ingresos, transferencias y movimientos con fecha futura. Guardar un movimiento actualiza el avance mediante el flujo de recarga existente.
- Al alcanzar el 80% aparece un aviso; al agotar o superar el presupuesto se muestra otro estado con texto e icono. No se depende solo del color. Sin presupuesto asignado no se inventa un porcentaje ni un disponible.
- Editar el plan conserva el avance contra lo guardado y señala los cambios pendientes. Guardar correctamente actualiza la base de comparación. Si falla la carga, se ocultan importes no verificados y las barras.
- Los rubros de ahorro muestran su objetivo guardado y remiten a Metas. No existe vínculo entre aportes a metas y rubros presupuestarios; por eso se retiró la atribución incorrecta de todos los aportes del hogar a cada rubro. El resumen global y el historial de ahorro se conservan.

## Archivos

- `src/BudgetCategoryProgress.tsx` y `src/budget-progress.css`: tarjetas reutilizables, iconos Lucide, temas, estados y semántica accesible.
- `src/lib/budgetProgress.ts`: disponibilidad en centavos, porcentajes y selección de gastos por período.
- `src/Finance.tsx` y `src/FortnightBudget.tsx`: integración en las vistas existentes y controles con etiquetas.
- `src/lib/budgetProgress.test.ts`, `src/lib/themeParity.test.ts` y `tests/e2e/budget-progress.e2e.mjs`: reglas, contrato visual y pruebas en navegador.
- `public/sw.js` y `src/lib/release.test.ts`: versión de caché v24.

## Verificación local

- Línea base: 209 pruebas existentes aprobadas antes de modificar.
- Resultado: 215 pruebas en 24 archivos aprobadas; compilación de producción aprobada.
- 27 escenarios de navegador aprobados, incluidos los 24 anteriores. Los nuevos casos cubren mes/quincenas, fechas futuras, cambios pendientes y guardados, registro de un gasto desde el formulario, exceso, ausencia de presupuesto, ahorro sin atribución duplicada y errores de carga.
- Tarjetas revisadas visualmente en claro y oscuro; sin desbordamiento horizontal a 320, 390, 768 y 1280 px. Axe sin hallazgos críticos o graves en las pantallas cubiertas. Se conserva la revisión de módulos, permisos y botones de guardado existente.

## Alcance y pendientes

No hay migraciones, cambios a Auth/RLS, servicios de pago ni modificaciones a registros reales. Las pruebas de interfaz usan datos sintéticos interceptados. El disponible es margen del presupuesto registrado, no saldo bancario ni autorización para gastar. La fecha de corte sigue el criterio local existente. Vincular aportes de ahorro a un rubro específico requeriría un desarrollo posterior.

## Prueba manual

Actualizar la PWA y abrir Finanzas → Presupuesto. Por ejemplo, Q1,000 presupuestados y Q350 gastados deben mostrar una barra al 35%, Q650 restantes y 65% disponible. En Quincenas, cambiar entre Mes completo, Primera quincena y Segunda quincena. Registrar datos ficticios únicamente en un hogar de prueba.
