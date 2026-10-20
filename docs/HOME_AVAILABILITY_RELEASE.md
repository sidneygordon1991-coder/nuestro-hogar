# Cuentas y presupuesto disponible — v0.36.0

Inicio muestra dos cifras independientes en la tarjeta principal:

- **Cuentas y efectivo:** suma de saldos registrados hoy de efectivo, cuentas bancarias/corrientes y ahorro. Incluye saldos iniciales, ingresos, pagos y transferencias reales hasta hoy. No suma ingresos esperados, límites de tarjetas, deudas, inversiones ni cuentas inactivas. El desglose separa bancos/ahorro y efectivo. Cambiar quincena, mes o base de ingresos no altera este saldo.
- **Presupuesto disponible:** ingresos recibidos del rango menos gastos incluidos en el presupuesto. Puede consultarse por primera quincena, segunda quincena y mes. Una base alternativa muestra ingresos esperados guardados menos esos mismos gastos; está rotulada como proyección y no suma los recibidos otra vez.

Se conserva la regla de v35: un pago marcado fuera del presupuesto reduce su cuenta y aparece entre los gastos reales, sin consumir el presupuesto. El resumen informa ese importe y, en Cómo se calcula, muestra también ingresos recibidos menos todos los gastos. Las transferencias propias y abonos de tarjeta no son gastos adicionales. Los aportes a metas y los gastos de categoría ahorro conservan su tratamiento separado; no se vuelven a restar como gastos del presupuesto.

## Fechas e ingresos

El control **Fechas** ofrece calendario y el ciclo guardado de cada integrante. Cuando el usuario tiene un ciclo personal distinto del calendario, se selecciona inicialmente. Un ciclo 14/29 muestra 14–28 y 29–13, incluso cuando cruza de mes. Antes del primer inicio del mes se consulta el ciclo que comenzó el mes anterior. Mes siempre muestra el mes calendario.

Todos los integrantes se comparan en el mismo rango seleccionado. La base Esperados usa la distribución guardada del mes de inicio del ciclo, igual que el módulo Quincenas; no redistribuye salarios de otros ciclos ni supone que cada persona cobra en las mismas fechas. Los ingresos reales se seleccionan por su fecha registrada. Una quincena sin distribuir o un integrante sin plan impiden presentar una cifra proyectada completa: se muestra un aviso y el acceso a Ingresos. Los planes explícitos de cero son válidos.

El resumen comienza con Recibidos y la quincena actual. Los movimientos futuros nunca se presentan como recibidos ni gastados. No hay prorrateo automático de un ingreso mensual ni traslado implícito de excedentes de otra quincena.

## Compromisos y proyección

**Ver compromisos y metas** conserva el cálculo anterior de margen después de pagos, tarjetas y ahorro reservado, con su desglose y referencia diaria. Se presenta como un cálculo adicional: no se mezcla con el saldo de las cuentas ni con el presupuesto restante.

La gráfica existente conserva su proyección por calendario y sus controles de fechas. El resumen de presupuesto tiene su propio selector, incluida la opción de ciclos personales. Los rubros, metas, agenda y controles de cuentas existentes se conservan.

## Datos, seguridad y estados

No se crean migraciones ni se modifican movimientos, planes, permisos, funciones o políticas. Las consultas usan el cliente autenticado y las políticas RLS existentes. Los ciclos guardados se leen con `get_finance_cycle_defaults`, previamente disponible y SECURITY INVOKER. Se verificó que la fuente principal incluye el indicador de presupuesto y las fechas personales.

Los rangos que cruzan de mes se leen con paginación. La vista personal filtra ingresos propios, gastos personales, partes de gastos compartidos y movimientos privados autorizados. Las partes de gastos compartidos ahora conservan `budget_included`, para que un gasto excluido no se reincorpore al presupuesto al cambiar a Personal. Los resultados tardíos se descartan al cambiar de hogar, usuario, alcance o período.

Una lectura fallida de cuentas muestra Q — para el saldo; el presupuesto puede seguir disponible si su fuente se verificó. Una lectura fallida del período muestra Q — y Reintentar período. Sin cuentas registradas se muestra cero con la indicación correspondiente; no se sustituye por ingresos menos gastos. La demostración no consulta datos de servidor. Se conserva Ocultar montos.

## Archivos y verificación

- `src/lib/homeAvailability.ts` / `.test.ts`: cálculos en centavos, separación de cifras, períodos y casos límite.
- `src/HomeBudgetAvailability.tsx`: lectura y controles del presupuesto, estados y explicación.
- `src/HomeMoneyWorkspace.tsx`, `src/styles/components/home-availability.css`: tarjeta principal, desglose y presentación adaptable.
- `src/lib/homeOverview.ts`: preservación de la clasificación al calcular partes personales.
- `src/App.tsx`: el camino de lectura compatible también solicita clasificación y fechas de ciclo.
- `tests/e2e/home-availability.e2e.mjs`: saldos, bases de ingreso, fechas, errores, temas y accesibilidad. Las pruebas anteriores de Inicio se actualizan para verificar el total de cuentas en su nueva ubicación.
- `package.json`, `package-lock.json`, `public/sw.js`, `src/lib/release.test.ts`: versión 0.36.0 y caché PWA v36.

Los resultados finales de pruebas, CI y publicación están en el PR. Para revertir la interfaz puede publicarse el commit anterior sin cambios de base de datos ni recuperación de registros.
